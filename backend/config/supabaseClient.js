const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// This client uses the SERVICE ROLE key, which bypasses Row Level Security.
// It must NEVER be exposed to the frontend — it only lives on the backend.
// We use it after we've already verified the user's identity ourselves.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// This client uses the public ANON key, used only to verify user JWTs
// (i.e. to ask Supabase "is this access token valid, and whose is it?").
const supabaseAuthClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = { supabaseAdmin, supabaseAuthClient };
