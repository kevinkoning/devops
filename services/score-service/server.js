require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const Minio = require('minio');
const Opossum = require('opossum');
const rabbitmq = require('./rabbitmq');

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://localhost:3003';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

mongoose.set('strictPopulate', false);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

console.log('MINIO_ENDPOINT:', process.env.MINIO_ENDPOINT);
console.log('MINIO_PORT:', process.env.MINIO_PORT);

const imaggaOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
  rollingCountTimeout: 30000
};

const imaggaFetcher = async (options) => {
  const form = new FormData();
  form.append('image', options.buffer);
  
  const response = await axios.post('https://api.imagga.com/v2/tags', form, {
    auth: { username: options.apiKey, password: options.apiSecret },
    headers: form.getHeaders(),
    timeout: 60000
  });
  
  return response.data;
};

const imaggaCircuitBreaker = new Opossum(imaggaFetcher, imaggaOptions);

imaggaCircuitBreaker.on('success', () => console.log('Imagga request successful'));
imaggaCircuitBreaker.on('failure', (error) => console.error('Imagga circuit breaker failure:', error.message));
imaggaCircuitBreaker.on('open', () => console.warn('Imagga circuit breaker OPEN - service unavailable'));
imaggaCircuitBreaker.on('halfOpen', () => console.log('Imagga circuit breaker HALF-OPEN - testing service'));
imaggaCircuitBreaker.on('close', () => console.log('Imagga circuit breaker CLOSED - service recovered'));

const SubmissionSchema = new mongoose.Schema({}, { strict: false });
SubmissionSchema.set('collection', 'submissions');
const Submission = mongoose.model('Submission', SubmissionSchema);

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'photoprestiges-images';

async function uploadToMinio(buffer, fileName) {
  try {
    await minioClient.putObject(BUCKET_NAME, fileName, buffer, null, 'image/jpeg');
    return `http://localhost/images/${fileName}`;
  } catch (error) {
    console.error('MinIO upload error:', error);
    throw error;
  }
}

async function getImageLabels(buffer, isExternalUrl = false) {
  const apiKey = process.env.IMAGGA_API_KEY;
  const apiSecret = process.env.IMAGGA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.warn('Imagga API credentials not configured, using random score');
    return { labels: [], score: Math.floor(Math.random() * 30) + 70 };
  }

  try {
    if (isExternalUrl) {
      const response = await axios.get(`https://api.imagga.com/v2/tags?image_url=${encodeURIComponent(buffer)}`, {
        auth: { username: apiKey, password: apiSecret },
        timeout: 15000
      });
      const tags = response.data.result.tags || [];
      return {
        labels: tags.slice(0, 10).map(t => ({ tag: t.tag.en, confidence: t.confidence })),
        score: null
      };
    } else {
      console.log('Sending to Imagga via circuit breaker, buffer size:', buffer.length);
      
      if (imaggaCircuitBreaker.status.state === 'open') {
        console.warn('Imagga circuit breaker is OPEN - using fallback score');
        return { labels: [], score: Math.floor(Math.random() * 30) + 70 };
      }
      
      try {
        const result = await imaggaCircuitBreaker.fire({
          buffer,
          apiKey,
          apiSecret
        });

        console.log('Imagga response via circuit breaker:', JSON.stringify(result).substring(0, 500));
        const tags = result.result ? result.result.tags : [];
        return {
          labels: tags.slice(0, 10).map(t => ({ tag: t.tag.en, confidence: t.confidence })),
          score: null
        };
      } catch (error) {
        console.error('Imagga request failed:', error.message);
        return { labels: [], score: Math.floor(Math.random() * 30) + 70 };
      }
    }
  } catch (error) {
    console.error('Imagga API error:', error.message);
    return { labels: [], score: Math.floor(Math.random() * 30) + 70 };
  }
}

function calculateJaccardSimilarity(labels1, labels2) {
  const set1 = new Set(labels1.map(l => l.tag.toLowerCase()));
  const set2 = new Set(labels2.map(l => l.tag.toLowerCase()));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;
  return (intersection.size / union.size) * 100;
}

function calculateFinalScore(imageSimilarity, targetCreatedAt, submissionTime) {
  const hoursTaken = (submissionTime - targetCreatedAt) / (1000 * 60 * 60);
  const speedBonus = Math.max(0, 100 - (hoursTaken * 5));
  
  const finalScore = (imageSimilarity * 0.7) + (speedBonus * 0.3);
  return Math.round(finalScore * 100) / 100;
}

app.post('/score/submit', async (req, res) => {
  try {
    const { targetId, userId, imageBase64, imageId } = req.body;

    if (!targetId || !userId || !imageBase64) {
      return res.status(400).json({ error: 'Ontbrekende verplichte velden' });
    }

    let target;
    try {
      const targetRes = await axios.get(`${TARGET_SERVICE_URL}/targets/${targetId}`);
      target = targetRes.data.target;
    } catch (err) {
      return res.status(404).json({ error: 'Target niet gevonden' });
    }

    if (target.status !== 'active') {
      return res.status(400).json({ error: 'Target is niet meer actief' });
    }

    if (new Date() > new Date(target.deadline)) {
      return res.status(400).json({ error: 'Deadline is verstreken' });
    }

    const existingSubmission = await Submission.findOne({ targetId, userId });
    if (existingSubmission) {
      return res.status(400).json({ error: 'Je hebt al een foto ingestuurd voor deze target' });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const fileName = `submissions/${targetId}/${imageId || Date.now()}.jpg`;
    const submissionUrl = await uploadToMinio(buffer, fileName);

    let targetImageBuffer;
    try {
      const targetResponse = await axios.get(target.imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
      targetImageBuffer = Buffer.from(targetResponse.data);
    } catch (err) {
      console.error('Failed to download target image:', err.message);
      targetImageBuffer = buffer;
    }

    const [targetLabels, submissionLabels] = await Promise.all([
      getImageLabels(targetImageBuffer, false),
      getImageLabels(buffer, false)
    ]);

    const imageSimilarity = calculateJaccardSimilarity(
      targetLabels.labels,
      submissionLabels.labels
    );

    const submittedAt = new Date();
    const finalScore = calculateFinalScore(
      imageSimilarity,
      target.createdAt,
      submittedAt
    );

    const submission = new Submission({
      targetId,
      userId,
      imageUrl: submissionUrl,
      imageId: fileName,
      score: imageSimilarity,
      finalScore,
      labels: submissionLabels.labels,
      submittedAt,
      status: 'scored'
    });

    await submission.save();

    let user = null;
    try {
      const userRes = await axios.get(`${AUTH_SERVICE_URL}/auth/internal/user/${userId}`);
      user = userRes.data.user;
    } catch (err) { /* non-critical */ }

    if (user) {
      const targetSubmissions = await Submission.find({ targetId })
        .sort({ finalScore: -1 });
      const rank = targetSubmissions.findIndex(s => s._id.toString() === submission._id.toString()) + 1;

      try {
        await rabbitmq.publish('mail.score', {
          email: user.email,
          targetTitle: target.title,
          score: Math.round(imageSimilarity),
          finalScore: Math.round(finalScore),
          rank
        });
      } catch (err) {
        console.error('Failed to queue score email:', err.message);
      }
    }

    res.json({
      message: 'Foto beoordeeld',
      submissionId: submission._id,
      score: Math.round(imageSimilarity),
      finalScore: Math.round(finalScore),
      labels: submissionLabels.labels
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.get('/score/submission/:id', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('userId', 'email');

    if (!submission) {
      return res.status(404).json({ error: 'Inzending niet gevonden' });
    }

    res.json({ submission });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.get('/score/user/:userId', async (req, res) => {
  try {
    const submissions = await Submission.find({ userId: req.params.userId })
      .populate('targetId', 'title deadline status');

    res.json({ submissions });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.delete('/score/submission/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Geen token' });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Inzending niet gevonden' });
    }

    await Submission.findByIdAndDelete(req.params.id);

    res.json({ message: 'Inzending verwijderd' });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.post('/score/rate/:id', async (req, res) => {
  try {
    const { userId, rating } = req.body;

    if (!['thumbsUp', 'thumbsDown'].includes(rating)) {
      return res.status(400).json({ error: 'Ongeldige rating' });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Inzending niet gevonden' });
    }

    if (!submission.thumbsUp) submission.thumbsUp = [];
    if (!submission.thumbsDown) submission.thumbsDown = [];

    const oppositeRating = rating === 'thumbsUp' ? 'thumbsDown' : 'thumbsUp';
    submission[oppositeRating] = submission[oppositeRating].filter(id => id.toString() !== userId);

    if (!submission[rating].includes(userId)) {
      submission[rating].push(userId);
    }

    await submission.save();

    res.json({ message: 'Rating geregistreerd', submission });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.get('/score/submissions/target/:targetId', async (req, res) => {
  try {
    const submissions = await Submission.find({ targetId: req.params.targetId })
      .sort({ finalScore: -1, submittedAt: 1 })
      .lean();
    res.json({ submissions, count: submissions.length });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.patch('/score/submissions/:id/winner', async (req, res) => {
  try {
    await Submission.findByIdAndUpdate(req.params.id, { status: 'winner' });
    res.json({ message: 'Winnaar gemarkeerd' });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.get('/score/leaderboard', async (req, res) => {
  try {
    const { targetId, limit = 10 } = req.query;

    if (targetId) {
      const submissions = await Submission.find({ targetId })
        .sort({ finalScore: -1 })
        .limit(parseInt(limit))
        .lean();
      return res.json({ submissions });
    }

    const leaderboard = await Submission.aggregate([
      { $match: { status: { $in: ['scored', 'winner'] } } },
      { $group: { _id: '$userId', totalScore: { $sum: '$finalScore' }, bestScore: { $max: '$finalScore' }, count: { $sum: 1 } } },
      { $sort: { totalScore: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json({ leaderboard });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'score-service' });
});

app.get('/score/circuit-status', (req, res) => {
  res.json({
    imagga: {
      state: imaggaCircuitBreaker.status.state,
      status: imaggaCircuitBreaker.status,
      failures: imaggaCircuitBreaker.stats.failures,
      successes: imaggaCircuitBreaker.stats.successes,
      rejects: imaggaCircuitBreaker.stats.rejects,
      pending: imaggaCircuitBreaker.stats.pending
    }
  });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Score Service running on port ${PORT}`);
});
