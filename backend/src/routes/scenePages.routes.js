const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const { requireRole } = require('../middleware/roleAuth');
// Pages accept PDF or Final Draft (.fdx), same as scripts.
const { scriptUpload: pdfUpload } = require('../middleware/upload');
const ctrl = require('../controllers/scenePages.controller');

// Scene folders ("Pages") attached to a script.
// Viewers can read; editors/admins can create/update/delete.
router.get('/scripts/:scriptId/pages', moduleAuth, ctrl.listScenePages);
router.post('/scripts/:scriptId/pages', moduleAuth, requireRole('admin', 'editor'), pdfUpload.single('pdf'), ctrl.createScenePage);
router.put('/pages/:id', moduleAuth, requireRole('admin', 'editor'), pdfUpload.single('pdf'), ctrl.updateScenePage);
router.delete('/pages/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.deleteScenePage);
router.get('/pages/:id/download', moduleAuth, ctrl.downloadScenePage);
router.get('/pages/:id/scenes', moduleAuth, ctrl.listScenePageScenes);

module.exports = router;
