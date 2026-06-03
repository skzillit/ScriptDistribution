const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/debug.controller');

router.get('/versions/:versionId/scenes', moduleAuth, ctrl.versionSceneDebug);
router.get('/pages/:id/scenes', moduleAuth, ctrl.pageSceneDebug);

module.exports = router;
