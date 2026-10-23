import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useInboxStore } from '@/src/stores/inbox-store';
import { syncNow } from './engine';
import { errorMessage } from './errors';
import { NotAllowedError, respondInvite } from './lists';

/*
 * Join, from the Inbox or the Lists tab (S8-06, docs/plans/2026-10-22-s8-shared-lists.md "Inbox invitations"): the
 * rider's member row becomes 'member', then a sync, whose pull's fill brings the list and its spots. One join per
 * rider and list at a time, whichever tab asked.
 */

/** 'joined' (the sync runs on), 'withdrawn' (the invitation is gone; the item left the Inbox) or 'failed' (try again). */
export type JoinResult = 'joined' | 'withdrawn' | 'failed';

const joining = new Map<string, Promise<JoinResult>>();

/** Joins `listId`; resolves once the server answered, without waiting for the sync. Never rejects: a failure warns. */
export function joinList(db: SQLiteDatabase, client: SupabaseClient, uid: string, listId: string): Promise<JoinResult> {
  const key = `${uid}:${listId}`;
  const running = joining.get(key);
  if (running) return running;
  const run = (async (): Promise<JoinResult> => {
    try {
      // false: no session for the rider, or the phone isn't theirs yet (adoption pending)
      if (!(await respondInvite(db, client, uid, listId, 'join'))) return 'failed';
    } catch (err) {
      if (err instanceof NotAllowedError) {
        useInboxStore.getState().removeItem(uid, 'invite', listId);
        return 'withdrawn';
      }
      console.warn('[lists] joining failed:', errorMessage(err));
      return 'failed';
    } finally {
      joining.delete(key);
    }
    useInboxStore.getState().removeItem(uid, 'invite', listId);
    syncNow(db).catch((err: unknown) => console.warn('[lists] the sync after joining failed:', errorMessage(err)));
    return 'joined';
  })();
  joining.set(key, run);
  return run;
}
