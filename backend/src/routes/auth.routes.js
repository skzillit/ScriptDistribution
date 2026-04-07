const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const { getMe, registerDevice, updateProfile } = require('../controllers/auth.controller');

router.get('/me', moduleAuth, getMe);
router.post('/register-device', moduleAuth, registerDevice);
router.put('/profile', moduleAuth, updateProfile);

module.exports = router;
