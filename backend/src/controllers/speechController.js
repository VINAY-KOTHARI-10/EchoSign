// src/controllers/speechController.js
// Speech Analysis Controller - Groq API Integration for pronunciation analysis

'use strict';

const { validationResult } = require('express-validator');
const PronunciationRecord = require('../models/mongo/PronunciationRecord');
const UserActivity = require('../models/mongo/UserActivity');
const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const logger = require('../utils/logger');
const { MODEL, extraParams, chatJSON } = require('../utils/groq');
const voice = require('../utils/voiceAnalysis');

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
 * POST /api/v1/speech/analyze-voice
 * Analyses the recorded VOICE, not only the words the browser recognised.
 *   body: { audio (base64), mime, language, targetText?, transcribedText?, metrics?, scenario? }
 *   - the clip is transcribed by Whisper with word times (what was really said, and how fast, with which pauses)
 *   - with a targetText the words are aligned against it for a word-by-word score; without one (free conversation) only the
 *     voice measurements, clarity and tips are returned
 *   - pitch and loudness measured in the browser while recording (metrics) feed the intonation and stress estimates
 * If the speech model is unavailable the browser's own transcript is compared instead; that result is labelled ai:false and
 * never saved, exactly like the plain word comparison.
 */
const analyzeVoice = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, details: errors.array() });

    const { audio, mime = 'audio/webm', language = 'en', targetText = '', transcribedText = '', scenario = '' } = req.body;
    const userId = req.user.id;
    const buffer = Buffer.from(String(audio || ''), 'base64');
    if (buffer.length < 1500) return res.status(400).json({ success: false, message: 'That recording is too short. Hold the microphone and say the whole phrase.' });

    const client = voice.cleanClientMetrics(req.body.metrics);
    const hasTarget = Boolean(String(targetText).trim());

    let whisper = null; let reason = null;
    try { whisper = await voice.transcribeAudio(buffer, mime, language); if (!whisper) reason = 'no AI key configured'; }
    catch (err) { reason = err.message; logger.error('Voice analysis: speech model failed: ' + err.message); }

    // The words to compare: Whisper's when it worked, otherwise what the browser recognised.
    const heard = whisper ? whisper.text : String(transcribedText || '').trim();
    if (!whisper && !heard) return res.status(503).json({ success: false, message: 'Voice analysis is unavailable right now. Please try again in a moment.' });

    const timing = whisper ? voice.timingMetrics(whisper.words, language) : null;
    const clarity = whisper ? voice.clarityScore(whisper.segments) : null;
    const align = hasTarget ? voice.alignWords(targetText, heard) : null;
    const fluency = voice.fluencyScore(timing);
    const intonation = voice.intonationScore(client);
    const stress = voice.stressScore(client);
    const overall = align ? Math.round(clarity !== null ? align.accuracy * 0.75 + clarity * 0.25 : align.accuracy) : clarity;

    // Advice: written by the AI from the measurements when it is available, otherwise built from the same measurements.
    let advice = voice.measuredAdvice({ timing, client, clarity, align }); let adviceBy = 'measurements'; let summary = '';
    if (whisper && heard) {
      try {
        const data = {
          language, mode: hasTarget ? 'practise-a-phrase' : 'free-conversation', scenario: scenario || undefined,
          targetPhrase: hasTarget ? targetText : undefined, heard,
          wordResults: align ? align.words.map(({ word, heard: h, score, status }) => ({ word, heard: h, score, status })) : undefined,
          timing, clarity, voice: client, scores: { overall, fluency, intonation, stress },
        };
        const out = await chatJSON(
          'You are a kind, precise pronunciation coach. You are given MEASUREMENTS of a learner\'s recorded voice. Base every comment on them; never invent sounds, target numbers or problems that are not in the data. Rules: do not mention loudness level, average pitch in Hz, voiced ratio or decibels (the learner cannot act on them). Mention pitch only if the voice was flat (variation under 1.5 semitones) or very wide (over 6). Describe scores consistently: 80 and above is strong, 60 to 79 is okay, below 60 needs work. Higher scores are always better, and clarity is how confidently a speech model understood the clip, so never suggest anything that would lower a score. Write like a friendly human teacher talking to the learner: plain words, no jargon, and numbers only when they help (words per minute or the number of pauses). Praise what went well first, then give 2 or 3 practical tips about specific words, pauses or pace, not more. Do not number the tips; each is one specific sentence of at most 25 words that names the words or the measurement. If the delivery was good, say so briefly instead of inventing faults. Reply with JSON only.',
          'Measurements:\n' + JSON.stringify(data) + '\n\nReturn {"summary": "two short sentences", "suggestions": ["2 to 4 specific, actionable tips that refer to the words or the measurements"], "wordNotes": {"<target word>": "short note on that word, only for words that were not correct"}}.',
          { maxTokens: 700, temperature: 0.3 },
        );
        if (out && Array.isArray(out.suggestions) && out.suggestions.length) {
          advice = out.suggestions.filter((x) => typeof x === 'string' && x.trim()).slice(0, 4);
          adviceBy = 'ai';
          summary = typeof out.summary === 'string' ? out.summary.slice(0, 400) : '';
          if (align && out.wordNotes && typeof out.wordNotes === 'object') {
            align.words.forEach((w) => { const n = out.wordNotes[w.word]; if (typeof n === 'string' && n.trim() && w.status !== 'correct') w.note = n.slice(0, 160); });
          }
        }
      } catch (err) { logger.warn('Voice analysis: AI advice failed, using measurements: ' + err.message); }
    }

    const ai = Boolean(whisper);
    let record = null;
    if (ai && hasTarget) {
      record = await PronunciationRecord.create({
        userId, sessionId: `session_${Date.now()}`, language, targetText, transcribedText: heard || '(nothing heard)',
        overallAccuracy: overall, fluencyScore: fluency ?? undefined, intonationScore: intonation ?? undefined, stressScore: stress ?? undefined,
        phonemeAnalysis: [], aiSuggestions: advice,
        wordsBreakdown: align.words.map((w) => ({ word: w.word, score: w.score })),
        audioMetadata: { duration: timing?.spokenSeconds ?? client?.durationSec ?? undefined },
        geminiResponse: { provider: 'whisper', model: voice.WHISPER_MODEL, adviceBy, timing, client },
      });
      const io = req.app.get('io');
      if (io) io.to(`user:${userId}`).emit('pronunciation:analyzed', { recordId: record._id, accuracy: overall, timestamp: new Date() });
    }

    res.json({
      success: true,
      data: {
        recordId: record ? record._id : null,
        ai, adviceBy, provider: ai ? 'whisper' : 'browser', reason: ai ? undefined : reason,
        heard,
        overallAccuracy: overall, fluencyScore: fluency, intonationScore: intonation, stressScore: stress, clarityScore: clarity,
        suggestions: advice, summary,
        wordsBreakdown: align ? align.words : [], extraWords: align ? align.extra : [],
        voice: { timing, pitch: client ? { variationSemitones: client.pitchStdSemitones, rangeSemitones: client.pitchRangeSemitones, meanHz: client.pitchMeanHz } : null,
          loudness: client ? { variationDb: client.loudnessStdDb, meanDb: client.loudnessMeanDb } : null, voicedRatio: client ? client.voicedRatio : null },
      },
    });
  } catch (error) {
    next(error);
  }
};

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

module.exports = { analyzeSpeech, analyzeVoice, getPronunciationHistory, getAccuracyTrend, getSkillBreakdown, basicComparison };
