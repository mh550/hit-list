/**
 * The share-preview Edge Function against the local stack (S9-02, docs/plans/2026-10-22-s9-links.md "share-preview"):
 * a browser with no account and no Authorization header asks for `?t=<token>`. A live send link answers its frozen
 * spots with 10-minute signed photo URLs and the sender; an invite link answers the list name and the inviter only;
 * every dead token (unknown, malformed, revoked, withdrawn, expired) answers the same 404 `{"error":"gone"}`, byte for
 * byte, with the same headers (§3.6: never say which). Needs the stack: npm run db:start, then npm run
 * test:integration.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { adminClient, createRider, deleteRiderAndPhotos, supabaseUrl, uniqueUsername, type Rider } from './helpers';

// phones.ts's FIXTURE, read here: phones.ts pulls in the app's photo module (expo-image-manipulator), not needed here.
const FIXTURE = new Uint8Array(readFileSync(join(__dirname, '../__tests__/fixtures/photo-2kb.jpg')));

const riders: Rider[] = [];
let ana: Rider;

const functionUrl = () => `${supabaseUrl()}/functions/v1/share-preview`;
/** A token as the app makes one (S9-03): 16 random bytes as base64url, 22 chars. */
const newToken = () => randomBytes(16).toString('base64url');
const sha = (token: string) => createHash('sha256').update(token).digest('hex');

/** The function as a browser calls it: a plain GET, no headers at all. */
async function preview(token: string): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(`${functionUrl()}?t=${encodeURIComponent(token)}`);
  return { status: response.status, text: await response.text(), headers: response.headers };
}

async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.code} ${error.message}`);
  return data as T;
}

type FrozenSpotInput = {
  name: string | null;
  generated_name: string | null;
  lat: number;
  lng: number;
  feature_types: string[];
  stopped: boolean;
  natural_speed: number | null;
  notes: string | null;
};

/**
 * A link-only send (recipient NULL) of `spots`, each with `photosPerSpot` fixture photos staged under
 * `sends/<id>/` as the app stages them (S7, D77), then create_send. `extraPhotos` are payload photo entries added
 * as written (paths the sender typed; the function must not trust them).
 */
async function linkOnlySend(
  rider: Rider,
  spots: FrozenSpotInput[],
  photosPerSpot = 0,
  extraPhotos: { media_id: string; path: string; captured_at: null }[] = [],
): Promise<{ sendId: string; photoPaths: string[] }> {
  const sendId = randomUUID();
  const photoPaths: string[] = [];
  const frozen = [];
  for (const spot of spots) {
    const photos = [];
    for (let i = 0; i < photosPerSpot; i++) {
      const mediaId = randomUUID();
      const path = `sends/${sendId}/${mediaId}.jpg`;
      const { error } = await rider.client.storage
        .from('photos')
        .upload(path, FIXTURE, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      photoPaths.push(path);
      photos.push({ media_id: mediaId, path, captured_at: '2026-10-20' });
    }
    frozen.push({ id: randomUUID(), ...spot, photos: frozen.length === 0 ? [...photos, ...extraPhotos] : photos });
  }
  await rpc(rider.client, 'create_send', {
    p_id: sendId,
    p_recipient: null,
    p_payload: { v: 1, sender: { username: 'forged', display_name: 'Forged' }, spots: frozen },
  });
  return { sendId, photoPaths };
}

async function sendLink(rider: Rider, sendId: string, expiresAt: string | null): Promise<{ id: string; token: string }> {
  const token = newToken();
  const id = await rpc<string>(rider.client, 'create_link', {
    p_kind: 'send',
    p_target: sendId,
    p_token_sha256: sha(token),
    p_expires_at: expiresAt,
  });
  return { id, token };
}

const inADay = () => new Date(Date.now() + 864e5).toISOString();

const SPOTS: FrozenSpotInput[] = [
  {
    name: 'Library rail',
    generated_name: 'Capitol Hill',
    lat: 47.6062,
    lng: -122.3321,
    feature_types: ['rail', 'ledge'],
    stopped: true,
    natural_speed: 0,
    notes: 'Kinked, 12 stairs',
  },
  {
    name: null,
    generated_name: 'Fremont',
    lat: 47.651,
    lng: -122.35,
    feature_types: [],
    stopped: false,
    natural_speed: null,
    notes: null,
  },
];

let outsidePath: string;

async function setDisplayName(name: string) {
  const { error } = await ana.client.from('profiles').update({ display_name: name }).eq('id', ana.userId);
  if (error) throw error;
}

let live: { sendId: string; photoPaths: string[]; link: { id: string; token: string } };

beforeAll(async () => {
  ana = await createRider(uniqueUsername('ana'));
  riders.push(ana);
  await setDisplayName('Ana A');
  // A photo entry the sender wrote pointing at a real object outside sends/<id>/ (her own spot photo): a function
  // that signed payload paths as written would sign it.
  const outside = randomUUID();
  outsidePath = `${ana.userId}/${randomUUID()}/${outside}.jpg`;
  const { error } = await adminClient()
    .storage.from('photos')
    .upload(outsidePath, FIXTURE, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const send = await linkOnlySend(ana, SPOTS, 1, [{ media_id: outside, path: outsidePath, captured_at: null }]);
  live = { ...send, link: await sendLink(ana, send.sendId, inADay()) };
  // The sender shown is the profile's now, not the name create_send stamped into the payload (D80).
  await setDisplayName('Ana B');
});

afterAll(async () => {
  for (const rider of riders) await deleteRiderAndPhotos(rider.email, rider.userId);
});

describe('a live send link', () => {
  it('answers 200 with the frozen spots, signed photo URLs and the server-side sender, with no auth header', async () => {
    const { status, text, headers } = await preview(live.link.token);
    expect(status).toBe(200);
    expect(headers.get('content-type')).toMatch(/^application\/json/);
    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('access-control-allow-origin')).toBe('*');

    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(['expires_at', 'kind', 'sender', 'spots']);
    expect(body.kind).toBe('send');
    expect(body.sender).toEqual({ username: ana.username, display_name: 'Ana B' });
    expect(typeof body.expires_at).toBe('string');
    expect(body.spots).toHaveLength(2);
    expect(body.spots.map(({ photo_urls: _, ...rest }: { photo_urls: string[] }) => rest)).toEqual(SPOTS);
    // the payload's id is the sender's spot id: never shown
    expect(Object.keys(body.spots[0]).sort()).toEqual(
      [...Object.keys(SPOTS[0]), 'photo_urls'].sort(),
    );
  });

  it('signs only the photos under sends/<id>/, with URLs on the public origin that fetch the fixture bytes', async () => {
    const body = JSON.parse((await preview(live.link.token)).text);
    const urls: string[] = body.spots.flatMap((s: { photo_urls: string[] }) => s.photo_urls);
    // one staged photo per spot; the sender's out-of-folder path (a real object) got no URL
    expect(body.spots.map((s: { photo_urls: string[] }) => s.photo_urls.length)).toEqual([1, 1]);
    expect(urls.map((url) => new URL(url).pathname)).toEqual(
      live.photoPaths.map((path) => `/storage/v1/object/sign/photos/${path}`),
    );
    for (const url of urls) {
      expect(new URL(url).origin).toBe(new URL(supabaseUrl()).origin);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(FIXTURE);
    }
    expect(urls.join(' ')).not.toContain(ana.userId);
    expect(urls.join(' ')).not.toContain(outsidePath);
  });

  it('answers OPTIONS with CORS and anything but GET with 405', async () => {
    const options = await fetch(functionUrl(), { method: 'OPTIONS' });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe('*');
    expect(options.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    await options.text();
    const post = await fetch(`${functionUrl()}?t=${live.link.token}`, { method: 'POST' });
    expect(post.status).toBe(405);
    expect(await post.json()).toEqual({ error: 'method not allowed' });
  });
});

describe('an invite link', () => {
  it('answers the list name and the inviter, no spots', async () => {
    const listId = randomUUID();
    const { error } = await ana.client
      .from('hit_lists')
      .insert({ id: listId, owner_id: ana.userId, name: 'Downtown', kind: 'manual', updated_at: new Date().toISOString() });
    if (error) throw error;
    await rpc(ana.client, 'share_list', { p_list: listId });
    const token = newToken();
    await rpc(ana.client, 'create_link', {
      p_kind: 'invite',
      p_target: listId,
      p_token_sha256: sha(token),
      p_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      p_role: 'add',
    });

    const { status, text } = await preview(token);
    expect(status).toBe(200);
    const body = JSON.parse(text);
    expect(body).toEqual({
      kind: 'invite',
      list_name: 'Downtown',
      inviter: { username: ana.username, display_name: 'Ana B' },
      expires_at: expect.any(String),
    });
    expect(body.spots).toBeUndefined();
  });
});

describe('a dead token', () => {
  const GONE = '{"error":"gone"}';
  /** Each dead case's token, made dead in beforeAll after checking it was live (so a 404 proves the change). */
  const dead: Record<string, string> = {};

  async function liveSendLink(): Promise<{ sendId: string; link: { id: string; token: string } }> {
    const send = await linkOnlySend(ana, SPOTS.slice(0, 1));
    const link = await sendLink(ana, send.sendId, inADay());
    expect((await preview(link.token)).status).toBe(200);
    return { sendId: send.sendId, link };
  }

  async function liveInviteLink(): Promise<{ listId: string; token: string }> {
    const listId = randomUUID();
    const { error } = await ana.client
      .from('hit_lists')
      .insert({ id: listId, owner_id: ana.userId, name: 'Gone soon', kind: 'manual', updated_at: new Date().toISOString() });
    if (error) throw error;
    await rpc(ana.client, 'share_list', { p_list: listId });
    const token = newToken();
    await rpc(ana.client, 'create_link', {
      p_kind: 'invite',
      p_target: listId,
      p_token_sha256: sha(token),
      p_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      p_role: 'view',
    });
    expect((await preview(token)).status).toBe(200);
    return { listId, token };
  }

  beforeAll(async () => {
    dead.unknown = newToken();
    dead.malformed = 'not a token';
    dead.empty = '';

    const revoked = await liveSendLink();
    await rpc(ana.client, 'revoke_link', { p_id: revoked.link.id });
    dead.revoked = revoked.link.token;

    const withdrawn = await liveSendLink();
    await rpc(ana.client, 'withdraw_send', { p_id: withdrawn.sendId });
    dead.withdrawn = withdrawn.link.token;

    const expired = await liveSendLink();
    const { error } = await adminClient()
      .from('links')
      .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
      .eq('id', expired.link.id);
    if (error) throw error;
    dead.expired = expired.link.token;

    const used = await liveInviteLink();
    const ben = await createRider(uniqueUsername('ben'));
    riders.push(ben);
    expect(await rpc(ben.client, 'redeem_invite', { p_token: used.token })).toBe(used.listId);
    dead.used = used.token;

    const unshared = await liveInviteLink();
    await rpc(ana.client, 'stop_sharing', { p_list: unshared.listId });
    dead.unshared = unshared.token;

    const deleted = await liveInviteLink();
    const { error: deleteError } = await ana.client
      .from('hit_lists')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', deleted.listId);
    if (deleteError) throw deleteError;
    dead.deleted = deleted.token;
  });

  it.each(['unknown', 'malformed', 'empty', 'revoked', 'withdrawn', 'expired', 'used', 'unshared', 'deleted'])(
    'answers 404 gone for a %s token',
    async (name) => {
      const answer = await preview(dead[name]);
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(GONE);
    },
  );

  it('is byte-identical across every dead case, headers included', async () => {
    const shape = (h: Headers) =>
      ['content-type', 'cache-control', 'access-control-allow-origin', 'referrer-policy'].map((k) => h.get(k));
    const answers = await Promise.all(Object.values(dead).map(preview));
    expect(answers).toHaveLength(9);
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(GONE);
      expect(shape(answer.headers)).toEqual(['application/json', 'no-store', '*', 'no-referrer']);
    }
  });
});
