const express = require('express');
const router = express.Router();
const { moduleAuth, optionalAuth } = require('../middleware/moduleAuth');
const { requireRole } = require('../middleware/roleAuth');
const { pdfUpload } = require('../middleware/upload');
const ctrl = require('../controllers/schedule.controller');

router.post('/schedules', moduleAuth, requireRole('admin', 'editor'), pdfUpload.single('pdf'), ctrl.uploadSchedule);
router.get('/schedules', moduleAuth, ctrl.listSchedules);
router.get('/schedules/:id', moduleAuth, ctrl.getSchedule);
router.put('/schedules/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.updateSchedule);
router.delete('/schedules/:id', moduleAuth, requireRole('admin', 'editor'), ctrl.deleteSchedule);
router.get('/schedules/:id/download', moduleAuth, ctrl.downloadSchedule);
router.get('/schedules/:id/view', optionalAuth, ctrl.viewScheduleHtml);

module.exports = router;
