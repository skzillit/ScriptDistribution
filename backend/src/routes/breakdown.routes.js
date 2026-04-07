const express = require('express');
const router = express.Router();
const { moduleAuth } = require('../middleware/moduleAuth');
const ctrl = require('../controllers/breakdown.controller');

router.post('/versions/:versionId/breakdown', moduleAuth, ctrl.triggerBreakdown);
router.get('/versions/:versionId/breakdown', moduleAuth, ctrl.getBreakdown);
router.put('/breakdown/:breakdownId/elements/:elementId', moduleAuth, ctrl.updateElement);
router.post('/breakdown/:breakdownId/elements', moduleAuth, ctrl.addElement);
router.delete('/breakdown/:breakdownId/elements/:elementId', moduleAuth, ctrl.deleteElement);

module.exports = router;
