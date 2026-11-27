// src/routes/v1/conversationRoutes.js
// AI Conversation Partner - Groq API Integration

'use strict';
const { Router } = require('express');
const crypto = require('crypto');
const { MODEL, extraParams } = require('../../utils/groq');
const { authenticate } = require('../../middleware/authMiddleware');
const logger = require('../../utils/logger');

const router = Router();
router.use(authenticate);

/**
 * POST /api/v1/conversation/chat
 * Send a message to the AI language tutor
 */
router.post('/chat', async (req, res, next) => {
  try {
    const { userMessage, language, conversationHistory = [], scenario, difficulty, opening } = req.body;

    // `opening: true` asks the partner to start the conversation itself, so every session begins differently.
    if (!opening && !userMessage?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'userMessage is required',
      });
    }

    if (!language) {
      return res.status(400).json({
        success: false,
        error: 'language is required',
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      // No AI key: say so. (It used to answer with a canned reply and a random score.)
      return res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', error: 'The AI Partner is unavailable right now. Please try again in a moment.' });
    }

    // Build conversation history for context (last 6 messages)
    const historyText = conversationHistory
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'Student' : 'AI Tutor'}: ${m.text}`)
      .join('\n');

    const systemPrompt = `You are a friendly and encouraging language tutor teaching ${language}.
Your job is to:
1. Respond naturally in ${language} to keep the conversation going
2. Gently correct grammar or word-choice mistakes
3. Give a score from 0-100 for how correct their ${language} was (grammar and word choice: you read their words, you cannot hear them)
4. Keep replies SHORT — maximum 2 sentences${scenario ? `
Scenario: ${String(scenario).slice(0, 300)}` : ''}${difficulty ? `
Difficulty: ${String(difficulty).slice(0, 20)} (adjust vocabulary and pace)` : ''}
5. Always respond with valid JSON only, no markdown, no backticks, no extra text`;

    const OPENERS = ['asks a question about the student\'s day', 'mentions a small, specific problem and asks for help', 'asks for the student\'s opinion on something', 'starts with a short, surprising remark and a question', 'asks about the student\'s plans', 'describes where they are and asks what the student would do'];
    const angle = OPENERS[crypto.randomInt(OPENERS.length)];
    const userPrompt = opening
      ? `Start the conversation yourself. In your first message you ${angle}, staying strictly inside the scenario (you play the role the scenario gives you, for example the waiter in a restaurant or the interviewer in a job interview), so the learner can answer in character. Use specific, concrete details (a name, a place, a time) that you invent now, so it is different from any other session. Do not just say hello and ask how they are. Random seed: ${crypto.randomBytes(3).toString('hex')}

Reply in this EXACT JSON format only, no other text:
{
  "reply": "your opening message in ${language}",
  "translation": "english translation of your reply",
  "correction": null,
  "score": null,
  "encouragement": "one brief friendly phrase inviting them to answer"
}`
      : `${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}Student just said: "${userMessage}"

Reply in this EXACT JSON format only, no other text:
{
  "reply": "your response in ${language}",
  "translation": "english translation of your reply",
  "correction": "specific grammar or pronunciation correction if needed, otherwise null",
  "score": <number 0-100 based on how correct their ${language} was>,
  "encouragement": "one brief positive phrase"
}`;

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
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: opening ? 1 : 0.7,
          max_tokens: 500,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[Conversation] Groq HTTP ${response.status}: ${errText}`);
      return res.json({
        success: false,
        error: `Groq HTTP ${response.status}: ${errText}`,
      });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    logger.info(`Groq conversation response received for language: ${language}`);

    // Strip markdown code blocks if Groq adds them
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Extract JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON in Groq conversation response:', rawText);
      return res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', error: 'The AI Partner is unavailable right now. Please try again in a moment.' });
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!result.reply) {
      return res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', error: 'The AI Partner is unavailable right now. Please try again in a moment.' });
    }

    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('[Conversation] Unexpected error FULL:', error);
    // Say so plainly; never pretend with a canned reply.
    res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', error: 'The AI Partner is unavailable right now. Please try again in a moment.' });
  }
});

module.exports = router;
