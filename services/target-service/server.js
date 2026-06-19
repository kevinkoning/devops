require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const targetRoutes = require('./routes/targets');
const { uploadFileCircuitBreaker } = require('./utils/minio');
const { metricsMiddleware, metricsHandler } = require('./metrics');

const app = express();

app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

mongoose.set('strictPopulate', false);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/targets', targetRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'target-service' });
});

app.get('/metrics', metricsHandler);

app.get('/targets/circuit-status', (req, res) => {
  res.json({
    minio: {
      state: uploadFileCircuitBreaker.status.state,
      status: uploadFileCircuitBreaker.status,
      failures: uploadFileCircuitBreaker.stats.failures,
      successes: uploadFileCircuitBreaker.stats.successes,
      rejects: uploadFileCircuitBreaker.stats.rejects,
      pending: uploadFileCircuitBreaker.stats.pending
    }
  });
});

const PORT = process.env.PORT || 3003;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Target Service running on port ${PORT}`);
  });
}

module.exports = app;
