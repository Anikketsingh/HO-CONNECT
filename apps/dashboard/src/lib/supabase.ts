import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Browser client, used only to log in. All data comes from the API, which checks
 * the access token and the user's dashboard role. With RLS on and no policies,
 * this key cannot read any table.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hoc-dashboard-auth' },
});
