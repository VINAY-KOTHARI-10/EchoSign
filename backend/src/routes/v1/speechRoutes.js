// src/routes/v1/speechRoutes.js
'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const { analyzeSpeech, analyzeVoice, getPronunciationHistory, getAccuracyTrend, getSkillBreakdown } = require('../../controllers/speechController');
const { authenticate } = require('../../middleware/authMiddleware');
const { speechRateLimiter } = require('../../middleware/rateLimiter');

const router = Router();
router.use(authenticate);
router.post('/analyze', speechRateLimiter,
  [
    body('targetText').notEmpty().isLength({ max: 500 }),
    body('transcribedText').notEmpty().isLength({ max: 500 }),
    body('language').optional().isLength({ min: 2, max: 10 }),
  ],
  analyzeSpeech
);
router.post('/analyze-voice', speechRateLimiter,
  [
    body('audio').isString().isLength({ min: 100, max: 480000 }),
    body('mime').optional().isLength({ max: 60 }),
    body('language').optional().isLength({ min: 2, max: 10 }),
    body('targetText').optional({ values: 'falsy' }).isLength({ max: 500 }),
    body('transcribedText').optional({ values: 'falsy' }).isLength({ max: 1000 }),
    body('scenario').optional({ values: 'falsy' }).isLength({ max: 400 }),
  ],
  analyzeVoice
);
router.get('/history', getPronunciationHistory);
router.get('/accuracy-trend', getAccuracyTrend);
router.get('/skill-breakdown', getSkillBreakdown);
module.exports = router;
