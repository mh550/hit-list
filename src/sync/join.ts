import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useInboxStore } from '@/src/stores/inbox-store';
import { parseToken } from '@/src/utils/link-token';
import { maySync, signedInAs } from './account';
import { syncNow } from './engine';
import { errorMessage, serverError } from './errors';
import { LinkGoneError } from './links';
import { NotAllowedError, respondInvite } from './lists';

/*
 * Join, from the Inbox or the Lists tab (S8-06, docs/plans/2026-10-22-s8-shared-lists.md "Inbox invitations"): the
 * rider's member row becomes 'member', then a sync, whose pull's fill brings the list and its spots. One join per
 * rider and list at a time, whichever tab asked.
 */

/** 'joined' (the sync runs on), 'withdrawn' (the invitation is gone; the item left the Inbox) or 'failed' (try again). */
export type JoinResult = 'joined' | 'withdrawn' | 'failed';

const joining = new Map<string, Promise<JoinResult>>();

/** Whether a join of `listId` by `uid` is waiting for the server (a Decline then waits: the join wins). */
export function isJoining(uid: string, listId: string): boolean {
  return joining.has(`${uid}:${listId}`);
}

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

const redeeming = new Map<string, Promise<string | null>>();

/**
 * Joins a shared list with an invite link (S9, the Inbox's Paste a link): the token of a pasted link or a bare token
 * goes to redeem_invite (single use; D60: the owner or an existing member gets the list id and nothing changes),
 * then a sync brings the list and its spots (a failed sync only warns). Resolves the list id; LinkGoneError for text
 * with no token and for every dead invite (42501 'invalid invite'); null without a session for `uid` on a phone that
 * is theirs. One redeem per rider and token at a time.
 */
export function redeemInvite(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  textOrToken: string,
): Promise<string | null> {
  const token = parseToken(textOrToken);
  if (token === null) return Promise.reject(new LinkGoneError());
  const key = `${uid}:${token}`;
  const running = redeeming.get(key);
  if (running) return running;
  const run = (async (): Promise<string | null> => {
    try {
      if (!(await maySync(db, client, uid))) return null;
      const { data, error } = await client.rpc('redeem_invite', { p_token: token });
      if (error) {
        // 42501 is also "not signed in"
        if (!(await signedInAs(client, uid))) return null;
        throw error.code === '42501' ? new LinkGoneError() : serverError(error);
      }
      try {
        await syncNow(db);
      } catch (err) {
        console.warn('[lists] the sync after joining by link failed:', errorMessage(err));
      }
      return data as string;
    } finally {
      redeeming.delete(key);
    }
  })();
  redeeming.set(key, run);
  return run;
}
