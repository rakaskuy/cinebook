import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseServerConfigured = Boolean(
  supabaseUrl &&
  supabaseServiceKey &&
  !supabaseUrl.includes('your-project')
);

// Privileged server-only Supabase client for API routes and server actions
export const supabaseAdmin = isSupabaseServerConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
