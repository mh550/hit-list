import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSyncState } from '@/src/db/sync';

/** The client holds a session for `uid` right now. */
export async function signedInAs(client: SupabaseClient, uid: string): Promise<boolean> {
  const { data, error } = await client.auth.getSession();
  return !error && data.session?.user.id === uid;
}

/**
 * Push and pull run only with a session for `uid`, on a phone whose rows are `uid`'s (sync_state.user_id): anything
 * else would send one account's rows under another, or pull and reconcile one account's data into another's.
 */
export async function maySync(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<boolean> {
  return (await signedInAs(client, uid)) && (await getSyncState(db, 'user_id')) === uid;
}
