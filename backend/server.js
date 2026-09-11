const express = require('express');
const cors = require('cors');
require('dotenv').config();

const tasksRouter = require('./routes/tasks');
const aiRouter = require('./routes/ai');

const app = express();

app.use(cors()); // for local dev; restrict origin in production
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    speechToText: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
    },
  });
});

app.use('/api/tasks', tasksRouter);
app.use('/api/ai', aiRouter);

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TaskFlow backend running on http://localhost:${PORT}`);
  console.log(`Speech-to-text configured: ${Boolean(process.env.OPENAI_API_KEY)}`);
});
