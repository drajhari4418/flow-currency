const { supabaseAuthClient } = require('../config/supabaseClient');

/**
 * Express middleware that verifies the Supabase access token sent by the
 * Angular frontend in the Authorization header ("Bearer <token>").
 *
 * On success it attaches req.user = { id, email } and calls next().
 * On failure it responds with 401.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
}

module.exports = { requireAuth };
