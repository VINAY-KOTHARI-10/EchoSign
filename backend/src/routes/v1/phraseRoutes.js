// src/routes/v1/phraseRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Daily Phrase Generator — Groq API Integration
//
// Generates fresh, contextual practice phrases for each language + difficulty
// Uses a 24-hour in-memory cache per (language, level) combination to avoid
// hammering the Groq API on every page load, while still feeling "daily fresh".
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/authMiddleware');
const logger = require('../../utils/logger');
const { MODEL, extraParams } = require('../../utils/groq');

const router = Router();

// ── In-memory cache: key = `${lang}:${level}` → { phrases, generatedAt } ────
const phraseCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Supported languages & their Groq-friendly names ──────────────────────────
const LANGUAGE_MAP = {
  en:  'English',
  fr:  'French',
  es:  'Spanish',
  de:  'German',
  ja:  'Japanese',
  zh:  'Mandarin Chinese',
  it:  'Italian',
  pt:  'Portuguese (Brazilian)',
  ko:  'Korean',
  ar:  'Arabic (Modern Standard)',
  ru:  'Russian',
  hi:  'Hindi',
};

// ── Difficulty level instructions for the AI ─────────────────────────────────
const DIFFICULTY_CONFIG = {
  beginner: {
    label: 'Beginner',
    instructions: 'Use very simple, everyday vocabulary (A1-A2 level). Short sentences of 3-6 words. Common greetings, numbers, colors, basic needs. Include only the most essential, high-frequency words.',
  },
  intermediate: {
    label: 'Intermediate',
    instructions: 'Use conversational vocabulary (B1-B2 level). Sentences of 6-12 words. Include common idioms, practical scenarios like travel, shopping, work. Natural connected speech patterns.',
  },
  advanced: {
    label: 'Advanced',
    instructions: 'Use sophisticated vocabulary (C1-C2 level). Complex sentences with subordinate clauses. Include idiomatic expressions, nuanced meaning, cultural references, formal and informal registers.',
  },
};

// ── Fallback phrases when Groq is unavailable ─────────────────────────────────
const FALLBACK_PHRASES = {
  en: [
    { text: 'Hello, how are you today?',           phonetic: '/hɛˈloʊ haʊ ɑːr juː təˈdeɪ/', topic: 'Greetings',    difficulty: 'beginner'     },
    { text: 'Could you please repeat that slowly?', phonetic: '/kʊd juː pliːz rɪˈpiːt ðæt ˈsloʊli/', topic: 'Communication', difficulty: 'intermediate' },
    { text: 'The nuances of language are endlessly fascinating.', phonetic: '/ðə ˈnjuːɑːnsɪz əv ˈlæŋɡwɪdʒ ɑːr ˈɛndləsli ˈfæsɪneɪtɪŋ/', topic: 'Reflection', difficulty: 'advanced' },
  ],
  fr: [
    { text: 'Bonjour, comment allez-vous?',          phonetic: '/bɔ̃.ʒuʁ kɔ.mɑ̃ a.le vu/', topic: 'Greetings',    difficulty: 'beginner'     },
    { text: 'Je voudrais réserver une table pour deux.', phonetic: '/ʒə vu.dʁɛ ʁe.zɛʁ.ve yn tabl puʁ dø/', topic: 'Restaurant', difficulty: 'intermediate' },
    { text: 'Les subtilités de la langue française sont fascinantes.', phonetic: '/le syb.ti.li.te də la lɑ̃ɡ fʁɑ̃.sɛz sɔ̃ fa.si.nɑ̃t/', topic: 'Culture', difficulty: 'advanced' },
  ],
  es: [
    { text: 'Buenos días, ¿cómo estás?',             phonetic: '/ˈbwenos ˈdias ˈkomo esˈtas/', topic: 'Greetings',    difficulty: 'beginner'     },
    { text: '¿Puede decirme dónde está la estación?', phonetic: '/ˈpweðe ðe.ˈθiɾ.me ˈðon.de esˈta la es.ta.ˈθjon/', topic: 'Travel', difficulty: 'intermediate' },
    { text: 'La riqueza léxica del español es verdaderamente asombrosa.', phonetic: '/la ˈri.ke.θa ˈlek.si.ka ðel es.pa.ˈɲol es ber.ða.ðe.ˈɾa.men.te a.som.ˈbɾo.sa/', topic: 'Literature', difficulty: 'advanced' },
  ],
  de: [
    { text: 'Guten Morgen, wie geht es Ihnen?',     phonetic: '/ˈɡuːtn̩ ˈmɔʁɡn̩ viː ɡeːt ʔɛs ˈiːnən/', topic: 'Greetings', difficulty: 'beginner' },
    { text: 'Könnten Sie mir bitte den Weg erklären?', phonetic: '/ˈkœntn̩ ziː miːɐ̯ ˈbɪtə deːn veːk ɛɐ̯ˈklɛːʁən/', topic: 'Navigation', difficulty: 'intermediate' },
  ],
  ja: [
    { text: 'おはようございます',                   phonetic: '/o.ha.yoː.ɡo.za.i.ma.su/', topic: 'Greetings', difficulty: 'beginner' },
    { text: 'すみません、駅はどこですか？',           phonetic: '/su.mi.ma.sen e.ki wa do.ko de.su ka/', topic: 'Travel', difficulty: 'intermediate' },
  ],
  zh: [
    { text: '你好，你今天怎么样？',                  phonetic: '/nǐ hǎo nǐ jīntiān zěnmeyàng/', topic: 'Greetings', difficulty: 'beginner' },
    { text: '请问附近有没有地铁站？',                phonetic: '/qǐngwèn fùjìn yǒu méiyǒu dìtiě zhàn/', topic: 'Travel', difficulty: 'intermediate' },
  ],
  it: [
    { text: 'Buongiorno, come sta?',                 phonetic: '/ˌbwɔnˈdʒorno ˈkome ˈsta/', topic: 'Greetings', difficulty: 'beginner' },
    { text: 'Potrebbe consigliarmi un buon ristorante?', phonetic: '/po.ˈtreb.be kon.si.ˈʎa.re.mi un ˈbwɔn ris.to.ˈran.te/', topic: 'Food', difficulty: 'intermediate' },
  ],
  pt: [
    { text: 'Bom dia, como vai você?',               phonetic: '/bõ ˈdʒiɐ ˈkõmu ˈvaj voˈse/', topic: 'Greetings', difficulty: 'beginner' },
    { text: 'Você poderia me indicar o caminho para o aeroporto?', phonetic: '/vo.ˈse po.de.ˈɾi.a mi in.di.ˈkaɾ u ka.ˈmi.ɲu pa.ɾɐ u ae.ɾo.ˈpoɾ.tu/', topic: 'Travel', difficulty: 'intermediate' },
  ],
};

// More phrases for when the AI is unavailable, so a practice session still never repeats the same few sentences.
const ph = (text, topic, difficulty, translation = '') => ({ text, phonetic: '', topic, difficulty, translation, tip: '' });
FALLBACK_PHRASES.en.push(
  ph('Nice to meet you.', 'Greetings', 'beginner'), ph('Where is the bathroom?', 'Travel', 'beginner'), ph('I would like a glass of water.', 'Food', 'beginner'),
  ph('What time does the bus leave?', 'Transport', 'beginner'), ph('My name is Sam, and I am a student.', 'Introductions', 'beginner'), ph('Thank you very much for your help.', 'Manners', 'beginner'),
  ph('How much does this cost?', 'Shopping', 'beginner'), ph('I am sorry, I did not understand.', 'Communication', 'beginner'),
  ph('Could you tell me how to get to the station?', 'Directions', 'intermediate'), ph('I have been learning English for about two years.', 'Study', 'intermediate'),
  ph('Would you mind opening the window, please?', 'Manners', 'intermediate'), ph('I am looking for a gift for my sister.', 'Shopping', 'intermediate'),
  ph('The meeting has been moved to Thursday afternoon.', 'Work', 'intermediate'), ph('It usually rains a lot in the evening here.', 'Weather', 'intermediate'),
  ph('I would rather stay at home than go out tonight.', 'Preferences', 'intermediate'), ph('Can you recommend a good restaurant nearby?', 'Food', 'intermediate'),
  ph('Despite the delay, we managed to finish the project on time.', 'Work', 'advanced'), ph('She spoke so quietly that hardly anyone could hear her.', 'Description', 'advanced'),
  ph('If I had known about the traffic, I would have left earlier.', 'Conditionals', 'advanced'), ph('The committee reached a decision after lengthy deliberation.', 'Formal', 'advanced'),
  ph('Technology has fundamentally changed the way we communicate.', 'Society', 'advanced'), ph('Rarely have I seen such a remarkable performance.', 'Opinion', 'advanced'),
);
FALLBACK_PHRASES.fr.push(ph('Enchanté de faire votre connaissance.', 'Greetings', 'beginner'), ph('Où sont les toilettes, s’il vous plaît ?', 'Travel', 'beginner'), ph('Je voudrais un verre d’eau.', 'Food', 'beginner'), ph('Pouvez-vous m’indiquer le chemin de la gare ?', 'Directions', 'intermediate'));
FALLBACK_PHRASES.es.push(ph('Mucho gusto en conocerte.', 'Greetings', 'beginner'), ph('¿Dónde está el baño, por favor?', 'Travel', 'beginner'), ph('Quisiera un vaso de agua.', 'Food', 'beginner'), ph('¿A qué hora sale el próximo autobús?', 'Transport', 'intermediate'));
FALLBACK_PHRASES.de.push(ph('Freut mich, Sie kennenzulernen.', 'Greetings', 'beginner'), ph('Wo ist die Toilette, bitte?', 'Travel', 'beginner'), ph('Ich hätte gern ein Glas Wasser.', 'Food', 'beginner'), ph('Wann fährt der nächste Zug nach Berlin?', 'Transport', 'intermediate'));

// Random topics for the AI to draw from, so every set of phrases is different from the last.
const TOPICS = ['greetings', 'travel and directions', 'food and restaurants', 'work and study', 'shopping', 'feelings', 'weather', 'health and the doctor',
  'family and friends', 'hobbies and sport', 'technology', 'culture and festivals', 'daily routine', 'money and banking', 'public transport', 'home and neighbours',
  'making plans', 'asking for help', 'news and opinions', 'nature and animals'];
const sample = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const shuffle = (arr) => sample(arr, arr.length);
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// The phrases a learner can get without the AI: right level only, shuffled, never the ones they just practised.
function pickFallback(lang, difficulty, avoid = []) {
  const all = FALLBACK_PHRASES[lang] || FALLBACK_PHRASES.en;
  const skip = new Set(avoid.map(norm));
  let pool = all.filter((x) => x.difficulty === difficulty && !skip.has(norm(x.text)));
  if (pool.length < 4) pool = all.filter((x) => !skip.has(norm(x.text)));
  if (!pool.length) pool = all;
  return shuffle(pool).slice(0, 8).map((x) => ({ ...x, translation: x.translation || '', tip: x.tip || '' }));
}

// ── Groq-powered phrase generation ───────────────────────────────────────────
async function generatePhrasesFromGroq(language, languageName, difficulty, avoid = []) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    logger.warn('[Phrases] GROQ_API_KEY not set — using fallback phrases');
    return null;
  }

  const diffConfig = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.intermediate;

  const prompt = `Generate exactly 8 unique, diverse practice phrases for a language learner studying ${languageName}.

Difficulty level: ${diffConfig.label}
Instructions: ${diffConfig.instructions}

Requirements:
- Each phrase must be genuinely useful and culturally authentic
- This time draw the phrases from these topics (one or two each): ${sample(TOPICS, 4).join(', ')}
- Every phrase must be different in structure and vocabulary from the others
- Do NOT use any of these phrases the learner already practised: ${avoid.length ? avoid.slice(0, 20).map((x) => `"${x}"`).join('; ') : '(none)'}
- Random seed for variety: ${Math.random().toString(36).slice(2, 8)}
- Make phrases sound natural, not textbook-stiff
- IPA phonetic transcription must be accurate for ${languageName}
- Topic labels must be 1-2 words max

Respond ONLY with this exact JSON array, no other text, no markdown, no backticks:
[
  {
    "text": "phrase in ${languageName}",
    "phonetic": "/IPA transcription/",
    "topic": "Topic",
    "difficulty": "${difficulty}",
    "translation": "English translation",
    "tip": "One short pronunciation tip"
  }
]`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
          content: 'You are a language education expert. Always respond with valid JSON only. No markdown, no code blocks, no extra text whatsoever.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 1, // high on purpose: every set of phrases should differ from the last
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error(`[Phrases] Groq HTTP ${response.status}: ${errText}`);
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';

  // Strip any accidental markdown wrapping
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Extract JSON array
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logger.error('[Phrases] No JSON array in Groq response:', rawText.slice(0, 200));
    throw new Error('Invalid Groq response format');
  }

  const phrases = JSON.parse(jsonMatch[0]);

  // Validate structure
  if (!Array.isArray(phrases) || phrases.length === 0) {
    throw new Error('Empty or invalid phrases array from Groq');
  }

  // Ensure all required fields exist
  return phrases.map(p => ({
    text:       p.text        || 'Practice phrase',
    phonetic:   p.phonetic    || '',
    topic:      p.topic       || 'General',
    difficulty: p.difficulty  || difficulty,
    translation: p.translation || '',
    tip:        p.tip         || '',
  }));
}

// ── GET /api/v1/phrases/daily ─────────────────────────────────────────────────
/**
 * Returns 8 daily practice phrases for a given language + difficulty.
 * Cached for 24 hours to give a "fresh every day" feel without API spam.
 *
 * Query params:
 *   lang       = en | fr | es | de | ja | zh | it | pt (default: en)
 *   difficulty = beginner | intermediate | advanced     (default: intermediate)
 *   refresh    = 1  (bypass cache, force fresh generation)
 */
router.get('/daily', authenticate, async (req, res) => {
  const lang       = req.query.lang       || 'en';
  const difficulty = req.query.difficulty || 'intermediate';
  const forceRefresh = req.query.refresh  === '1';
  const avoid = String(req.query.avoid || '').split('|').map((x) => x.trim()).filter(Boolean).slice(0, 20);

  const languageName = LANGUAGE_MAP[lang] || 'English';
  const cacheKey     = `${lang}:${difficulty}`;

  // ── Check cache ────────────────────────────────────────────────────────
  if (!forceRefresh && phraseCache.has(cacheKey)) {
    const cached = phraseCache.get(cacheKey);
    const ageMs  = Date.now() - cached.generatedAt;

    if (ageMs < CACHE_TTL_MS) {
      logger.info(`[Phrases] Cache hit for ${cacheKey} (${Math.round(ageMs / 3600000)}h old)`);
      return res.json({
        success: true,
        data: {
          phrases:      cached.phrases,
          language:     languageName,
          languageCode: lang,
          difficulty,
          generatedAt:  new Date(cached.generatedAt).toISOString(),
          cached:       true,
          nextRefresh:  new Date(cached.generatedAt + CACHE_TTL_MS).toISOString(),
        },
      });
    }
  }

  // ── Generate fresh phrases via Groq ───────────────────────────────────
  let phrases = null;
  let fromGroq = false;

  try {
    logger.info(`[Phrases] Generating fresh phrases for ${cacheKey} via Groq...`);
    phrases  = await generatePhrasesFromGroq(lang, languageName, difficulty, avoid);
    const skip = new Set(avoid.map(norm));
    phrases = shuffle(phrases.filter((x) => !skip.has(norm(x.text))));
    if (!phrases.length) throw new Error('Only repeated phrases came back');
    fromGroq = true;
  } catch (err) {
    logger.error(`[Phrases] Groq generation failed: ${err.message}`);
  }

  // ── Fallback to static phrases (shuffled, right level, no repeats) ───────
  if (!phrases) phrases = pickFallback(lang, difficulty, avoid);

  // ── Store in cache ────────────────────────────────────────────────────
  if (fromGroq && phrases && !forceRefresh) {
    phraseCache.set(cacheKey, { phrases, generatedAt: Date.now() });
  }

  const now = Date.now();
  res.json({
    success: true,
    data: {
      phrases,
      language:     languageName,
      languageCode: lang,
      difficulty,
      generatedAt:  new Date(now).toISOString(),
      cached:       false,
      nextRefresh:  new Date(now + CACHE_TTL_MS).toISOString(),
      provider:     fromGroq ? 'groq' : 'fallback',
    },
  });
});

// ── GET /api/v1/phrases/random ─────────────────────────────────────────────────
/**
 * Returns a single random phrase (no cache) for the "New Phrase" button.
 * Uses the same cache if available, else generates or falls back.
 */
router.get('/random', authenticate, async (req, res) => {
  const lang       = req.query.lang       || 'en';
  const difficulty = req.query.difficulty || 'intermediate';
  const languageName = LANGUAGE_MAP[lang] || 'English';
  const cacheKey   = `${lang}:${difficulty}`;

  let phrases = null;

  // Try cache first
  if (phraseCache.has(cacheKey)) {
    const cached = phraseCache.get(cacheKey);
    if (Date.now() - cached.generatedAt < CACHE_TTL_MS) {
      phrases = cached.phrases;
    }
  }

  // Generate if not cached
  if (!phrases) {
    try {
      phrases = await generatePhrasesFromGroq(lang, languageName, difficulty);
      if (phrases) phraseCache.set(cacheKey, { phrases, generatedAt: Date.now() });
    } catch { /* ignore */ }
  }

  // Fallback
  if (!phrases || phrases.length === 0) {
    phrases = pickFallback(lang, difficulty);
  }

  const phrase = phrases[Math.floor(Math.random() * phrases.length)];

  res.json({ success: true, data: { phrase, languageCode: lang, language: languageName } });
});

module.exports = router;
