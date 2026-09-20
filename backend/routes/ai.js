const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');

// Requires ANTHROPIC_API_KEY in backend/.env — see .env.example.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Every route below requires a valid Supabase access token, same as /api/tasks.
router.use(requireAuth);

// Same endpoint the frontend's currency-converter dropdowns already call
// (see frontend/src/app/services/currency.service.ts). Fetching it here too
// means the AI is always constrained to exactly the currencies that appear
// in the app's own <select> options — one source of truth, no drift.
const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v1';
const FRANKFURTER_CURRENCIES_URL = `${FRANKFURTER_BASE_URL}/currencies`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — this list essentially never changes

let currencyCache = { codes: null, list: null, fetchedAt: 0 };

/** Fetches (and caches in-memory) the { code: name } currency map. */
async function getSupportedCurrencies() {
  const isFresh = currencyCache.codes && Date.now() - currencyCache.fetchedAt < CACHE_TTL_MS;
  if (isFresh) return currencyCache;

  const response = await fetch(FRANKFURTER_CURRENCIES_URL);
  if (!response.ok) {
    // Refresh failed — prefer a stale cache over failing the request entirely.
    if (currencyCache.codes) return currencyCache;
    throw new Error(`Frankfurter currencies request failed: ${response.status}`);
  }

  const data = await response.json(); // e.g. { USD: "United States Dollar", EUR: "Euro", ... }
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

// POST /api/ai/parse-conversion  { text: "convert 500 usd to eur" }
// -> { amount, from, to }  or  422 { error }  on an unparseable/unsupported request.
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
      model: 'claude-haiku-4-5-20251001', // fast + cheap, plenty for this task
      max_tokens: 200,
      system: buildSystemPrompt(currencies.list),
      messages: [{ role: 'user', content: text }],
    });

    // message.content is an array of blocks (text, tool_use, etc.) — join
    // just the text blocks, since we only asked for a plain JSON reply.
    const raw = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
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

// ---------------------------------------------------------------------------
// AI exchange-rate forecast
//
// Claude can't know future rates, so it isn't asked to guess from memory.
// Instead we pull the last ~60 days of real ECB rates from Frankfurter,
// compute a few simple statistics (momentum, range, volatility) and ask
// Claude to turn those numbers into a short, cautious outlook with plausible
// ranges. The reply is validated before it reaches the browser.
// ---------------------------------------------------------------------------

const FORECAST_HISTORY_DAYS = 60;
const FORECAST_CACHE_TTL_MS = 30 * 60 * 1000; // rates only update once per business day
const forecastCache = new Map(); // "USD-EUR" -> { at, payload }

const TRENDS = ['up', 'down', 'sideways'];
const CONFIDENCES = ['low', 'medium', 'high'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Daily rates for the last FORECAST_HISTORY_DAYS days, oldest first. */
async function getRateHistory(from, to) {
  const end = new Date();
  const start = new Date(end.getTime() - FORECAST_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const url = `${FRANKFURTER_BASE_URL}/${isoDate(start)}..${isoDate(end)}?base=${from}&symbols=${to}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Frankfurter history request failed: ${response.status}`);
  }

  const data = await response.json(); // { rates: { "2026-09-01": { EUR: 0.85 }, ... } }
  return Object.entries(data.rates || {})
    .map(([date, rates]) => ({ date, rate: Number(rates[to]) }))
    .filter((point) => Number.isFinite(point.rate) && point.rate > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function round(value, digits = 5) {
  return Number(value.toFixed(digits));
}

function computeStats(history) {
  const rates = history.map((p) => p.rate);
  const latest = rates[rates.length - 1];

  const pctChange = (daysBack) => {
    const base = rates[Math.max(0, rates.length - 1 - daysBack)];
    return ((latest - base) / base) * 100;
  };

  const returns = [];
  for (let i = 1; i < rates.length; i++) {
    returns.push((rates[i] - rates[i - 1]) / rates[i - 1]);
  }
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;

  return {
    latest: round(latest),
    asOf: history[history.length - 1].date,
    tradingDaysCovered: rates.length,
    change7TradingDaysPct: round(pctChange(7), 3),
    change30TradingDaysPct: round(pctChange(21), 3),
    periodHigh: round(Math.max(...rates)),
    periodLow: round(Math.min(...rates)),
    periodAverage: round(rates.reduce((sum, r) => sum + r, 0) / rates.length),
    dailyVolatilityPct: round(Math.sqrt(variance) * 100, 3),
  };
}

function buildForecastPrompt() {
  return `You are a cautious FX analysis assistant inside a portfolio finance app.
You receive statistics computed from recent daily ECB reference rates for one
currency pair. The "rate" is how many units of the "to" currency one unit of
the "from" currency buys. Produce a short, honest outlook.

Respond with ONLY a JSON object — no prose, no markdown code fences, nothing
before or after it — in exactly this shape:

{"trend": "up" | "down" | "sideways",
 "confidence": "low" | "medium",
 "next_7_days": {"low": <number>, "high": <number>},
 "next_30_days": {"low": <number>, "high": <number>},
 "summary": "<2-3 plain sentences>",
 "factors": ["<short point>", "<short point>", "<short point>"]}

Rules:
- Base everything on the supplied numbers: momentum (the % changes), where
  the latest rate sits inside the period's high/low range, and volatility.
- Do NOT mention news, central-bank decisions, or events; you cannot verify
  them from the data.
- "up" means the rate is expected to rise (the "from" currency gains against
  the "to" currency); "down" the opposite; "sideways" if there is no clear
  direction.
- Ranges are plausible bands, not point predictions: low <= high, both
  positive, centred near the latest rate, and wider for 30 days than for
  7 days in line with the supplied daily volatility.
- Short-term exchange rates are very hard to predict, so use confidence
  "low" unless the numbers show a clear, persistent move.
- "factors" holds at most 3 short points, each tied to a supplied number.
- Write in plain English for a non-expert.`;
}

/** Pulls the JSON object out of the model's reply, tolerating stray fences. */
function extractJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Returns { low, high } if the range is sane relative to the current rate, else null. */
function validateRange(range, latest) {
  const low = Number(range?.low);
  const high = Number(range?.high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low <= 0 || high <= 0 || low > high) return null;
  if (low < latest * 0.5 || high > latest * 2) return null; // wildly off — reject
  return { low, high };
}

// GET /api/ai/forecast?from=USD&to=EUR
// -> { from, to, current, asOf, history: [{date, rate}], forecast: {...} }
router.get('/forecast', async (req, res) => {
  const from = String(req.query.from || '').toUpperCase();
  const to = String(req.query.to || '').toUpperCase();

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return res.status(400).json({ error: 'Provide "from" and "to" as 3-letter currency codes.' });
  }
  if (from === to) {
    return res.status(400).json({ error: 'From and To currencies must be different.' });
  }

  let currencies;
  try {
    currencies = await getSupportedCurrencies();
  } catch (err) {
    console.error('Could not load currency list for forecast:', err);
    return res.status(503).json({ error: 'Currency list is temporarily unavailable.' });
  }
  if (!currencies.codes.has(from) || !currencies.codes.has(to)) {
    return res.status(422).json({ error: 'One of those currencies isn\'t supported by this app.' });
  }

  const cacheKey = `${from}-${to}`;
  const cached = forecastCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FORECAST_CACHE_TTL_MS) {
    return res.json(cached.payload);
  }

  let history;
  try {
    history = await getRateHistory(from, to);
  } catch (err) {
    console.error('Could not load rate history for forecast:', err);
    return res.status(503).json({ error: 'Recent exchange rates are temporarily unavailable.' });
  }
  if (history.length < 10) {
    return res.status(503).json({ error: 'Not enough recent rate data to build a forecast.' });
  }

  const stats = computeStats(history);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: buildForecastPrompt(),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            from,
            to,
            stats,
            recentRates: history.slice(-10),
          }),
        },
      ],
    });

    const raw = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const parsed = extractJson(raw);
    if (!parsed) {
      console.error('AI forecast returned non-JSON output:', raw);
      return res.status(502).json({ error: 'AI response was not valid JSON.' });
    }

    const next7 = validateRange(parsed.next_7_days, stats.latest);
    const next30 = validateRange(parsed.next_30_days, stats.latest);
    const factors = Array.isArray(parsed.factors)
      ? parsed.factors.filter((f) => typeof f === 'string' && f.trim()).slice(0, 3)
      : [];

    if (
      !TRENDS.includes(parsed.trend) ||
      !CONFIDENCES.includes(parsed.confidence) ||
      !next7 ||
      !next30 ||
      typeof parsed.summary !== 'string' ||
      !parsed.summary.trim()
    ) {
      console.error('AI forecast failed validation:', raw);
      return res.status(502).json({ error: 'AI returned an incomplete forecast. Please try again.' });
    }

    const payload = {
      from,
      to,
      current: stats.latest,
      asOf: stats.asOf,
      history: history.map(({ date, rate }) => ({ date, rate })),
      forecast: {
        trend: parsed.trend,
        confidence: parsed.confidence,
        next_7_days: next7,
        next_30_days: next30,
        summary: parsed.summary.trim(),
        factors,
      },
    };

    forecastCache.set(cacheKey, { at: Date.now(), payload });
    return res.json(payload);
  } catch (err) {
    console.error('AI forecast error:', err);
    return res.status(500).json({ error: 'AI forecast is currently unavailable.' });
  }
});

module.exports = router;
