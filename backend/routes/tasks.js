const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/auth');

// Every route below requires a valid Supabase access token.
router.use(requireAuth);

// GET /api/tasks  -> list the logged-in user's tasks
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tasks  -> create a task for the logged-in user
router.post('/', async (req, res) => {
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert([{ title, description: description || null, user_id: req.user.id }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/tasks/:id  -> update a task (only if it belongs to the user)
router.put('/:id', async (req, res) => {
  const { title, description, is_complete } = req.body;

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(is_complete !== undefined && { is_complete }),
    })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id) // ensures users can't edit others' tasks
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Task not found' });
  res.json(data);
});

// DELETE /api/tasks/:id  -> delete a task (only if it belongs to the user)
router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
