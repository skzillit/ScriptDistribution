const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/scriptBreakdown.controller');

// Scene list for a script version
router.get('/versions/:versionId/scenes-list', moduleAuth, ctrl.getScenesList);

// Categories
router.get('/scripts/:scriptId/breakdown/categories', moduleAuth, ctrl.getCategories);

// Breakdown sheet for a scene
router.get('/scripts/:scriptId/breakdown/scenes/:sceneId', moduleAuth, ctrl.getBreakdownSheet);

// Tag text selection
router.post('/scripts/:scriptId/breakdown/scenes/:sceneId/tag', moduleAuth, ctrl.tagText);

// Remove tag
router.delete('/scripts/:scriptId/breakdown/tags/:tagId', moduleAuth, ctrl.removeTag);

// AI analyze scene
router.post('/scripts/:scriptId/breakdown/scenes/:sceneId/ai-analyze', moduleAuth, ctrl.aiAnalyze);

// Bulk accept/reject AI suggestions
router.post('/scripts/:scriptId/breakdown/scenes/:sceneId/bulk-decisions', moduleAuth, ctrl.bulkDecisions);

// All elements in project
router.get('/scripts/:scriptId/breakdown/elements', moduleAuth, ctrl.getElements);

// Update scene metadata (location, synopsis, cast_ids)
router.patch('/scripts/:scriptId/scenes/:sceneId', moduleAuth, ctrl.updateScene);

// Get all cast members in project
router.get('/scripts/:scriptId/cast', moduleAuth, ctrl.getCast);

module.exports = router;
