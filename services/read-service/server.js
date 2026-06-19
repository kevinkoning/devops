require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { metricsMiddleware, metricsHandler } = require('./metrics');

const app = express();
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://localhost:3003';
const SCORE_SERVICE_URL = process.env.SCORE_SERVICE_URL || 'http://localhost:3006';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

async function batchUsers(ids) {
  if (!ids || ids.length === 0) return {};
  try {
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    const res = await axios.get(`${AUTH_SERVICE_URL}/auth/internal/users?ids=${uniqueIds.join(',')}`);
    const map = {};
    (res.data.users || []).forEach(u => { map[u._id.toString()] = u.email; });
    return map;
  } catch {
    return {};
  }
}

app.get('/read/targets', async (req, res) => {
  try {
    const { status = 'active', limit = 20, skip = 0 } = req.query;
    const response = await axios.get(`${TARGET_SERVICE_URL}/targets`, {
      params: { status, limit, skip }
    });
    res.json(response.data);
  } catch (error) {
    res.status(502).json({ error: 'Target service niet beschikbaar' });
  }
});

app.get('/read/targets/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 10, limit = 20 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'Latitude en longitude zijn verplicht' });

    const response = await axios.get(`${TARGET_SERVICE_URL}/targets`, {
      params: { lat, lng, radius, limit, status: 'active' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(502).json({ error: 'Target service niet beschikbaar' });
  }
});

app.get('/read/target/:id', async (req, res) => {
  try {
    const [targetRes, submissionsRes] = await Promise.all([
      axios.get(`${TARGET_SERVICE_URL}/targets/${req.params.id}`),
      axios.get(`${SCORE_SERVICE_URL}/score/submissions/target/${req.params.id}`).catch(() => ({ data: { submissions: [] } }))
    ]);

    const target = targetRes.data.target;
    const submissions = submissionsRes.data.submissions || [];

    const allUserIds = [
      target.ownerId,
      ...(target.participants || []),
      ...submissions.map(s => s.userId)
    ];
    const userMap = await batchUsers(allUserIds);

    target.ownerEmail = userMap[target.ownerId?.toString()] || null;
    const enrichedSubmissions = submissions.map(s => ({
      ...s,
      userEmail: userMap[s.userId?.toString()] || null
    }));

    res.json({ target, submissions: enrichedSubmissions, submissionCount: submissions.length });
  } catch (error) {
    const status = error.response?.status || 502;
    res.status(status).json({ error: 'Target niet gevonden of service niet beschikbaar' });
  }
});

app.get('/read/leaderboard', async (req, res) => {
  try {
    const { targetId, limit = 10 } = req.query;

    const leaderboardRes = await axios.get(`${SCORE_SERVICE_URL}/score/leaderboard`, {
      params: { targetId, limit }
    });

    if (targetId) {
      const submissions = leaderboardRes.data.submissions || [];
      const userIds = submissions.map(s => s.userId);
      const userMap = await batchUsers(userIds);
      return res.json({
        submissions: submissions.map(s => ({ ...s, userEmail: userMap[s.userId?.toString()] || null }))
      });
    }

    const leaderboard = leaderboardRes.data.leaderboard || [];
    const userIds = leaderboard.map(e => e._id);
    const userMap = await batchUsers(userIds);

    res.json({
      leaderboard: leaderboard.map(e => ({
        userId: e._id,
        email: userMap[e._id?.toString()] || 'Onbekend',
        totalScore: e.totalScore,
        bestScore: e.bestScore,
        count: e.count
      }))
    });
  } catch (error) {
    res.status(502).json({ error: 'Score service niet beschikbaar' });
  }
});

app.get('/read/stats', async (req, res) => {
  try {
    const [targetsRes, activeRes] = await Promise.all([
      axios.get(`${TARGET_SERVICE_URL}/targets?limit=1`),
      axios.get(`${TARGET_SERVICE_URL}/targets?status=active&limit=1`)
    ]);

    res.json({
      totalTargets: targetsRes.data.total || 0,
      activeTargets: activeRes.data.total || 0
    });
  } catch (error) {
    res.status(502).json({ error: 'Services niet beschikbaar' });
  }
});

app.get('/read/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const [userRes, submissionsRes, targetsRes] = await Promise.all([
      axios.get(`${AUTH_SERVICE_URL}/auth/internal/user/${userId}`),
      axios.get(`${SCORE_SERVICE_URL}/score/user/${userId}`).catch(() => ({ data: { submissions: [] } })),
      axios.get(`${TARGET_SERVICE_URL}/targets/internal/owner/${userId}`).catch(() => ({ data: { targets: [] } }))
    ]);

    const user = userRes.data.user;
    const submissions = submissionsRes.data.submissions || [];
    const targets = targetsRes.data.targets || [];

    res.json({
      user,
      submissions,
      ownedTargets: targets,
      stats: {
        totalSubmissions: submissions.length,
        totalTargets: targets.length,
        wins: submissions.filter(s => s.status === 'winner').length
      }
    });
  } catch (error) {
    const status = error.response?.status || 502;
    res.status(status).json({ error: 'Gebruiker niet gevonden of service niet beschikbaar' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'read-service' });
});

app.get('/metrics', metricsHandler);

const PORT = process.env.PORT || 3007;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Read Service running on port ${PORT}`);
  });
}

module.exports = app;
