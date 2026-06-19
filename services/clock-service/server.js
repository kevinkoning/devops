require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const axios = require('axios');
const rabbitmq = require('./rabbitmq');
const { metricsMiddleware, metricsHandler } = require('./metrics');

const app = express();
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://localhost:3003';
const SCORE_SERVICE_URL = process.env.SCORE_SERVICE_URL || 'http://localhost:3006';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

async function checkDeadlines() {
  try {
    const now = new Date();

    const { data } = await axios.get(`${TARGET_SERVICE_URL}/targets?status=active&limit=100`);
    const expiredTargets = (data.targets || []).filter(t => new Date(t.deadline) <= now);

    for (const target of expiredTargets) {
      console.log(`Deadline reached for target: ${target._id}`);

      await axios.patch(`${TARGET_SERVICE_URL}/targets/${target._id}/close`).catch(err =>
        console.error('Failed to close target:', err.message)
      );

      await calculateWinners(target);
    }
  } catch (error) {
    console.error('Deadline check error:', error.message);
  }
}

async function calculateWinners(target) {
  try {
    const { data } = await axios.get(`${SCORE_SERVICE_URL}/score/submissions/target/${target._id}`);
    const submissions = data.submissions || [];

    if (submissions.length === 0) {
      console.log(`No submissions for target: ${target._id}`);
      return;
    }

    const winner = submissions[0];

    await axios.patch(`${SCORE_SERVICE_URL}/score/submissions/${winner._id}/winner`).catch(err =>
      console.error('Failed to mark winner submission:', err.message)
    );

    await axios.patch(`${TARGET_SERVICE_URL}/targets/${target._id}/winner`, {
      winnerId: winner.userId
    }).catch(err =>
      console.error('Failed to set target winner:', err.message)
    );

    let winnerUser = null;
    let ownerUser = null;

    try {
      const [winnerRes, ownerRes] = await Promise.all([
        axios.get(`${AUTH_SERVICE_URL}/auth/internal/user/${winner.userId}`),
        axios.get(`${AUTH_SERVICE_URL}/auth/internal/user/${target.ownerId}`)
      ]);
      winnerUser = winnerRes.data.user;
      ownerUser = ownerRes.data.user;
    } catch (err) {
      console.error('Failed to fetch user info:', err.message);
    }

    if (ownerUser) {
      await rabbitmq.publish('mail.winner', {
        email: ownerUser.email,
        targetTitle: target.title,
        winnerEmail: winnerUser?.email || 'Onbekend',
        score: winner.finalScore
      });
    }

    console.log(`Winner calculated for target ${target._id}: ${winner.userId}`);
  } catch (error) {
    console.error('Calculate winners error:', error.message);
  }
}

async function sendReminders() {
  try {
    const now = new Date();
    const reminderTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data } = await axios.get(`${TARGET_SERVICE_URL}/targets?status=active&limit=100`);
    const upcomingTargets = (data.targets || []).filter(t => {
      const deadline = new Date(t.deadline);
      return deadline <= reminderTime && deadline > now;
    });

    for (const target of upcomingTargets) {
      const participantsRes = await axios.get(`${TARGET_SERVICE_URL}/targets/${target._id}/participants`).catch(() => null);
      const participants = participantsRes?.data?.participants || [];

      if (participants.length === 0) continue;

      const submissionsRes = await axios.get(`${SCORE_SERVICE_URL}/score/submissions/target/${target._id}`).catch(() => null);
      const submittedUserIds = new Set((submissionsRes?.data?.submissions || []).map(s => s.userId.toString()));

      const nonSubmitters = participants.filter(p => !submittedUserIds.has(p.toString()));

      for (const userId of nonSubmitters) {
        try {
          const userRes = await axios.get(`${AUTH_SERVICE_URL}/auth/internal/user/${userId}`);
          const user = userRes.data.user;
          await rabbitmq.publish('mail.reminder', {
            email: user.email,
            targetTitle: target.title,
            deadline: target.deadline
          });
        } catch (err) {
          console.error('Failed to send reminder for user:', userId, err.message);
        }
      }

      console.log(`Reminders queued for target: ${target._id}`);
    }
  } catch (error) {
    console.error('Reminder error:', error.message);
  }
}

cron.schedule('*/1 * * * *', checkDeadlines);
cron.schedule('0 */6 * * *', sendReminders);

app.get('/clock/status', async (req, res) => {
  try {
    const { data } = await axios.get(`${TARGET_SERVICE_URL}/targets?status=active&limit=1`);
    res.json({
      activeTargets: data.total || 0,
      lastCheck: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.post('/clock/trigger', async (req, res) => {
  try {
    await checkDeadlines();
    res.json({ message: 'Deadline check triggered' });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'clock-service' });
});

app.get('/metrics', metricsHandler);

const PORT = process.env.PORT || 3005;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Clock Service running on port ${PORT}`);
    console.log('Deadline checker started (every minute)');
    console.log('Reminder sender started (every 6 hours)');
  });
}

module.exports = app;
