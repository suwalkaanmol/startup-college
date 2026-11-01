// Owner client: a real Supabase Auth user, linked to exactly one shop via shop_owners (RLS enforces it).
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'http://localhost', import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing');
