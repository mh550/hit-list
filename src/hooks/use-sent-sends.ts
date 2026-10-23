import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import { useAuthStore } from '@/src/stores/auth-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { listSent, type SentSend } from '@/src/sync/sends';

interface Loaded {
  uid: string | null;
  sends: SentSend[] | null;
  error: boolean;
}

type Read = { uid: string; sends: SentSend[] } | { uid: string; error: true } | null;

/** listSent for `uid`; never rejects (an error warns and reads as `error`). Null without a client or a session. */
async function readSent(db: SQLiteDatabase, uid: string): Promise<Read> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const sends = await listSent(db, client, uid);
    return sends && { uid, sends };
  } catch (err) {
    console.warn('[sends] loading what you sent failed:', errorMessage(err));
    return { uid, error: true };
  }
}

/** A failed read keeps what this rider's list showed. */
function apply(prev: Loaded, read: Read): Loaded {
  if (!read) return prev;
  if ('sends' in read) return { uid: read.uid, sends: read.sends, error: false };
  return prev.uid === read.uid ? { ...prev, error: true } : { uid: read.uid, sends: null, error: true };
}

/**
 * The Sent screen's data (S7, docs/plans/2026-10-22-s7-send.md "Sent"): what the signed-in rider sent, read with
 * listSent when the screen mounts and on `refresh` (pull to refresh, after a Withdraw). `sends` is null until the
 * first read for this rider went through; `error` is set when the last read failed (what was there stays).
 */
export function useSentSends(): {
  sends: SentSend[] | null;
  error: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const db = useSQLiteContext();
  const userId = useAuthStore((s) => (s.status === 'signed_in' ? s.userId : null));
  const [loaded, setLoaded] = useState<Loaded>({ uid: null, sends: null, error: false });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void readSent(db, userId).then((read) => {
      if (live) setLoaded((prev) => apply(prev, read));
    });
    return () => {
      live = false;
    };
  }, [db, userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const read = await readSent(db, userId);
      setLoaded((prev) => apply(prev, read));
    } finally {
      setRefreshing(false);
    }
  }, [db, userId]);

  // another rider's list never shows, even for the moment before the new one is read
  const mine = userId !== null && loaded.uid === userId;
  return { sends: mine ? loaded.sends : null, error: mine && loaded.error, refreshing, refresh };
}
