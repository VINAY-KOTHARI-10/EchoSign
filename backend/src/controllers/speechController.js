// src/controllers/speechController.js
// Speech Analysis Controller - Groq API Integration for pronunciation analysis

'use strict';

const { validationResult } = require('express-validator');
const PronunciationRecord = require('../models/mongo/PronunciationRecord');
const UserActivity = require('../models/mongo/UserActivity');
const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const logger = require('../utils/logger');
const { MODEL, extraParams } = require('../utils/groq');

/**
 * Analyze pronunciation using Groq API
 * POST /api/v1/speech/analyze
 */
const analyzeSpeech = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, details: errors.array() });
    }

    const { targetText, transcribedText, language = 'en', sessionId } = req.body;
    const userId = req.user.id;

    // ─── Call Groq API for pronunciation analysis ─────────────────────────────
    const groqAnalysis = await callGroqAPI(targetText, transcribedText, language);

    // ─── Store in MongoDB ─────────────────────────────────────────────────────
    // Only real AI analyses are stored. A plain word comparison is shown to the person but never recorded, so it can
    // never count towards pronunciation statistics.
    const record = groqAnalysis.ai === false ? null : await PronunciationRecord.create({
      userId,
      sessionId: sessionId || `session_${Date.now()}`,
      language,
      targetText,
      transcribedText,
      overallAccuracy: groqAnalysis.overallAccuracy,
      fluencyScore: groqAnalysis.fluencyScore,
      intonationScore: groqAnalysis.intonationScore,
      stressScore: groqAnalysis.stressScore,
      phonemeAnalysis: groqAnalysis.phonemeAnalysis,
      aiSuggestions: groqAnalysis.suggestions,
      wordsBreakdown: groqAnalysis.wordsBreakdown,
      geminiResponse: groqAnalysis.raw, // field name kept for DB compatibility
    });

    // ─── Update User Activity (MongoDB) ──────────────────────────────────────
    await UserActivity.findOneAndUpdate(
      { userId },
      {
        $inc: { totalSessions: 0 },
        $push: {
          'recentSessions': {
            $each: [],
            $slice: -50,
          },
        },
      },
      { upsert: true }
    );

    // ─── Emit real-time update via Socket.IO ──────────────────────────────────
    const io = req.app.get('io');
    if (io && record) {
      io.to(`user:${userId}`).emit('pronunciation:analyzed', {
        recordId: record ? record._id : null,
        accuracy: groqAnalysis.overallAccuracy,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      data: {
        recordId: record ? record._id : null,
        ai: groqAnalysis.ai !== false,
        provider: groqAnalysis.provider || 'groq',
        overallAccuracy: groqAnalysis.overallAccuracy,
        fluencyScore: groqAnalysis.fluencyScore,
        intonationScore: groqAnalysis.intonationScore,
        stressScore: groqAnalysis.stressScore,
        suggestions: groqAnalysis.suggestions,
        wordsBreakdown: groqAnalysis.wordsBreakdown,
        phonemeAnalysis: groqAnalysis.phonemeAnalysis,
      },
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Groq API call for speech analysis
 * Model is set in utils/groq.js (GROQ_MODEL)
 * Falls back to a plain word comparison (basicComparison) if the API key is missing or the call fails
 */
async function callGroqAPI(targetText, transcribedText, language) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    logger.warn('GROQ_API_KEY not set: giving a word-match comparison only');
    return basicComparison(targetText, transcribedText, 'no AI key configured');
  }

  const prompt = `You are an expert speech pathologist and language teacher specializing in pronunciation analysis.

Analyze the pronunciation accuracy by comparing:
- TARGET TEXT (what the learner was supposed to say): "${targetText}"
- TRANSCRIBED SPEECH (what was actually said): "${transcribedText}"
- LANGUAGE: ${language}

Respond ONLY with this exact JSON format, no extra text, no markdown, no backticks:
{
  "overallAccuracy": <0-100 number>,
  "fluencyScore": <0-100 number>,
  "intonationScore": <0-100 number>,
  "stressScore": <0-100 number>,
  "wordsBreakdown": [
    {
      "word": "<word>",
      "score": <0-100>,
      "status": "correct|close|incorrect",
      "note": "<brief note if incorrect, null if correct>"
    }
  ],
  "phonemeAnalysis": [
    {
      "phoneme": "<IPA symbol>",
      "expected": "<expected pronunciation>",
      "spoken": "<what was spoken>",
      "score": <0-100>,
      "issue": "<substitution|deletion|insertion|null>"
    }
  ],
  "suggestions": [
    "<actionable improvement tip 1>",
    "<actionable improvement tip 2>",
    "<actionable improvement tip 3>"
  ],
  "summary": "<2-sentence overall assessment>"
}`;

  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          ...extraParams(),
          messages: [
            {
              role: 'system',
              content: 'You are a pronunciation analysis expert. Always respond with valid JSON only. No markdown, no backticks, no extra text.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Groq API HTTP error:', errText);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    logger.info('Groq raw response received, parsing JSON...');

    // Strip markdown code blocks if present
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Extract JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON found in Groq response:', rawText);
      throw new Error('Invalid Groq response format');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    analysis.raw = { provider: 'groq', model: MODEL };
    return analysis;

  } catch (error) {
    logger.error('Groq API call failed:', error.message);
    // Fall back to an honest word comparison; never to invented scores.
    return basicComparison(targetText, transcribedText, 'AI call failed');
  }
}

/**
 * What we can honestly say when no AI analysis is available (no key, or the AI call failed): which of the phrase's words
 * the speech recogniser heard. That is a real comparison of real text. Everything that needs actual analysis of how the
 * person sounded (fluency, intonation, stress, sounds) is left null; nothing is invented or randomised.
 * The result is marked `ai: false` so the app can label it and never saves it as a pronunciation assessment.
 */
function basicComparison(targetText, transcribedText, reason = 'AI analysis unavailable') {
  const clean = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
  const targetWords = String(targetText || '').split(/\s+/).filter(Boolean);
  const heard = new Map();
  String(transcribedText || '').split(/\s+/).map(clean).filter(Boolean).forEach((w) => heard.set(w, (heard.get(w) || 0) + 1));

  const wordsBreakdown = targetWords.map((word) => {
    const key = clean(word);
    const left = heard.get(key) || 0;
    if (key && left > 0) { heard.set(key, left - 1); return { word, score: 100, status: 'correct', note: null }; }
    return { word, score: 0, status: 'missed', note: 'This word was not heard' };
  });
  const matched = wordsBreakdown.filter((w) => w.status === 'correct').length;

  return {
    ai: false,
    provider: 'basic',
    overallAccuracy: targetWords.length ? Math.round((matched / targetWords.length) * 100) : 0,
    fluencyScore: null,
    intonationScore: null,
    stressScore: null,
    wordsBreakdown,
    phonemeAnalysis: [],
    suggestions: ['AI pronunciation feedback is unavailable right now. This only compares the words you said with the phrase; it does not judge how you sounded.'],
    summary: 'Word match only (no AI analysis).',
    raw: { provider: 'basic', reason },
  };
}

/**
 * GET /api/v1/speech/history
 * Get user pronunciation history with pagination
 */
const getPronunciationHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      PronunciationRecord.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-geminiResponse -phonemeAnalysis')
        .lean(),
      PronunciationRecord.countDocuments({ userId }),
    ]);

    res.json({
      success: true,
      data: {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/speech/accuracy-trend
 * Get accuracy trend over time for charts
 */
const getAccuracyTrend = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    const trend = await PronunciationRecord.getAccuracyTrend(userId, days);

    res.json({
      success: true,
      data: { trend },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/speech/skill-breakdown?days=30
 * Average accuracy / fluency / intonation / stress over a period, from the user's real analysed attempts.
 */
const getSkillBreakdown = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [row] = await PronunciationRecord.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: {
        _id: null,
        accuracy: { $avg: '$overallAccuracy' }, fluency: { $avg: '$fluencyScore' },
        intonation: { $avg: '$intonationScore' }, stress: { $avg: '$stressScore' }, attempts: { $sum: 1 },
      } },
    ]);
    const round = (n) => (typeof n === 'number' ? Math.round(n) : null);
    res.json({
      success: true,
      data: row
        ? { attempts: row.attempts, accuracy: round(row.accuracy), fluency: round(row.fluency), intonation: round(row.intonation), stress: round(row.stress) }
        : { attempts: 0, accuracy: null, fluency: null, intonation: null, stress: null },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { analyzeSpeech, getPronunciationHistory, getAccuracyTrend, getSkillBreakdown, basicComparison };
