// src/routes/v1/classroomRoutes.js
'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/authMiddleware');
const c = require('../../controllers/classroomController');

const router = Router();
router.use(authenticate);

router.post('/', c.createClassroom);
router.get('/', c.listMine);
// Fixed paths must come before '/:code'
router.get('/stats', c.teacherStats);
router.get('/attended', c.attended);

router.get('/:code', c.getClassroom);
router.patch('/:code', c.updateClassroom);
router.get('/:code/captions', c.getCaptions);
router.post('/:code/captions', c.postCaption);
router.patch('/:code/captions/:id', c.editCaption);
router.get('/:code/transcript', c.getTranscript);
router.get('/:code/export', c.exportTranscript);
router.post('/:code/end', c.endClassroom);
router.post('/:code/reopen', c.reopenClassroom);
router.post('/:code/translate', c.translate);
router.get('/:code/summary', c.getSummary);
router.post('/:code/summary', c.generateSummary);
router.post('/:code/ask', c.askAboutLecture);
router.get('/:code/insights', c.getInsights);
router.put('/:code/members/:userId/role', c.setMemberRole);

module.exports = router;
