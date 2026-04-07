const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const { requireRole } = require('../middleware/roleAuth');
const { pdfUpload } = require('../middleware/upload');
const ctrl = require('../controllers/scripts.controller');

// Scripts — viewers can read, editors/admins can write
router.get('/', moduleAuth, ctrl.listScripts);
router.post('/', moduleAuth, requireRole('admin', 'editor'), ctrl.createScript);
router.get('/active', moduleAuth, ctrl.getActiveScript);
router.get('/history', moduleAuth, ctrl.listHistory);
router.get('/:id', moduleAuth, ctrl.getScript);
router.put('/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.updateScript);
router.delete('/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.deleteScript);
router.post('/:id/collaborators', moduleAuth, requireRole('admin', 'editor'), ctrl.addCollaborator);
router.post('/:id/restore', moduleAuth, requireRole('admin', 'editor'), ctrl.restoreScript);

// Versions
router.get('/:scriptId/versions', moduleAuth, ctrl.listVersions);
router.post('/:scriptId/versions', moduleAuth, requireRole('admin', 'editor'), pdfUpload.single('pdf'), ctrl.uploadVersion);

module.exports = router;
