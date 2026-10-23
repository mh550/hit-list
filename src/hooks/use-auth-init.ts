import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';

import { getSupabase } from '@/src/sync/client';
import { resolveAuthState } from '@/src/sync/auth';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';

// Mirrors the Supabase session into the auth store: once at launch (getSession), then on every
// SIGNED_IN / SIGNED_OUT / USER_UPDATED. INITIAL_SESSION repeats what getSession returned, so it is
// ignored, and so is TOKEN_REFRESHED for the account already shown. Each change takes a ticket when it
// happens; a profile fetch that finishes after a newer change is dropped, so the latest event wins.
// Offline with an expired access token, getSession answers no session and a retryable error while the
// session stays stored: the store keeps what it shows, and the refresh ticker's TOKEN_REFRESHED, once
// the phone is back online, brings in an account the store did not know yet.
export function useAuthInit(): void {
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setAuth({ ...SIGNED_OUT, status: 'unconfigured' });
      return;
    }
    let mounted = true;
    let latest = 0;
    const resolve = (ticket: number, session: Session | null) =>
      resolveAuthState(client, session).then((snapshot) => {
        if (mounted && ticket === latest) setAuth(snapshot);
      });
    const fromStoredSession = () => {
      const ticket = ++latest;
      client.auth
        .getSession()
        .then(({ data, error }) => {
          if (isAuthRetryableFetchError(error)) return;
          return resolve(ticket, data.session);
        })
        .catch(() => {
          if (mounted && ticket === latest) setAuth(SIGNED_OUT);
        });
    };

    fromStoredSession();

    // auth-js documents that awaiting a supabase call inside this callback can deadlock (a nested
    // refresh, or any auth call when a custom lock is set), so the callback stays synchronous and
    // defers the work.
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const unknownUser = event === 'TOKEN_REFRESHED' && session?.user.id !== useAuthStore.getState().userId;
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED' && !unknownUser) return;
      const ticket = ++latest;
      setTimeout(() => void resolve(ticket, session), 0);
    });

    // A profile that failed to load (offline launch) is fetched again when the app comes back.
    const appState = AppState.addEventListener('change', (state) => {
      const { status, userId, username } = useAuthStore.getState();
      if (state === 'active' && status === 'signed_in' && userId && !username) fromStoredSession();
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      appState.remove();
    };
  }, [setAuth]);
}
