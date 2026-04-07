const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/analytics.controller');

router.post('/event', moduleAuth, ctrl.recordEvent);
router.get('/scripts/:scriptId', moduleAuth, ctrl.getAnalytics);
router.get('/scripts/:scriptId/viewers', moduleAuth, ctrl.getViewers);
router.get('/scripts/:scriptId/downloads', moduleAuth, ctrl.getDownloads);

module.exports = router;
