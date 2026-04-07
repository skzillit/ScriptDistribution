const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/scripts.controller');
const analyticsCtrl = require('../controllers/analytics.controller');

router.get('/:versionId', moduleAuth, ctrl.getVersion);
router.get('/:versionId/pages', moduleAuth, ctrl.getPages);
router.get('/:versionId/pages/:pageNumber', moduleAuth, ctrl.getPage);
router.get('/:versionId/download', moduleAuth, analyticsCtrl.downloadVersion);

module.exports = router;
