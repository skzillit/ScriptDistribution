const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/scripts.controller');

router.get('/:versionId', moduleAuth, ctrl.getVersion);
router.get('/:versionId/pages', moduleAuth, ctrl.getPages);
router.get('/:versionId/pages/:pageNumber', moduleAuth, ctrl.getPage);
router.get('/:versionId/download', moduleAuth, ctrl.downloadVersion);

module.exports = router;
