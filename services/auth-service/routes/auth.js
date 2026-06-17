const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, role = 'participant' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Wachtwoord moet minimaal 6 tekens zijn' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email bestaat al' });
    }

    const verificationToken = uuidv4();
    
    const user = new User({
      email: email.toLowerCase(),
      password,
      role,
      verificationToken
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registratie succesvol',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Ongeldige email of wachtwoord' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Ongeldige email of wachtwoord' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login succesvol',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user._id, email: req.user.email, role: req.user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

router.put('/role', authMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['participant', 'target_owner'].includes(role)) {
      return res.status(400).json({ error: 'Ongeldige rol' });
    }

    req.user.role = role;
    await req.user.save();

    const token = jwt.sign(
      { userId: req.user._id, email: req.user.email, role: req.user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      message: 'Rol bijgewerkt',
      role: req.user.role,
      token
    });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logout succesvol' });
});

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Ongeldige verificatietoken' });
    }

    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({ message: 'Email geverifieerd' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user.resetPasswordToken = uuidv4();
      user.resetPasswordExpires = Date.now() + 3600000;
      await user.save();
    }

    res.json({ message: 'Als het email bestaat, ontvang je een reset link' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/internal/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('email role createdAt').lean();
    if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

router.get('/internal/users', async (req, res) => {
  try {
    const ids = req.query.ids ? req.query.ids.split(',').filter(Boolean) : [];
    const users = await User.find({ _id: { $in: ids } }).select('email role').lean();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Interne server error' });
  }
});

module.exports = router;
