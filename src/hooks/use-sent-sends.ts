import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import { useAuthStore } from '@/src/stores/auth-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { listSent, listSentLinks, type SentLink, type SentSend } from '@/src/sync/sends';

interface Loaded {
  uid: string | null;
  sends: SentSend[] | null;
  links: SentLink[] | null;
  error: boolean;
}

/** A part that could not be read. */
const FAILED = Symbol('failed');
type Part<T> = T[] | typeof FAILED;

type Read = { uid: string; sends: Part<SentSend>; links: Part<SentLink> } | null;

/** One part's read; never rejects (an error warns and reads as FAILED). Null without a session. */
async function readPart<T>(what: string, read: () => Promise<T[] | null>): Promise<Part<T> | null> {
  try {
    return await read();
  } catch (err) {
    console.warn(`[sends] loading ${what} failed:`, errorMessage(err));
    return FAILED;
  }
}

/** listSent and listSentLinks for `uid`, side by side; never rejects. Null without a client or a session. */
async function readSent(db: SQLiteDatabase, uid: string): Promise<Read> {
  const client = getSupabase();
  if (!client) return null;
  const [sends, links] = await Promise.all([
    readPart('what you sent', () => listSent(db, client, uid)),
    readPart('your send links', () => listSentLinks(client, uid)),
  ]);
  return sends && links && { uid, sends, links };
}

/** A part that failed keeps what this rider's screen showed of it. */
function apply(prev: Loaded, read: Read): Loaded {
  if (!read) return prev;
  const same = prev.uid === read.uid;
  const keep = <T>(part: Part<T>, before: T[] | null): T[] | null => (part !== FAILED ? part : same ? before : null);
  return {
    uid: read.uid,
    sends: keep(read.sends, prev.sends),
    links: keep(read.links, prev.links),
    error: read.sends === FAILED || read.links === FAILED,
  };
}

/**
 * The Sent screen's data (S7, docs/plans/2026-10-22-s7-send.md "Sent"; S9-03 links): what the signed-in rider sent
 * to friends (listSent) and as links (listSentLinks), read together when the screen mounts and on `refresh` (pull to
 * refresh; `{ quiet: true }` after a Withdraw or a Revoke, without the pull-to-refresh spinner). `sends` and `links`
 * are null until a read of them for this rider went through; `error` is set when the last read of either failed
 * (what was there stays).
 */
export function useSentSends(): {
  sends: SentSend[] | null;
  links: SentLink[] | null;
  error: boolean;
  refreshing: boolean;
  refresh: (opts?: { quiet?: boolean }) => Promise<void>;
} {
  const db = useSQLiteContext();
  const userId = useAuthStore((s) => (s.status === 'signed_in' ? s.userId : null));
  const [loaded, setLoaded] = useState<Loaded>({ uid: null, sends: null, links: null, error: false });
  const [refreshing, setRefreshing] = useState(false);
  // only the newest read lands: an older one (a refresh before a Withdraw, another rider's) that ends later is dropped
  const newestRead = useRef(0);

  useEffect(() => {
    if (!userId) return;
    newestRead.current += 1;
    const read = newestRead.current;
    void readSent(db, userId).then((result) => {
      if (read === newestRead.current) setLoaded((prev) => apply(prev, result));
    });
    return () => {
      newestRead.current += 1;
    };
  }, [db, userId]);

  const refresh = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!userId) return;
      newestRead.current += 1;
      const read = newestRead.current;
      if (!quiet) setRefreshing(true);
      try {
        const result = await readSent(db, userId);
        if (read === newestRead.current) setLoaded((prev) => apply(prev, result));
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [db, userId],
  );

  // another rider's list never shows, even for the moment before the new one is read
  const mine = userId !== null && loaded.uid === userId;
  return {
    sends: mine ? loaded.sends : null,
    links: mine ? loaded.links : null,
    error: mine && loaded.error,
    refreshing,
    refresh,
  };
}
