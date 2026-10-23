// src/sync/links.ts and redeemInvite in src/sync/join.ts (S9-03, docs/plans/2026-10-22-s9-links.md "Client"): link
// tokens to the server, the rider's links, the preview and redeeming an invite, against the fake client.
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn() }));

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, functionsHttpError, type FakeSupabase } from './helpers/fake-supabase';
import { ME, adoptPhoneFor } from './helpers/outbox';

import { syncNow } from '@/src/sync/engine';
import { redeemInvite } from '@/src/sync/join';
import { NotAllowedError } from '@/src/sync/lists';
import {
  createInviteLink,
  createSendLink,
  DEFAULT_SHARE_BASE_URL,
  LinkGoneError,
  listMyLinks,
  previewLink,
  revokeLink,
  shareBaseUrl,
} from '@/src/sync/links';

const SEND = '00000000-0000-4000-8000-00000000005e';
const LIST = '00000000-0000-4000-8000-0000000000c1';
const BEN = '00000000-0000-4000-8000-0000000000b1';
const DAY = 864e5;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

let db: SQLiteDatabase;
let fake: FakeSupabase;
let warn: jest.SpyInstance;
const client = () => fake as unknown as SupabaseClient;
const rpcArgs = (fn: string) => fake.rpcs.filter((r) => r.fn === fn).map((r) => r.args ?? {});
const tokenOf = (url: string) => /#t=([A-Za-z0-9_-]{22})$/.exec(url)![1];
const savedBase = process.env.EXPO_PUBLIC_SHARE_BASE_URL;

beforeEach(async () => {
  db = await createMigratedTestDb();
  await adoptPhoneFor(db, ME);
  fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  process.env.EXPO_PUBLIC_SHARE_BASE_URL = 'https://x.test/share/';
  jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  process.env.EXPO_PUBLIC_SHARE_BASE_URL = savedBase;
});

describe('shareBaseUrl', () => {
  it('is EXPO_PUBLIC_SHARE_BASE_URL, read on every call; unset or empty → the local default (D92)', () => {
    expect(shareBaseUrl()).toBe('https://x.test/share/');
    process.env.EXPO_PUBLIC_SHARE_BASE_URL = '';
    expect(shareBaseUrl()).toBe(DEFAULT_SHARE_BASE_URL);
    delete process.env.EXPO_PUBLIC_SHARE_BASE_URL;
    expect(shareBaseUrl()).toBe('http://localhost:8080/share/');
  });
});

describe('createSendLink', () => {
  it("'30d' calls create_link with the token's hash and an expiry 30 days out, and returns the URL with the plain token", async () => {
    const before = Date.now();
    const url = await createSendLink(client(), ME, SEND, '30d');
    const after = Date.now();

    expect(url).toMatch(/^https:\/\/x\.test\/share\/#t=[A-Za-z0-9_-]{22}$/);
    const [args] = rpcArgs('create_link');
    expect(Object.keys(args).sort()).toEqual(['p_expires_at', 'p_kind', 'p_target', 'p_token_sha256']);
    expect(args).toMatchObject({ p_kind: 'send', p_target: SEND, p_token_sha256: sha(tokenOf(url!)) });
    const expires = Date.parse(args.p_expires_at as string);
    expect(expires).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(expires).toBeLessThanOrEqual(after + 30 * DAY);
    // the plain token never goes to the server
    expect(JSON.stringify(fake.rpcs)).not.toContain(tokenOf(url!));
  });

  it.each([
    ['1d', 1],
    ['7d', 7],
  ] as const)("'%s' expires %d days out", async (expiry, days) => {
    const before = Date.now();
    await createSendLink(client(), ME, SEND, expiry);
    const expires = Date.parse(rpcArgs('create_link')[0].p_expires_at as string);
    expect(Math.round((expires - before) / DAY)).toBe(days);
  });

  it("'never' passes p_expires_at null", async () => {
    await createSendLink(client(), ME, SEND, 'never');
    expect(rpcArgs('create_link')[0].p_expires_at).toBeNull();
  });

  it('makes a new token every time', async () => {
    const a = await createSendLink(client(), ME, SEND, '7d');
    const b = await createSendLink(client(), ME, SEND, '7d');
    expect(a).not.toBe(b);
  });

  it('throws the server error with its code', async () => {
    fake.failNext('rpc', { message: 'this send was withdrawn', code: '55000' }, 'create_link');
    await expect(createSendLink(client(), ME, SEND, '7d')).rejects.toMatchObject({ code: '55000' });
  });

  it('42501 is NotAllowedError while the session lasts, and null once it ended', async () => {
    fake.failNext('rpc', { message: 'not the list owner', code: '42501' }, 'create_link');
    await expect(createInviteLink(client(), ME, LIST, 'add')).rejects.toBeInstanceOf(NotAllowedError);

    fake.rpcHandlers.create_link = () => {
      fake.setSession(null);
      return { data: null, error: { message: 'not signed in', code: '42501' } };
    };
    expect(await createSendLink(client(), ME, SEND, '7d')).toBeNull();
  });

  it('does nothing without a session for the rider', async () => {
    fake.setSession(null);
    expect(await createSendLink(client(), ME, SEND, '7d')).toBeNull();
    fake.setSession(fakeSession({ userId: BEN }));
    expect(await createSendLink(client(), ME, SEND, '7d')).toBeNull();
    expect(fake.rpcs).toEqual([]);
  });
});

describe('createInviteLink', () => {
  it('makes an invite link with the role that lasts 7 days', async () => {
    const before = Date.now();
    const url = await createInviteLink(client(), ME, LIST, 'add');

    const [args] = rpcArgs('create_link');
    expect(args).toMatchObject({ p_kind: 'invite', p_target: LIST, p_role: 'add', p_token_sha256: sha(tokenOf(url!)) });
    expect(Math.round((Date.parse(args.p_expires_at as string) - before) / DAY)).toBe(7);
  });

  it('does nothing without a session', async () => {
    fake.setSession(null);
    expect(await createInviteLink(client(), ME, LIST, 'view')).toBeNull();
    expect(fake.rpcs).toEqual([]);
  });
});

describe('revokeLink', () => {
  it('calls revoke_link with the id', async () => {
    expect(await revokeLink(client(), ME, 'link-1')).toBe(true);
    expect(rpcArgs('revoke_link')).toEqual([{ p_id: 'link-1' }]);
  });

  it('throws on a server error; null and no call without a session', async () => {
    fake.failNext('rpc', { message: 'boom' }, 'revoke_link');
    await expect(revokeLink(client(), ME, 'link-1')).rejects.toThrow('boom');
    fake.setSession(null);
    expect(await revokeLink(client(), ME, 'link-1')).toBeNull();
    expect(fake.rpcs).toHaveLength(1);
  });
});

describe('listMyLinks', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'l',
    kind: 'invite',
    send_id: null,
    list_id: LIST,
    role: 'add',
    created_at: '2026-10-20T10:00:00+00:00',
    expires_at: new Date(Date.now() + DAY).toISOString(),
    revoked_at: null,
    used_at: null,
    used_by: null,
    used_by_username: null,
    ...over,
  });

  it("maps rows to status 'active' | 'expired' | 'revoked' | 'used', newest first as the server lists them", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    fake.rpcHandlers.list_my_links = () => ({
      data: [
        row({ id: 'active' }),
        row({ id: 'never', expires_at: null }),
        row({ id: 'expired', expires_at: past }),
        row({ id: 'revoked', revoked_at: past, used_at: past }),
        row({ id: 'used', used_at: past, used_by: BEN, used_by_username: 'ben', expires_at: past }),
      ],
      error: null,
    });

    const links = await listMyLinks(client(), ME, 'invite');

    expect(rpcArgs('list_my_links')).toEqual([{ p_kind: 'invite' }]);
    expect(links!.map((l) => [l.id, l.status])).toEqual([
      ['active', 'active'],
      ['never', 'active'],
      ['expired', 'expired'],
      ['revoked', 'revoked'],
      ['used', 'used'],
    ]);
    expect(links![4]).toMatchObject({
      kind: 'invite',
      listId: LIST,
      sendId: null,
      role: 'add',
      createdAt: '2026-10-20T10:00:00.000Z',
      usedBy: { id: BEN, username: 'ben' },
    });
    expect(links![0].usedBy).toBeNull();
    expect(links![1].expiresAt).toBeNull();
  });

  it('reads the server’s timestamp shapes through toIso (Hermes’ Date.parse takes only ISO with Z)', async () => {
    const parse = Date.parse;
    const hermesParse = jest
      .spyOn(Date, 'parse')
      .mockImplementation((text: string) => (/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(text) ? parse(text) : NaN));
    try {
      fake.rpcHandlers.list_my_links = () => ({
        data: [
          row({ id: 'expired', expires_at: '2020-10-22 09:00:00.123456+00' }),
          row({ id: 'active', expires_at: '2999-10-22T09:00:00.123456+00:00' }),
        ],
        error: null,
      });
      const links = await listMyLinks(client(), ME, 'invite');
      expect(links!.map((l) => [l.id, l.status, l.expiresAt])).toEqual([
        ['expired', 'expired', '2020-10-22T09:00:00.123Z'],
        ['active', 'active', '2999-10-22T09:00:00.123Z'],
      ]);
    } finally {
      hermesParse.mockRestore();
    }
  });

  it('throws when the server can’t be read; null without a session', async () => {
    fake.failNext('rpc', { message: 'boom' }, 'list_my_links');
    await expect(listMyLinks(client(), ME, 'send')).rejects.toThrow('boom');
    fake.setSession(null);
    expect(await listMyLinks(client(), ME, 'send')).toBeNull();
  });
});

describe('previewLink', () => {
  it('GETs share-preview with the token and answers its kind', async () => {
    fake.invokeHandlers['share-preview'] = () => ({
      data: { kind: 'send', spots: [{}, {}], sender: { username: 'ana', display_name: null }, expires_at: null },
      error: null,
    });

    const preview = await previewLink(client(), 'tok');

    expect(fake.invokes).toEqual([{ name: 'share-preview?t=tok', options: { method: 'GET' } }]);
    expect(preview).toEqual({ kind: 'send', count: 2, sender: 'ana' });
  });

  it('an invite answers its list name', async () => {
    fake.invokeHandlers['share-preview'] = () => ({
      data: { kind: 'invite', list_name: 'Downtown', inviter: { username: 'ana', display_name: null } },
      error: null,
    });
    expect(await previewLink(client(), 'tok')).toEqual({ kind: 'invite', listName: 'Downtown', inviter: 'ana' });
  });

  it('a 404 gone is LinkGoneError; another failure (a 404 without the gone body too) is a plain error', async () => {
    fake.invokeHandlers['share-preview'] = () => functionsHttpError(404, { error: 'gone' });
    await expect(previewLink(client(), 'tok')).rejects.toBeInstanceOf(LinkGoneError);

    // the gateway's own 404: the function isn't deployed
    fake.invokeHandlers['share-preview'] = () => functionsHttpError(404, { message: 'Function not found' });
    const missing = previewLink(client(), 'tok');
    await expect(missing).rejects.toThrow();
    await expect(missing).rejects.not.toBeInstanceOf(LinkGoneError);

    fake.invokeHandlers['share-preview'] = () => functionsHttpError(500, { error: 'unavailable' });
    const failure = previewLink(client(), 'tok');
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(LinkGoneError);
  });
});

describe('redeemInvite', () => {
  beforeEach(() => {
    fake.rpcHandlers.redeem_invite = () => ({ data: LIST, error: null });
  });

  it('redeems the token of a pasted URL, then syncs, and resolves the list id', async () => {
    const id = await redeemInvite(db, client(), ME, 'https://x.test/share/#t=tok');

    expect(id).toBe(LIST);
    expect(rpcArgs('redeem_invite')).toEqual([{ p_token: 'tok' }]);
    expect(syncNow).toHaveBeenCalledWith(db);
    expect(jest.mocked(syncNow).mock.invocationCallOrder[0]).toBeGreaterThan(
      fake.rpc.mock.invocationCallOrder[fake.rpc.mock.calls.findIndex(([fn]) => fn === 'redeem_invite')],
    );
  });

  it('a failed sync after joining only warns', async () => {
    jest.mocked(syncNow).mockRejectedValue(new Error('offline'));
    expect(await redeemInvite(db, client(), ME, 'tok')).toBe(LIST);
    expect(warn).toHaveBeenCalled();
  });

  it('42501 (invalid invite) is LinkGoneError and nothing syncs', async () => {
    fake.failNext('rpc', { message: 'invalid invite', code: '42501' }, 'redeem_invite');
    await expect(redeemInvite(db, client(), ME, 'tok')).rejects.toBeInstanceOf(LinkGoneError);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('text with no token is LinkGoneError before any call', async () => {
    await expect(redeemInvite(db, client(), ME, 'https://x.test/other')).rejects.toBeInstanceOf(LinkGoneError);
    expect(fake.rpcs).toEqual([]);
  });

  it('another error throws as it is', async () => {
    fake.failNext('rpc', { message: 'boom', code: 'XX000' }, 'redeem_invite');
    const failure = redeemInvite(db, client(), ME, 'tok');
    await expect(failure).rejects.toThrow('boom');
    await expect(failure).rejects.not.toBeInstanceOf(LinkGoneError);
  });

  it('null without a session, or on a phone whose rows are another account’s', async () => {
    fake.setSession(null);
    expect(await redeemInvite(db, client(), ME, 'tok')).toBeNull();
    fake.setSession(fakeSession({ userId: BEN }));
    expect(await redeemInvite(db, client(), BEN, 'tok')).toBeNull();
    expect(fake.rpcs).toEqual([]);
  });

  it('two redeems of one token at once share one call', async () => {
    const [a, b] = await Promise.all([
      redeemInvite(db, client(), ME, 'tok'),
      redeemInvite(db, client(), ME, 'https://x.test/share/#t=tok'),
    ]);
    expect([a, b]).toEqual([LIST, LIST]);
    expect(rpcArgs('redeem_invite')).toHaveLength(1);
  });
});
