// src/utils/groq.js
// Minimal Groq chat helper that returns parsed JSON. Returns null when no API key is configured.
'use strict';

const logger = require('./logger');

// llama-3.1-8b-instant was retired from Groq, so the default is a current model. Override with GROQ_MODEL.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
// gpt-oss models spend tokens on reasoning first; keep that short for fast classroom features.
const extraParams = () => (MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {});

const parseJson = (text) => {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
};

async function chatJSON(system, user, { maxTokens = 1500, temperature = 0.2 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      max_tokens: maxTokens,
      ...extraParams(),
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error(`[Groq] ${res.status}: ${body.slice(0, 200)}`);
    throw new Error(`Groq request failed (${res.status})`);
  }
  const data = await res.json();
  return parseJson(data.choices?.[0]?.message?.content);
}

module.exports = { chatJSON, MODEL, extraParams };
