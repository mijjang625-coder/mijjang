import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Vite HMR + React StrictMode 환경에서 클라이언트 중복 생성 방지
const SUPABASE_SINGLETON_KEY = '__coupang_supabase_client_v1__';

function getSupabaseSingleton() {
  if (!isSupabaseConfigured) return null;

  const store = globalThis;
  if (!store[SUPABASE_SINGLETON_KEY]) {
    store[SUPABASE_SINGLETON_KEY] = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }

  return store[SUPABASE_SINGLETON_KEY];
}

export const supabase = getSupabaseSingleton();
