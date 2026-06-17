require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.set('strictPopulate', false);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Te veel verzoeken, probeer later opnieuw' }
});

app.use('/auth', limiter);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});
