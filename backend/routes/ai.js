const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');

// Requires ANTHROPIC_API_KEY in backend/.env — see .env.example.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Every route below requires a valid Supabase access token, same as /api/tasks.
router.use(requireAuth);

const FRANKFURTER_CURRENCIES_URL = 'https://api.frankfurter.dev/v1/currencies';
const CACHE_TTL_MS = 60 * 60 * 1000;

let currencyCache = { codes: null, list: null, fetchedAt: 0 };

async function getSupportedCurrencies() {
  const isFresh = currencyCache.codes && Date.now() - currencyCache.fetchedAt < CACHE_TTL_MS;
  if (isFresh) return currencyCache;

  const response = await fetch(FRANKFURTER_CURRENCIES_URL);
  if (!response.ok) {
    if (currencyCache.codes) return currencyCache;
    throw new Error(`Frankfurter currencies request failed: ${response.status}`);
  }

  const data = await response.json();
  const codes = new Set(Object.keys(data));
  const list = Object.entries(data)
    .map(([code, name]) => `${code} (${name})`)
    .join(', ');

  currencyCache = { codes, list, fetchedAt: Date.now() };
  return currencyCache;
}

function buildSystemPrompt(currencyList) {
  return `You extract currency conversion requests into strict JSON.

Given a free-text request like "convert 500 dollars to euros" or
"exchange 200 rupees for yen", respond with ONLY a JSON object — no prose,
no markdown code fences, nothing before or after it — in one of these two
exact shapes:

Success: {"amount": <number>, "from": "<3-letter code>", "to": "<3-letter code>"}
Failure: {"error": "<short human-readable reason>"}

You MUST only choose "from" and "to" codes from this exact list of
currencies supported by the app's own dropdowns. Never invent, guess, or
substitute a code that is not in this list:
${currencyList}

Always resolve common currency names/aliases to the correct code from that
list (e.g. "dollars" -> "USD", "euros" -> "EUR", "rupees" -> "INR",
"yen" -> "JPY", "pounds" -> "GBP"). If the amount is missing, if either
currency cannot be confidently matched to something in the list above, or
if the two currencies are the same, return the Failure shape instead of
guessing.`;
}

// POST /api/ai/parse-conversion { text: "convert 500 usd to eur" }
// Speech-to-text is performed locally in the Angular browser client with
// Whisper/Transformers.js, so this backend has no paid speech API dependency.
router.post('/parse-conversion', async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No request text provided' });
  }

  let currencies;
  try {
    currencies = await getSupportedCurrencies();
  } catch (err) {
    console.error('Could not load currency list for AI prompt:', err);
    return res.status(503).json({ error: 'Currency list is temporarily unavailable.' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildSystemPrompt(currencies.list),
      messages: [{ role: 'user', content: text }],
    });

    const raw = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('AI returned non-JSON output:', raw);
      return res.status(502).json({ error: 'AI response was not valid JSON.' });
    }

    if (parsed.error) {
      return res.status(422).json({ error: parsed.error });
    }

    const amount = Number(parsed.amount);
    const from = String(parsed.from || '').toUpperCase();
    const to = String(parsed.to || '').toUpperCase();

    const validShape = amount > 0 && /^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to);
    const validCurrencies = currencies.codes.has(from) && currencies.codes.has(to);

    if (!validShape || !validCurrencies) {
      return res.status(422).json({
        error: !validShape
          ? 'Could not extract a complete conversion request.'
          : 'One of those currencies isn\'t supported by this app.',
      });
    }

    return res.json({ amount, from, to });
  } catch (err) {
    console.error('AI parse-conversion error:', err);
    return res.status(500).json({ error: 'AI parsing is currently unavailable.' });
  }
});

module.exports = router;
