const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const { requireRole } = require('../middleware/roleAuth');
const ctrl = require('../controllers/manualScenes.controller');

router.get('/versions/:versionId/manual-scenes', moduleAuth, ctrl.listManualScenes);
router.post('/versions/:versionId/manual-scenes', moduleAuth, requireRole('admin', 'editor'), ctrl.createManualScene);
router.put('/manual-scenes/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.updateManualScene);
router.delete('/manual-scenes/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.deleteManualScene);

module.exports = router;
