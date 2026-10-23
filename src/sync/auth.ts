import { isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';

import { SIGNED_OUT, type AuthSnapshot } from '@/src/stores/auth-store';

// The auth store's view of a session. A profile that cannot be read (offline launch, no row yet) is
// 'signed_in' with no username, never 'needs_username': the rider is not trapped on the username
// screen, and useAuthInit refetches the profile when the app is next active.
export async function resolveAuthState(client: SupabaseClient, session: Session | null): Promise<AuthSnapshot> {
  if (!session) return SIGNED_OUT;
  const { user } = session;
  const signedIn: AuthSnapshot = {
    status: 'signed_in',
    userId: user.id,
    email: user.email ?? null,
    username: null,
    displayName: null,
  };
  try {
    const { data, error } = await client
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle<{ username: string | null; display_name: string | null }>();
    if (error || !data) return signedIn;
    return {
      ...signedIn,
      status: data.username ? 'signed_in' : 'needs_username',
      username: data.username,
      displayName: data.display_name,
    };
  } catch {
    return signedIn;
  }
}

const SEND_FAILED = "Couldn't send the code. Check your connection and try again.";

/**
 * Emails a 6-digit sign-in code (a new address gets an account). Resolves the message to show, or null when sent:
 * the error's `message` (fixed copy when offline), never the object.
 */
export async function sendSignInCode(client: SupabaseClient, email: string): Promise<string | null> {
  try {
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (!error) return null;
    // Offline, auth-js's message is the fetch's ('Network request failed').
    return isAuthRetryableFetchError(error) ? SEND_FAILED : error.message;
  } catch {
    return SEND_FAILED;
  }
}

/**
 * Checks an emailed code. Resolves the signed-in account (its profile read as resolveAuthState does), or null when
 * the code didn't work (wrong, expired, offline).
 */
export async function verifySignInCode(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<AuthSnapshot | null> {
  try {
    const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.session) return null;
    return await resolveAuthState(client, data.session);
  } catch {
    return null;
  }
}

/**
 * What saving the @username came to: 'taken' is the unique index (23505), 'invalid' the format check (23514),
 * 'failed' anything else, including an update that changed no row.
 */
export type SaveProfileResult = 'saved' | 'taken' | 'invalid' | 'failed';

/**
 * Writes the rider's @username and display name to their profile row (onboarding). The caller passes them already
 * normalized. RLS lets a rider update only their own row, and filters any other update down to no rows without an
 * error (the session is gone, the row is missing), so the updated row is read back to tell.
 */
export async function saveProfile(
  client: SupabaseClient,
  userId: string,
  username: string,
  displayName: string | null,
): Promise<SaveProfileResult> {
  try {
    const { data, error } = await client
      .from('profiles')
      .update({ username, display_name: displayName })
      .eq('id', userId)
      .select('id');
    if (!error) return data?.length ? 'saved' : 'failed';
    if (error.code === '23505') return 'taken';
    return error.code === '23514' ? 'invalid' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Signs the rider out (D62: plain sign out until S5 backs spots up and adds Keep / Remove). A server sign out that
 * fails (offline) or throws falls back to `scope: 'local'`, so the phone is always signed out afterwards.
 */
export async function signOutOfAccount(client: SupabaseClient): Promise<void> {
  try {
    const { error } = await client.auth.signOut();
    if (!error) return;
  } catch {
    // Fall through to the local sign out.
  }
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // Nothing more to try; the caller shows the rider as signed out.
  }
}

/**
 * Deletes the rider's account on the server through the account-delete Edge Function (D51), which takes the user
 * from the session's JWT, never from a body. Resolves true only for its `{ ok: true }`; the caller then signs out.
 */
export async function deleteAccount(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.functions.invoke<{ ok?: boolean }>('account-delete', { method: 'POST' });
    return !error && data?.ok === true;
  } catch {
    return false;
  }
}
