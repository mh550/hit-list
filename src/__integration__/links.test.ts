/**
 * Links end to end against the local stack (S9-05, D44/D45, docs/plans/2026-10-22-s9-links.md "Tests"): ana makes a
 * send link the way Copy link does (src/sync/sends `createLinkSend`, then src/sync/links `createSendLink`), and anyone
 * holding it reads her 2 spots from the share-preview function with no account and no Authorization header, until she
 * revokes it or it expires (then the same 404 gone). The static page (web/share/, served here by Node's http module)
 * renders the live function's answer in jsdom. An invite link to ana's shared list joins a signed-in rider once
 * (`redeemInvite` from src/sync/join), never an anonymous caller, and nobody after its one use; D60: the member who
 * used it gets the list id back again and nothing changes. Needs the stack: npm run db:start, then npm run
 * test:integration.
 *
 * The cases run in order and share the riders and the links.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

import type { SQLiteDatabase } from 'expo-sqlite';
import { JSDOM } from 'jsdom';

import { addSpotsToList, getHitLists, getSpots, insertHitList, insertMedia, insertSpot } from '@/src/db';
import { getMembers } from '@/src/db/hit-lists';
import { setSyncState } from '@/src/db/sync';
import { redeemInvite } from '@/src/sync/join';
import {
  createInviteLink,
  createSendLink,
  LinkGoneError,
  listMyLinks,
  previewLink,
  revokeLink,
  shareBaseUrl,
} from '@/src/sync/links';
import { shareList } from '@/src/sync/lists';
import type { PhotoIO } from '@/src/sync/photos';
import { createLinkSend, listSentLinks, makeSendLink, revokeSentLink } from '@/src/sync/sends';
import { createMigratedTestDb } from '@/src/__tests__/helpers/node-sqlite-db';
import { FeatureType, type HitList, type Spot } from '@/src/types';
import { newId } from '@/src/utils/id';
import { parseToken } from '@/src/utils/link-token';

import { adminClient, anonClient, createRider, deleteRiderAndPhotos, supabaseUrl, uniqueUsername, type Rider } from './helpers';
import { FIXTURE, nodePhotoIO, pullAll, pushAll } from './phones';

// links.ts and join.ts reach the app's client module through their imports, which need React Native; these tests hand
// their own clients to every call, so the app client is never used (redeemInvite's syncNow then does nothing: the
// tests pull themselves).
jest.mock('@/src/sync/client', () => ({ getSupabase: () => null, isConfigured: () => false }));
// photos.ts imports the manipulator for preparePhoto, which nodePhotoIO replaces (no native module in Node).
jest.mock('expo-image-manipulator', () => ({}));
// expo-crypto is native on the phone; Node's crypto here (member names from expo-crypto's build/Crypto.d.ts).
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytes: (byteCount: number) => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
    // honours both arguments: a tokenHash that asked for another algorithm or encoding would miss the server's hash
    digestStringAsync: async (algorithm: string, data: string, options?: { encoding?: 'hex' | 'base64' }) =>
      nodeCrypto
        .createHash(algorithm.replace('-', '').toLowerCase())
        .update(data)
        .digest(options?.encoding ?? 'hex'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  };
});

/** A rider and their phone: the phone's account is theirs (sync_state.user_id), as after adoption. */
type Phone = Rider & { db: SQLiteDatabase; io: PhotoIO };

const riders: { email: string; userId: string }[] = [];
const tempDirs: string[] = [];

async function newPhone(name: string): Promise<Phone> {
  const rider = await createRider(uniqueUsername(name));
  riders.push({ email: rider.email, userId: rider.userId });
  const dir = mkdtempSync(join(tmpdir(), 'hl-links-'));
  tempDirs.push(dir);
  const db = await createMigratedTestDb();
  await setSyncState(db, 'user_id', rider.userId);
  return { ...rider, db, io: nodePhotoIO(dir) };
}

const now = () => new Date().toISOString();

/** An owned spot with one fixture photo, as Quick Add leaves it. */
async function spotWithPhoto(p: Phone, name: string): Promise<Spot> {
  const at = now();
  const spot: Spot = {
    id: newId(),
    name,
    location: { latitude: 47.6062, longitude: -122.3321 },
    created_at: at,
    updated_at: at,
    feature_types: [FeatureType.Rail, FeatureType.Ledge],
    stopped: true,
    natural_speed: 2,
    notes: `${name} notes`,
    owner_id: p.userId,
  };
  await insertSpot(p.db, spot);
  const mediaId = newId();
  const filePath = `photos/${spot.id}/${mediaId}.jpg`;
  p.io.write(filePath, FIXTURE);
  await insertMedia(p.db, { id: mediaId, spot_id: spot.id, file_path: filePath, created_at: at });
  return spot;
}

const ids = (spots: Spot[]) => spots.map((s) => s.id).sort();

/** The ids of `owner`'s live spots on the phone. */
async function spotsOf(p: Phone, owner: Phone): Promise<string[]> {
  return (await getSpots(p.db)).filter((s) => s.owner_id === owner.userId).map((s) => s.id).sort();
}

/** The spot ids `listId` holds on the phone (memberships), sorted. */
async function listSpots(p: Phone, listId: string): Promise<string[]> {
  const rows = await p.db.getAllAsync<{ spot_id: string }>(
    'SELECT spot_id FROM hit_list_spots WHERE list_id = ? ORDER BY spot_id',
    listId,
  );
  return rows.map((r) => r.spot_id);
}

const functionUrl = () => `${supabaseUrl()}/functions/v1/share-preview`;

/** share-preview as the page calls it (D96): a POST whose text/plain body is the token, no other headers. */
async function preview(token: string): Promise<{ status: number; text: string }> {
  const response = await fetch(functionUrl(), { method: 'POST', body: token });
  return { status: response.status, text: await response.text() };
}

/** The token in a link the app made: in the fragment, under the share base URL. */
function tokenOf(url: string | null): string {
  expect(url).not.toBeNull();
  expect(url!.startsWith(`${shareBaseUrl()}#t=`)).toBe(true);
  const token = parseToken(url!);
  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  return token!;
}

const GONE = '{"error":"gone"}';

// ---------------------------------------------------------------------------------------------------------------------
// web/share/ over Node's http module, with the page's functions URL pointed at this stack's (as the live checklist
// tells Michael to set it): only GETs of files under web/share/.

const WEB = join(__dirname, '..', '..', 'web');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function startStaticServer(functionsUrl: string): Promise<Server> {
  const server = createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0]);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const rel = normalize(pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(/^[/\\]+/, '');
    if (req.method !== 'GET' || !rel.startsWith('share/') || rel.includes('..')) {
      res.writeHead(404).end();
      return;
    }
    let body: string;
    try {
      body = readFileSync(join(WEB, rel), 'utf8');
    } catch {
      res.writeHead(404).end();
      return;
    }
    if (rel.endsWith('index.html')) {
      body = body.replace(
        /(<meta name="hitlist-functions-url" content=")[^"]*(")/,
        (_m, open: string, close: string) => `${open}${functionsUrl}${close}`,
      );
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * The functions URL the served page gets: this stack's, under another name for the same host, so a page still on its
 * built-in meta (127.0.0.1) would show in `pageFetches`.
 */
const pageFunctionsUrl = () => `${supabaseUrl().replace('://127.0.0.1', '://localhost')}/functions/v1`;

/** Every request the open pages made to share-preview (URL, method and body), in order. */
const pageFetches: { url: string; method?: string; body?: unknown }[] = [];

/** Opens the page at `url` in jsdom (share.js loaded from the server, Node's fetch in the window) once it rendered. */
async function openPage(url: string): Promise<JSDOM> {
  pageFetches.length = 0;
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom 20 has no fetch: a browser's would make the same request
      (window as unknown as { fetch: typeof fetch }).fetch = (input: string | URL | Request, init?: RequestInit) => {
        pageFetches.push({ url: String(input), method: init?.method, body: init?.body });
        return fetch(input, init);
      };
    },
  });
  doms.push(dom);
  const { document } = dom.window;
  for (let i = 0; i < 200 && !document.body?.dataset.state; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!document.body?.dataset.state) throw new Error(`the page never rendered: ${url.replace(/#.*/, '#…')}`);
  return dom;
}

// ---------------------------------------------------------------------------------------------------------------------

let a: Phone;
let b: Phone;
let c: Phone;
let spots: Spot[];
let list: HitList;
let server: Server;
const doms: JSDOM[] = [];

beforeAll(async () => {
  [a, b, c] = await Promise.all([newPhone('ana'), newPhone('ben'), newPhone('cal')]);
  spots = [await spotWithPhoto(a, 'Library rail'), await spotWithPhoto(a, 'Pier ledge')];
  const at = now();
  list = { id: newId(), name: 'Downtown', kind: 'manual', shared: false, owner_id: a.userId, created_at: at, updated_at: at };
  await insertHitList(a.db, list);
  await addSpotsToList(a.db, list.id, spots.map((s) => s.id), at, a.userId);
  // D78/D85: a send and a share take only what is backed up
  await pushAll(a.db, a.client, a.userId, a.io);
  server = await startStaticServer(pageFunctionsUrl());
});

// Riders first: whatever failed in beforeAll (no server yet), they never stay behind.
afterAll(async () => {
  for (const rider of riders) await deleteRiderAndPhotos(rider.email, rider.userId);
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  for (const dom of doms) dom.window.close();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('a send link (D44: anyone holding it can look, no account)', () => {
  let sendId: string;
  let token: string;
  let revokedText: string;

  it('Copy link: a link-only send and a 7-day link; the function answers its 2 spots with no auth header', async () => {
    const made = await createLinkSend(a.db, a.client, a.userId, {
      spotIds: spots.map((s) => s.id),
      sender: { username: a.username, display_name: null },
    });
    expect(made).not.toBeNull();
    sendId = made!.sendId;
    token = tokenOf(await createSendLink(a.client, a.userId, sendId, '7d'));

    const { status, text } = await preview(token);
    expect(status).toBe(200);
    const body = JSON.parse(text) as {
      kind: string;
      spots: { name: string; feature_types: string[]; stopped: boolean; natural_speed: number; photo_urls: string[] }[];
      sender: { username: string };
      expires_at: string;
    };
    expect(body.kind).toBe('send');
    expect(body.sender.username).toBe(a.username);
    expect(body.spots.map((s) => s.name).sort()).toEqual(['Library rail', 'Pier ledge']);
    expect(body.spots.every((s) => s.photo_urls.length === 1 && s.stopped && s.natural_speed === 2)).toBe(true);
    // 7 days, give or take the test's own minutes
    expect(Math.abs(Date.parse(body.expires_at) - (Date.now() + 7 * 864e5))).toBeLessThan(10 * 60e3);

    // the app's own preview (Paste a link) through an anon client reads the same answer
    expect(await previewLink(anonClient(), token)).toEqual({ kind: 'send', count: 2, sender: a.username });
  });

  it('the static page renders the live answer: "2 spots from @ana" and two photos that load', async () => {
    const { port } = server.address() as AddressInfo;
    const dom = await openPage(`http://127.0.0.1:${port}/share/#t=${token}`);
    // the fragment's token, sent to the functions URL the page was given
    expect(pageFetches).toEqual([{ url: `${pageFunctionsUrl()}/share-preview`, method: 'POST', body: token }]);
    const { document } = dom.window;
    expect(document.body.dataset.state).toBe('send');
    expect(document.querySelector('h1')?.textContent).toBe(`2 spots from @${a.username}`);
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
    expect(srcs).toHaveLength(2);
    for (const src of srcs) {
      const response = await fetch(src);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(FIXTURE);
    }
  });

  it('after Revoke the function answers 404 gone, and the app reads it as LinkGoneError', async () => {
    const mine = (await listMyLinks(a.client, a.userId, 'send'))!;
    expect(mine).toEqual([expect.objectContaining({ sendId, status: 'active' })]);
    expect(await revokeLink(a.client, a.userId, mine[0].id)).toBe(true);

    const { status, text } = await preview(token);
    expect(status).toBe(404);
    expect(text).toBe(GONE);
    revokedText = text;
    await expect(previewLink(anonClient(), token)).rejects.toBeInstanceOf(LinkGoneError);
    expect((await listMyLinks(a.client, a.userId, 'send'))!.find((l) => l.id === mine[0].id)?.status).toBe('revoked');
  });

  it('a second link that expired answers the same 404 gone, byte for byte', async () => {
    const second = tokenOf(await createSendLink(a.client, a.userId, sendId, '1d'));
    expect((await preview(second)).status).toBe(200);
    const live = (await listMyLinks(a.client, a.userId, 'send'))!.find((l) => l.status === 'active')!;
    const { error } = await adminClient()
      .from('links')
      .update({ expires_at: new Date(Date.now() - 60e3).toISOString() })
      .eq('id', live.id);
    expect(error).toBeNull();

    const { status, text } = await preview(second);
    expect(status).toBe(404);
    expect(text).toBe(revokedText);
    expect((await listMyLinks(a.client, a.userId, 'send'))!.find((l) => l.id === live.id)?.status).toBe('expired');

    // and the page says so
    const { port } = server.address() as AddressInfo;
    const dom = await openPage(`http://127.0.0.1:${port}/share/#t=${second}`);
    expect(pageFetches).toEqual([{ url: `${pageFunctionsUrl()}/share-preview`, method: 'POST', body: second }]);
    expect(dom.window.document.body.dataset.state).toBe('gone');
    expect(dom.window.document.body.textContent).toContain("This link doesn't work any more.");
  });
});

describe("the app's Copy link and Revoke (D93: Revoke withdraws the link's send and removes its photos)", () => {
  it('makeSendLink → a live link; revokeSentLink → 404 gone, and its photo URLs stop working', async () => {
    const url = await makeSendLink(a.db, a.client, a.userId, {
      spotIds: [spots[0].id],
      sender: { username: a.username, display_name: null },
      expiry: '30d',
    });
    const token = tokenOf(url);
    const live = await preview(token);
    expect(live.status).toBe(200);
    const photoUrl = (JSON.parse(live.text) as { spots: { photo_urls: string[] }[] }).spots[0].photo_urls[0];
    expect((await fetch(photoUrl)).status).toBe(200);

    const row = (await listSentLinks(a.client, a.userId))!.find((l) => l.status === 'active');
    expect(row).toEqual(expect.objectContaining({ count: 1, status: 'active' }));
    expect(await revokeSentLink(a.client, a.userId, row!)).toBe(true);

    const gone = await preview(token);
    expect([gone.status, gone.text]).toEqual([404, GONE]);
    expect((await fetch(photoUrl)).status).not.toBe(200);
    expect((await listSentLinks(a.client, a.userId))!.find((l) => l.id === row!.id)?.status).toBe('revoked');
  });
});

describe('an invite link (D45: joins a signed-in rider, once)', () => {
  let url: string;

  it('ana shares Downtown and makes an invite link; an anonymous redeem is refused', async () => {
    expect(await shareList(a.db, a.client, a.userId, list.id, [], 'add')).toBe(true);
    url = (await createInviteLink(a.client, a.userId, list.id, 'add'))!;
    const token = tokenOf(url);

    const { data, error } = await anonClient().rpc('redeem_invite', { p_token: token });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');

    // the invite stub: list name and inviter, no spots
    const { status, text } = await preview(token);
    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual(
      expect.objectContaining({ kind: 'invite', list_name: 'Downtown', inviter: expect.objectContaining({ username: a.username }) }),
    );
    expect(JSON.parse(text)).not.toHaveProperty('spots');
  });

  it("ben redeems it: he is a member with the link's role, and his pull brings Downtown and its spots", async () => {
    expect(await redeemInvite(b.db, b.client, b.userId, url)).toBe(list.id);

    const { data, error } = await a.client
      .from('hit_list_members')
      .select('user_id, role, status')
      .eq('list_id', list.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: b.userId, role: 'add', status: 'member' }]);

    await pullAll(b.db, b.client, b.userId);
    expect((await getHitLists(b.db)).map((l) => [l.id, l.name, l.owner_id])).toContainEqual([
      list.id,
      'Downtown',
      a.userId,
    ]);
    expect(await spotsOf(b, a)).toEqual(ids(spots));
    expect(await listSpots(b, list.id)).toEqual(ids(spots));
    expect(await getMembers(b.db, list.id)).toContainEqual(
      expect.objectContaining({ user_id: b.userId, role: 'add', status: 'member' }),
    );
  });

  it('ben again gets the list id and nothing changes (D60); cal with the same token is refused (one use)', async () => {
    expect(await redeemInvite(b.db, b.client, b.userId, url)).toBe(list.id);
    await expect(redeemInvite(c.db, c.client, c.userId, url)).rejects.toBeInstanceOf(LinkGoneError);

    const { data } = await a.client.from('hit_list_members').select('user_id, status').eq('list_id', list.id);
    expect(data).toEqual([{ user_id: b.userId, status: 'member' }]);
    await pullAll(c.db, c.client, c.userId);
    expect(await spotsOf(c, a)).toEqual([]);
    expect((await getHitLists(c.db)).map((l) => l.id)).not.toContain(list.id);
  });

  it("ana's invite links show it used by ben", async () => {
    expect(await listMyLinks(a.client, a.userId, 'invite')).toEqual([
      expect.objectContaining({
        listId: list.id,
        role: 'add',
        status: 'used',
        usedBy: { id: b.userId, username: b.username },
      }),
    ]);
  });
});
