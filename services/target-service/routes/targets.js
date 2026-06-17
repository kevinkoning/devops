const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Target = require('../models/Target');
const { deleteFile } = require('../utils/minio');

const SCORE_SERVICE_URL = process.env.SCORE_SERVICE_URL || 'http://localhost:3006';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Geen geldige token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Ongeldige token' });
  }
};

const ownerMiddleware = (req, res, next) => {
  if (req.userRole !== 'target_owner' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Alleen target owners kunnen deze actie uitvoeren' });
  }
  next();
};

router.post('/', authMiddleware, ownerMiddleware, async (req, res) => {
  try {
    const { title, description, latitude, longitude, radiusMeters, deadline, imageUrl, imageId } = req.body;

    if (!title || !latitude || !longitude || !deadline) {
      return res.status(400).json({ error: 'Titel, locatie en deadline zijn verplicht' });
    }

    if (new Date(deadline) <= new Date()) {
      return res.status(400).json({ error: 'Deadline moet in de toekomst liggen' });
    }

    const target = new Target({
      ownerId: req.userId,
      title,
      description,
      imageUrl,
      imageId,
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radiusMeters: parseInt(radiusMeters) || 100
      },
      deadline: new Date(deadline)
    });

    await target.save();

    res.status(201).json({
      message: 'Target aangemaakt',
      target
    });
  } catch (error) {
    console.error('Create target error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, lat, lng, radius, limit = 20, skip = 0 } = req.query;
    
    const query = {};
    
    if (status) {
      query.status = status;
    } else {
      query.status = 'active';
    }

    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const searchRadius = parseFloat(radius) || 10;

      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: searchRadius * 1000
        }
      };
    }

    const targets = await Target.find(query)
      .lean()
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 });

    const total = await Target.countDocuments(query);

    res.json({ targets, total });
  } catch (error) {
    console.error('Get targets error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const target = await Target.findById(req.params.id).lean();

    if (!target) {
      return res.status(404).json({ error: 'Target niet gevonden' });
    }

    res.json({ target });
  } catch (error) {
    console.error('Get target error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.put('/:id', authMiddleware, ownerMiddleware, async (req, res) => {
  try {
    const target = await Target.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ error: 'Target niet gevonden' });
    }

    if (target.ownerId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Je bent niet de eigenaar van deze target' });
    }

    const { title, description, latitude, longitude, radiusMeters, deadline } = req.body;

    if (title) target.title = title;
    if (description) target.description = description;
    if (latitude && longitude) {
      target.location.latitude = parseFloat(latitude);
      target.location.longitude = parseFloat(longitude);
    }
    if (radiusMeters) target.location.radiusMeters = parseInt(radiusMeters);
    if (deadline) target.deadline = new Date(deadline);

    await target.save();

    res.json({ message: 'Target bijgewerkt', target });
  } catch (error) {
    console.error('Update target error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.delete('/:id', authMiddleware, ownerMiddleware, async (req, res) => {
  try {
    const target = await Target.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ error: 'Target niet gevonden' });
    }

    if (target.ownerId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Je bent niet de eigenaar van deze target' });
    }

    if (target.imageId) {
      try {
        await deleteFile(target.imageId);
      } catch (err) {
        console.error('Failed to delete image:', err);
      }
    }

    await Target.findByIdAndDelete(req.params.id);

    res.json({ message: 'Target verwijderd' });
  } catch (error) {
    console.error('Delete target error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/:id/submissions', async (req, res) => {
  try {
    const response = await axios.get(`${SCORE_SERVICE_URL}/score/submissions/target/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error('Get submissions error:', error.message);
    res.status(502).json({ error: 'Score service niet beschikbaar' });
  }
});

router.post('/:id/participants', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is verplicht' });

    const target = await Target.findById(req.params.id).lean();
    if (!target) return res.status(404).json({ error: 'Target niet gevonden' });
    if (target.status !== 'active') return res.status(400).json({ error: 'Target is niet actief' });
    if (new Date() > new Date(target.deadline)) return res.status(400).json({ error: 'Deadline is verstreken' });

    await Target.updateOne({ _id: req.params.id }, { $addToSet: { participants: userId } });
    res.json({ message: 'Succesvol geregistreerd voor target' });
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.delete('/:id/participants/:userId', async (req, res) => {
  try {
    await Target.updateOne({ _id: req.params.id }, { $pull: { participants: req.params.userId } });
    res.json({ message: 'Succesvol uitgeschreven' });
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/:id/participants', async (req, res) => {
  try {
    const target = await Target.findById(req.params.id).select('participants').lean();
    if (!target) return res.status(404).json({ error: 'Target niet gevonden' });
    res.json({ participants: target.participants || [], count: target.participants?.length || 0 });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.patch('/:id/close', async (req, res) => {
  try {
    await Target.findByIdAndUpdate(req.params.id, { status: 'closed' });
    res.json({ message: 'Target gesloten' });
  } catch (error) {
    console.error('Close target error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.patch('/:id/winner', async (req, res) => {
  try {
    const { winnerId } = req.body;
    await Target.findByIdAndUpdate(req.params.id, { winnerId });
    res.json({ message: 'Winnaar ingesteld' });
  } catch (error) {
    console.error('Set winner error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/internal/owner/:ownerId', async (req, res) => {
  try {
    const targets = await Target.find({ ownerId: req.params.ownerId }).sort({ createdAt: -1 }).lean();
    res.json({ targets });
  } catch (error) {
    console.error('Get owner targets error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/owner/my-targets', authMiddleware, ownerMiddleware, async (req, res) => {
  try {
    const targets = await Target.find({ ownerId: req.userId })
      .sort({ createdAt: -1 });

    res.json({ targets });
  } catch (error) {
    console.error('Get my targets error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

module.exports = router;
