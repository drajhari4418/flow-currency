const express = require('express');
const cors = require('cors');
require('dotenv').config();
const cron = require('node-cron');

const tasksRouter = require('./routes/tasks');
const aiRouter = require('./routes/ai');
const { sendDueDateReminders } = require('./services/reminders');

const app = express();

app.use(cors()); // for local dev; restrict origin in production
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    speechToText: {
      provider: 'browser-local-whisper',
      configured: true,
      model: 'Xenova/whisper-tiny',
    },
  });
});

app.use('/api/tasks', tasksRouter);
app.use('/api/ai', aiRouter);

// Optional manual trigger, useful for testing the reminder job locally
// without waiting for the cron schedule. Guarded by REMINDER_TEST_KEY so a
// stranger hitting the public Render URL can't trigger it — leave
// REMINDER_TEST_KEY unset in production to disable this route entirely.
app.post('/api/tasks-internal/send-reminders', async (req, res) => {
  if (!process.env.REMINDER_TEST_KEY || req.query.key !== process.env.REMINDER_TEST_KEY) {
    return res.status(404).end();
  }
  const result = await sendDueDateReminders();
  res.json(result);
});

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TaskFlow backend running on http://localhost:${PORT}`);
  console.log('Speech-to-text: browser-local Whisper (no paid API key required)');

  // Every day at 08:00 server time: runs BOTH reminder stages — emails
  // anyone with an incomplete task due tomorrow, and anyone with one due
  // today. See README-REMINDERS.md for the Render free-tier caveat.
  cron.schedule('0 8 * * *', () => {
    sendDueDateReminders();
  });
  console.log('Task due-date reminder job scheduled for 08:00 daily.');
});
