import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { countPending } from '@/src/db/sync';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { useSyncStore } from '@/src/stores/sync-store';
import { adopt } from '@/src/sync/adopt';
import { signOutOfAccount } from '@/src/sync/auth';
import { getSupabase } from '@/src/sync/client';
import { syncNow } from '@/src/sync/engine';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function notBackedUp(pending: number | null): string {
  const what =
    pending === null
      ? "Changes made on this phone haven't"
      : pending === 1
        ? "1 change made on this phone hasn't"
        : `${pending} changes made on this phone haven't`;
  return (
    `${what} reached your last account. Signing in here removes them from this phone. ` +
    'To keep them, cancel and sign in with that account first.'
  );
}

/**
 * Adoption (S5-06, D38, D66), mounted once inside DBInitializer next to useAuthInit: whenever a rider is signed in
 * (at launch, after sign-in) the phone's rows become theirs (adopt), then a sync runs. When another account's
 * changes never reached the server it asks first: Cancel signs this account out, Remove and continue adopts anyway.
 * Until adoption is done, and after sign-out, new spots and lists get no owner (sync store adoptedUserId). An
 * adoption that threw is tried again when the app returns to the foreground.
 */
export function useAdoption(): void {
  const db = useSQLiteContext();
  const userId = useAuthStore((s) => (s.status === 'signed_in' ? s.userId : null));

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const stillSignedIn = () => {
      const { status, userId: shown } = useAuthStore.getState();
      return live && status === 'signed_in' && shown === userId;
    };

    // a thrown adoption is tried again on the next return to the foreground
    let failed = false;

    const signOut = async () => {
      if (!stillSignedIn()) return;
      const client = getSupabase();
      if (client) await signOutOfAccount(client);
      useAuthStore.getState().setAuth(SIGNED_OUT);
    };

    const run = async (confirmSwitch: boolean) => {
      if (!stillSignedIn()) return;
      let result;
      try {
        result = confirmSwitch ? await adopt(db, userId, { confirmSwitch }) : await adopt(db, userId);
      } catch (err) {
        console.warn('[sync] adoption failed:', message(err));
        failed = true;
        return;
      }
      if (!stillSignedIn()) return;
      if (result === 'done') {
        useSyncStore.setState({ adoptedUserId: userId });
        void syncNow(db);
        return;
      }
      const pending = await countPending(db).catch(() => null);
      Alert.alert('Changes not backed up', notBackedUp(pending), [
        { text: 'Cancel', style: 'cancel', onPress: () => void signOut() },
        { text: 'Remove and continue', style: 'destructive', onPress: () => void run(true) },
      ]);
    };

    void run(false);
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !failed) return;
      failed = false;
      void run(false);
    });
    return () => {
      live = false;
      appState.remove();
      useSyncStore.setState({ adoptedUserId: null });
    };
  }, [db, userId]);
}
