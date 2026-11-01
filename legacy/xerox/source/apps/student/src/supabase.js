// Browser client (anon key only) + anonymous student session. Students never log in.
import { createClient } from '@supabase/supabase-js';
const cfg = window.XEROX_CONFIG || {};
// config.js (next to index.html) wins; the .env values are used while developing.
export const SUPABASE_URL = cfg.supabaseUrl?.startsWith('https://') ? cfg.supabaseUrl : import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = cfg.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
// The storage key is prefixed so it never collides with another module's login on the same site.
export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_KEY || 'missing', { auth: { storageKey: 'xerox-student-auth' } });
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const { data: d, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return d.user;
}
