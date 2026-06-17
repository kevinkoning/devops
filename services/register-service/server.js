require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://localhost:3003';

app.post('/participate', async (req, res) => {
  try {
    const { targetId, userId } = req.body;

    const response = await axios.post(`${TARGET_SERVICE_URL}/targets/${targetId}/participants`, { userId });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'Interne server error';
    res.status(status).json({ error: message });
  }
});

app.post('/unsubscribe', async (req, res) => {
  try {
    const { targetId, userId } = req.body;

    const response = await axios.delete(`${TARGET_SERVICE_URL}/targets/${targetId}/participants/${userId}`);
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'Interne server error';
    res.status(status).json({ error: message });
  }
});

app.get('/participants/:targetId', async (req, res) => {
  try {
    const response = await axios.get(`${TARGET_SERVICE_URL}/targets/${req.params.targetId}/participants`);
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'Interne server error';
    res.status(status).json({ error: message });
  }
});

app.post('/api/register/close', async (req, res) => {
  try {
    const { targetId } = req.body;
    const response = await axios.patch(`${TARGET_SERVICE_URL}/targets/${targetId}/close`);
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error || 'Interne server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'register-service' });
});

const PORT = process.env.PORT || 3002;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Register Service running on port ${PORT}`);
  });
}

module.exports = app;
