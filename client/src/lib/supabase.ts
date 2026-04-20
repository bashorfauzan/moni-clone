import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);
export const useDirectSupabaseData = hasSupabaseEnv && import.meta.env.VITE_USE_SUPABASE_DATA === 'true';

if (!hasSupabaseEnv) {
    console.warn('Supabase credentials missing. Check client environment variables.');
}

export const supabase = hasSupabaseEnv
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        }
    })
    : null;
