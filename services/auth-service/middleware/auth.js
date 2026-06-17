const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Geen geldige token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Gebruiker niet gevonden' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token verlopen' });
    }
    return res.status(401).json({ error: 'Ongeldige token' });
  }
};

const ownerMiddleware = async (req, res, next) => {
  if (req.user.role !== 'target_owner' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Alleen target owners kunnen deze actie uitvoeren' });
  }
  next();
};

const adminMiddleware = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Alleen admins kunnen deze actie uitvoeren' });
  }
  next();
};

module.exports = { authMiddleware, ownerMiddleware, adminMiddleware, JWT_SECRET };
