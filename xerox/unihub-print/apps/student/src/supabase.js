// Browser client (anon key only) + anonymous student session. Students never log in.
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'http://localhost', import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing');
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const { data: d, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return d.user;
}
