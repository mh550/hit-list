/**
 * Accounts against the local stack (S4-06): sign up, the username rules, sign out and back in, and the account-delete
 * Edge Function run for real (docs/plans/2026-10-22-s4-accounts.md, "Integration harness"). Needs the stack:
 * npm run db:start, then npm run test:integration.
 */
import { randomUUID } from 'node:crypto';

import {
  adminClient,
  anonClient,
  anonKey,
  createRider,
  deleteRider,
  emailCode,
  signInAgain,
  supabaseUrl,
  uniqueUsername,
  type Rider,
} from './helpers';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);

let one: Rider;
let two: Rider;

beforeAll(async () => {
  one = await createRider(uniqueUsername('one'));
  two = await createRider(uniqueUsername('two'));
});

afterAll(async () => {
  await Promise.all([one, two].filter(Boolean).map((rider) => deleteRider(rider.userId)));
});

describe('signing up', () => {
  it('gives each rider their own user id', () => {
    expect(one.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(two.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(one.userId).not.toBe(two.userId);
  });

  it('leaves each rider with a session for their own user', async () => {
    for (const rider of [one, two]) {
      const { data, error } = await rider.client.auth.getSession();
      expect(error).toBeNull();
      expect(data.session?.user.id).toBe(rider.userId);
      expect(data.session?.access_token).toEqual(expect.any(String));
    }
  });

  it('saves the username on the profile row', async () => {
    const { data, error } = await one.client.from('profiles').select('username').eq('id', one.userId).single();
    expect(error).toBeNull();
    expect(data?.username).toBe(one.username);
  });
});

describe('signing out and back in', () => {
  it('ends the session, and a new email code restores one for the same user', async () => {
    const rider = await createRider(uniqueUsername('again'));
    try {
      const { error: signOutError } = await rider.client.auth.signOut();
      expect(signOutError).toBeNull();
      expect((await rider.client.auth.getSession()).data.session).toBeNull();

      const token = await emailCode(rider.email);
      const { data, error } = await rider.client.auth.verifyOtp({ email: rider.email, token, type: 'email' });
      expect(error).toBeNull();
      expect(data.user?.id).toBe(rider.userId);
      expect((await rider.client.auth.getSession()).data.session?.user.id).toBe(rider.userId);
    } finally {
      await deleteRider(rider.userId);
    }
  });

  it('a used code does not sign in a second time', async () => {
    const rider = await createRider(uniqueUsername('used'));
    try {
      const token = await emailCode(rider.email);
      const first = await signInAgainWith(rider.email, token);
      expect(first.error).toBeNull();
      const second = await signInAgainWith(rider.email, token);
      expect(second.error).not.toBeNull();
      expect(second.data.session).toBeNull();
    } finally {
      await deleteRider(rider.userId);
    }
  });
});

/** verifyOtp with a given code on a fresh client. */
function signInAgainWith(email: string, token: string) {
  return anonClient().auth.verifyOtp({ email, token, type: 'email' });
}

describe('usernames', () => {
  it("the second rider cannot take the first's username (23505)", async () => {
    const { data, error } = await two.client
      .from('profiles')
      .update({ username: one.username })
      .eq('id', two.userId)
      .select('id');
    expect(error?.code).toBe('23505');
    expect(data).toBeNull();
  });

  it('nor the same name in other letter case (citext)', async () => {
    const { error } = await two.client
      .from('profiles')
      .update({ username: one.username.toUpperCase() })
      .eq('id', two.userId)
      .select('id');
    expect(error?.code).toBe('23505');
  });

  it('a malformed username is refused by the format check (23514)', async () => {
    const { error } = await two.client.from('profiles').update({ username: 'an-a' }).eq('id', two.userId).select('id');
    expect(error?.code).toBe('23514');
  });

  it('the first rider finds the second by username, in any case', async () => {
    const { data, error } = await one.client.rpc('find_profile', { p_username: two.username.toUpperCase() });
    expect(error).toBeNull();
    expect(data).toEqual([{ id: two.userId, username: two.username, display_name: null }]);
  });
});

describe('account-delete', () => {
  const functionUrl = () => `${supabaseUrl()}/functions/v1/account-delete`;

  it('refuses a request with no rider JWT (401)', async () => {
    const response = await fetch(functionUrl(), {
      method: 'POST',
      headers: { apikey: anonKey(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  it('refuses a request whose bearer is the anon key, not a rider (401)', async () => {
    const response = await fetch(functionUrl(), {
      method: 'POST',
      headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  describe('as rider two, naming rider one in the body', () => {
    const spotId = randomUUID();
    const mediaId = randomUUID();
    const photoPath = () => `${two.userId}/${spotId}/${mediaId}.jpg`;
    let result: { data: unknown; error: unknown };

    beforeAll(async () => {
      const { error: spotError } = await two.client.from('spots').insert({
        id: spotId,
        owner_id: two.userId,
        lat: 47.6,
        lng: -122.3,
        updated_at: new Date().toISOString(),
      });
      if (spotError) throw spotError;
      const { error: uploadError } = await two.client.storage
        .from('photos')
        .upload(photoPath(), JPEG, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const listed = await adminClient().storage.from('photos').list(`${two.userId}/${spotId}`);
      expect(listed.data?.map((entry) => entry.name)).toEqual([`${mediaId}.jpg`]);

      result = await two.client.functions.invoke('account-delete', { body: { user_id: one.userId } });
    });

    it('answers { ok: true }', () => {
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ ok: true });
    });

    it('deletes rider two', async () => {
      const { data } = await adminClient().auth.admin.getUserById(two.userId);
      expect(data.user).toBeNull();
    });

    it("cascades away rider two's profile and spot", async () => {
      const admin = adminClient();
      const profiles = await admin.from('profiles').select('id').eq('id', two.userId);
      expect(profiles.data).toEqual([]);
      const spots = await admin.from('spots').select('id').eq('id', spotId);
      expect(spots.data).toEqual([]);
    });

    it("removes rider two's photo from Storage", async () => {
      const { data, error } = await adminClient().storage.from('photos').list(`${two.userId}/${spotId}`);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("rider one's find_profile no longer finds rider two", async () => {
      const { data, error } = await one.client.rpc('find_profile', { p_username: two.username });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('leaves rider one, whom the body named, untouched', async () => {
      const { data } = await adminClient().auth.admin.getUserById(one.userId);
      expect(data.user?.id).toBe(one.userId);
      const fresh = await signInAgain(one.email);
      const { data: profile } = await fresh.from('profiles').select('username').eq('id', one.userId).single();
      expect(profile?.username).toBe(one.username);
    });
  });
});
