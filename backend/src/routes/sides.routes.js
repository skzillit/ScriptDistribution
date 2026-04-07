const express = require('express');
const router = express.Router();
const { moduleAuth, optionalAuth } = require('../middleware/moduleAuth');
const { requireRole } = require('../middleware/roleAuth');
const { pdfUpload } = require('../middleware/upload');
const ctrl = require('../controllers/sides.controller');

// Call Sheets — editors/admins can upload/edit, viewers can read
router.post('/callsheets', moduleAuth, requireRole('admin', 'editor'), pdfUpload.single('pdf'), ctrl.uploadCallSheet);
router.get('/callsheets', moduleAuth, ctrl.listCallSheets);
router.get('/callsheets/:id', moduleAuth, ctrl.getCallSheet);
router.put('/callsheets/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.updateCallSheet);
router.delete('/callsheets/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.deleteCallSheet);
router.get('/callsheets/:id/view', optionalAuth, ctrl.viewCallSheetHtml);
router.get('/callsheets/:id/download', moduleAuth, ctrl.downloadCallSheet);

// Scene extraction from script
router.get('/versions/:versionId/scenes', moduleAuth, ctrl.getScriptScenes);

// Sides — editors/admins can generate/delete, viewers can view/download
router.post('/sides', moduleAuth, requireRole('admin', 'editor'), ctrl.generateSides);
router.get('/sides', moduleAuth, ctrl.listSides);
router.get('/sides/:id', moduleAuth, ctrl.getSides);
router.get('/sides/:id/download', moduleAuth, ctrl.downloadSides);
router.get('/sides/:id/view', optionalAuth, ctrl.getSidesHtml);
router.delete('/sides/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.deleteSides);

module.exports = router;
