// src/routes/v1/classroomRoutes.js
'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/authMiddleware');
const c = require('../../controllers/classroomController');

const router = Router();
router.use(authenticate);

router.post('/', c.createClassroom);
router.get('/', c.listMine);
router.get('/:code', c.getClassroom);
router.patch('/:code', c.updateClassroom);
router.get('/:code/captions', c.getCaptions);
router.patch('/:code/captions/:id', c.editCaption);
router.post('/:code/end', c.endClassroom);
router.post('/:code/reopen', c.reopenClassroom);
router.post('/:code/translate', c.translate);
router.post('/:code/summary', c.generateSummary);
router.get('/:code/insights', c.getInsights);
router.put('/:code/members/:userId/role', c.setMemberRole);

module.exports = router;
