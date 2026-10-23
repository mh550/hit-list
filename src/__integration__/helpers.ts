/**
 * Riders against the local stack (S4-06). Run only by `npm run test:integration`, which reads the URL and keys from
 * `npx supabase status -o json` (scripts/supabase-env.mjs); nothing here is a key.
 *
 * A rider signs in the way the app does (an email code), but the code comes from the Auth admin API instead of the
 * mailbox: `auth.admin.generateLink({ type: 'magiclink', email })` returns it as `properties.email_otp`. Member names
 * are from node_modules/@supabase/auth-js/dist/module/lib/types.d.ts (`GenerateLinkProperties.email_otp`, l.849) and
 * node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts (`generateLink` l.249, `createUser` l.330,
 * `getUserById` l.430, `deleteUser` l.608).
 */
import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Rider = { client: SupabaseClient; userId: string; username: string; email: string };

function env(name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const values = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const value = values[name];
  if (!value) throw new Error(`${name} is not set: run these tests with npm run test:integration`);
  return value;
}

/** No session is stored and none is refreshed in the background, so a test run leaves no timers behind. */
const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false } };

export const supabaseUrl = () => env('SUPABASE_URL');
export const anonKey = () => env('SUPABASE_ANON_KEY');

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), NO_PERSIST);
}

export function anonClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), NO_PERSIST);
}

/** A fresh 6-digit email code for an existing user, as if read from the mail. */
export async function emailCode(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return data.properties.email_otp;
}

/** Signs `client` in with a fresh email code; resolves the user id of the session. */
export async function verifyWithCode(client: SupabaseClient, email: string): Promise<string> {
  const token = await emailCode(email);
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error(`verifyOtp gave no session for ${email}`);
  return data.user.id;
}

/** A fresh anon client signed in as `email` with a new code. */
export async function signInAgain(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  await verifyWithCode(client, email);
  return client;
}

/**
 * A new rider: an auth user (email already confirmed), signed in on their own anon client with an email code, with
 * `username` set on their profile row (made by the handle_new_user trigger) as the username screen does.
 */
export async function createRider(username: string): Promise<Rider> {
  const email = `${username}-${randomUUID().slice(0, 8)}@example.test`;
  const { data: created, error: createError } = await adminClient().auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError) throw createError;

  // A rider half made (no session, no username) is deleted here: the caller never gets an id to clean up with.
  try {
    const client = anonClient();
    const userId = await verifyWithCode(client, email);
    const { data, error } = await client.from('profiles').update({ username }).eq('id', userId).select('id');
    if (error) throw error;
    if (data.length !== 1) throw new Error(`no profile row was updated for ${email}`);
    return { client, userId, username, email };
  } catch (error) {
    await deleteRider(created.user.id);
    throw error;
  }
}

/** Deletes a rider left by a test; a rider already gone is fine. */
export async function deleteRider(userId: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error && error.status !== 404) throw error;
}

/** Every file under `prefix` in the photos bucket, down any depth of folders (a folder has `id` null). */
async function photoPaths(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const { data, error } = await admin.storage.from('photos').list(prefix, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) paths.push(...(await photoPaths(admin, path)));
    else paths.push(path);
  }
  return paths;
}

/**
 * Deletes a rider and their photos the way Delete account does: a fresh session (the test may have ended with the
 * rider signed out) calls the account-delete Edge Function. When that can't run (no code, the edge runtime down), the
 * admin API removes the files under `<uid>/` and then the user. Never throws: it runs in afterAll.
 */
export async function deleteRiderAndPhotos(email: string, userId: string): Promise<void> {
  try {
    const client = await signInAgain(email);
    const { data, error } = await client.functions.invoke<{ ok?: boolean }>('account-delete');
    if (!error && data?.ok === true) return;
  } catch {
    // Fall through to the admin API.
  }
  try {
    const admin = adminClient();
    const paths = await photoPaths(admin, userId);
    if (paths.length) {
      const { error } = await admin.storage.from('photos').remove(paths);
      if (error) throw error;
    }
    await deleteRider(userId);
  } catch (error) {
    console.warn(`could not delete rider ${userId}:`, error);
  }
}

/** A unique username for a test run (D39: 3–20 of a–z 0–9 _ .). */
export function uniqueUsername(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
