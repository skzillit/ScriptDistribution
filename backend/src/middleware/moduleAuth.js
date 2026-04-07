const { decrypt, generateBodyHash } = require('../utils/encryption');
const User = require('../models/User');

async function moduleAuth(req, res, next) {
  try {
    const moduleData = req.headers['moduledata'];
    if (!moduleData) {
      return res.status(401).json({ error: 'Missing moduledata header' });
    }

    // Try to parse moduledata - support both encrypted (hex) and base64 (web dev)
    let parsed;
    try {
      // First try: AES decryption (Android / production)
      const decrypted = decrypt(moduleData);
      parsed = JSON.parse(decrypted);
    } catch (err) {
      try {
        // Second try: base64 decoding (web dev mode)
        const decoded = Buffer.from(moduleData, 'base64').toString('utf8');
        parsed = JSON.parse(decoded);
      } catch (err2) {
        try {
          // Third try: plain JSON (curl testing)
          parsed = JSON.parse(moduleData);
        } catch (err3) {
          return res.status(401).json({ error: 'Invalid moduledata - could not decrypt or parse' });
        }
      }
    }

    const { device_id, project_id, user_id, time_stamp } = parsed;

    if (!device_id && !user_id) {
      return res.status(401).json({ error: 'Missing device_id or user_id in moduledata' });
    }

    // Validate bodyhash if present (skip in dev for easier testing)
    const bodyhash = req.headers['bodyhash'];
    if (bodyhash && process.env.NODE_ENV !== 'development') {
      const expectedHash = generateBodyHash(req.body, moduleData);
      if (bodyhash !== expectedHash) {
        return res.status(401).json({ error: 'Invalid bodyhash' });
      }
    }

    // Find or create user by user_id or device_id
    let user;
    if (user_id) {
      try {
        user = await User.findById(user_id);
      } catch (_) { /* invalid ObjectId, skip */ }
    }
    if (!user && device_id) {
      user = await User.findOne({ deviceId: device_id });
    }

    if (!user) {
      // Auto-register device on first request
      user = await User.create({
        name: `User-${(device_id || user_id || 'unknown').slice(-6)}`,
        deviceId: device_id || `auto-${Date.now()}`,
      });
    }

    req.user = user;
    req.moduleData = parsed;
    next();
  } catch (error) {
    next(error);
  }
}

// Optional auth - continues even without moduledata
async function optionalAuth(req, res, next) {
  const moduleData = req.headers['moduledata'];
  if (!moduleData) {
    return next();
  }
  return moduleAuth(req, res, next);
}

module.exports = { moduleAuth, optionalAuth };
