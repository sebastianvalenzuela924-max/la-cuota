// Supabase client dedicated to Saldamos (groups, balances, auth)
import { createClient } from '@supabase/supabase-js';
import type { SaldamosDatabase } from './saldamos-types';

const SALDAMOS_URL = import.meta.env.VITE_SALDAMOS_SUPABASE_URL;
const SALDAMOS_KEY = import.meta.env.VITE_SALDAMOS_SUPABASE_KEY;

export const saldamosSupabase = createClient<SaldamosDatabase>(SALDAMOS_URL, SALDAMOS_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'saldamos-auth', // Separate storage key from La Cuota
  }
});
