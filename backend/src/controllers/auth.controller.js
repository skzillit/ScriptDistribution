const User = require('../models/User');

async function getMe(req, res) {
  res.json({ user: req.user });
}

async function registerDevice(req, res) {
  const { name, email } = req.body;
  const user = req.user;

  if (name) user.name = name;
  if (email) user.email = email;
  await user.save();

  res.json({ user });
}

async function updateProfile(req, res) {
  const { name, email, avatarUrl, role } = req.body;
  const user = req.user;

  if (name) user.name = name;
  if (email) user.email = email;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  if (role && ['admin', 'editor', 'viewer'].includes(role)) user.role = role;
  await user.save();

  res.json({ user });
}

module.exports = { getMe, registerDevice, updateProfile };
