const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.post('/transcribe', express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '15mb' }), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Speech-to-text is not configured. Add OPENAI_API_KEY to the backend environment.' });
  }

  const audio = req.body;
  if (!Buffer.isBuffer(audio) || audio.length === 0) {
    return res.status(400).json({ error: 'No audio recording was received.' });
  }

  const contentType = String(req.headers['content-type'] || 'audio/webm').split(';')[0];
  const extension = contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a'
    : contentType.includes('mpeg') ? 'mp3'
    : contentType.includes('wav') ? 'wav'
    : contentType.includes('ogg') ? 'ogg'
    : 'webm';

  try {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: contentType }), `conversion-${Date.now()}.${extension}`);
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
    form.append('response_format', 'json');
    form.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { error: raw || 'Unknown transcription error' }; }

    if (!response.ok) {
      console.error('OpenAI transcription error:', response.status, data);
      return res.status(502).json({ error: 'Speech-to-text service is unavailable. Please try again.' });
    }

    const text = String(data.text || '').trim();
    if (!text) return res.status(422).json({ error: 'No speech was detected in the recording.' });

    return res.json({ text });
  } catch (err) {
    console.error('Speech-to-text request failed:', err);
    return res.status(502).json({ error: 'Could not transcribe the recording.' });
  }
});

module.exports = router;
