const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/highlight.controller');

router.get('/:versionId', optionalAuth, ctrl.getHighlightedScript);
router.get('/:versionId/page/:pageNumber', optionalAuth, ctrl.getHighlightedPage);

module.exports = router;
