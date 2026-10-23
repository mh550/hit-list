import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { sessionStorage } from './session-storage';

// The one Supabase client, built on first use. A build without both EXPO_PUBLIC_ values has none, and the
// app is the signed-out app (§3.1). Read with the dot form: Expo inlines only process.env.EXPO_PUBLIC_X.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  const created = createClient(url, anonKey, {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  // Refresh tokens only while the app is in the foreground (Supabase's Expo guide).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void created.auth.startAutoRefresh();
    else void created.auth.stopAutoRefresh();
  });
  client = created;
  return client;
}

export function isConfigured(): boolean {
  return getSupabase() !== null;
}
