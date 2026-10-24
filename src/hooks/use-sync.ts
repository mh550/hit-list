import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { useAuthStore } from '@/src/stores/auth-store';
import { SYNC_INTERVAL_MS, syncNow } from '@/src/sync/engine';

/**
 * The sync triggers (D48), mounted once inside DBInitializer (so the DB is ready): while a rider is signed in, a sync
 * now, on every return to the foreground, and every 5 minutes while the app is in the foreground. The timer stops in
 * the background, on sign-out and on unmount. The engine itself decides whether this phone may sync for the session.
 */
export function useSync(): void {
  const db = useSQLiteContext();
  const userId = useAuthStore((s) => (s.status === 'signed_in' ? s.userId : null));

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      timer ??= setInterval(() => void syncNow(db), SYNC_INTERVAL_MS);
    };
    const stopTimer = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    void syncNow(db);
    startTimer();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncNow(db);
        startTimer();
      } else if (state === 'background') {
        stopTimer();
      }
    });
    return () => {
      stopTimer();
      appState.remove();
    };
  }, [db, userId]);
}
