// Supabase client dedicated to the bill sharing feature (separate project with bill_* tables)
import { createClient } from '@supabase/supabase-js';

const SHARING_URL = import.meta.env.VITE_SHARING_SUPABASE_URL;
const SHARING_KEY = import.meta.env.VITE_SHARING_SUPABASE_KEY;

export const sharingSupabase = createClient(SHARING_URL, SHARING_KEY);
