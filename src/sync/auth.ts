import type { Session, SupabaseClient } from '@supabase/supabase-js';

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

/**
 * Emails a 6-digit sign-in code (a new address gets an account). Resolves the message to show, or null when sent:
 * the error's `message` only, never the object.
 */
export async function sendSignInCode(client: SupabaseClient, email: string): Promise<string | null> {
  try {
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return error ? error.message : null;
  } catch {
    return "Couldn't send the code. Try again.";
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
