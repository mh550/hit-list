// src/sync/lists.ts (S8-02, docs/plans/2026-10-22-s8-shared-lists.md "Data"): sharing a hit list, invitations, roles,
// Remove, Leave, Stop sharing and Join / Decline, against the fake client, real SQLite and the in-memory
// expo-file-system fake (the photo cache).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeCall, type FakeSupabase } from './helpers/fake-supabase';
import { fakeFs } from './helpers/fake-fs';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
import { createTestHitList, createTestSpot } from './factories';

import { getHitLists, getMembers, insertHitList, insertSpot, upsertMembers } from '@/src/db';
import { getProfiles } from '@/src/db/profiles';
import { clearOutbox } from '@/src/db/sync';
import {
  ListNotBackedUpError,
  NotAllowedError,
  invite,
  leave,
  loadAndApplyInvites,
  loadInvites,
  removeMember,
  respondInvite,
  setRole,
  shareList,
  stopSharing,
} from '@/src/sync/lists';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { useHitListsStore } from '@/src/stores';
import { selectUnseenCount, useInboxStore, type InviteItem } from '@/src/stores/inbox-store';
import type { ListMember } from '@/src/types';

const ANA = '00000000-0000-4000-8000-0000000000a1';
const BEN = '00000000-0000-4000-8000-0000000000b1';
const CAL = '00000000-0000-4000-8000-0000000000c1';
const DOC = 'file:///data/Documents/';
const CACHE = 'file:///data/Caches/';
const T1 = '2026-10-23T10:00:00.000Z';

type Row = Record<string, unknown>;
let db: SQLiteDatabase;
let fake: FakeSupabase;
let warn: jest.SpyInstance;
const client = () => fake as unknown as SupabaseClient;
const kinds = () =>
  fake.calls.map((c: FakeCall) => (c.kind === 'rpc' ? `rpc ${c.fn}` : `${c.kind} ${'table' in c ? c.table : c.bucket}`));
const ids = async (table: string, column = 'id') =>
  (await db.getAllAsync<Row>(`SELECT ${column} AS id FROM ${table} ORDER BY 1`)).map((r) => r.id);
const memberships = async () =>
  (await db.getAllAsync<Row>("SELECT list_id || '/' || spot_id AS id FROM hit_list_spots ORDER BY 1")).map((r) => r.id);
const listRow = (id: string) => db.getFirstAsync<Row>('SELECT shared, rev FROM hit_lists WHERE id = ?', id);

/** The server's hit_lists row as PostgREST returns it. */
const serverList = (overrides: Row = {}): Row => ({
  id: 'list-1',
  owner_id: ME,
  name: 'Downtown',
  kind: 'manual',
  area_center_lat: null,
  area_center_lng: null,
  area_center: null,
  area_radius_m: null,
  area_filters: null,
  area_place: null,
  shared: true,
  created_at: '2026-10-01T12:00:00+00:00',
  updated_at: '2026-10-23T10:00:00+00:00',
  deleted_at: null,
  rev: 70,
  ...overrides,
});
const member = (overrides: Partial<ListMember> = {}): ListMember => ({
  list_id: 'list-1',
  user_id: ANA,
  role: 'add',
  status: 'member',
  ...overrides,
});
/** A membership as a pull wrote it (server rev set: no outbox row). */
const pulledMembership = (listId: string, spotId: string, addedBy: string) =>
  db.runAsync(
    'INSERT INTO hit_list_spots (list_id, spot_id, added_by, added_at, rev) VALUES (?, ?, ?, ?, 5)',
    listId,
    spotId,
    addedBy,
    T1,
  );
/** A foreign spot (and one photo in the cache) as a pull wrote it. */
async function foreignSpot(id: string, owner: string) {
  await db.runAsync(
    `INSERT INTO spots (id, owner_id, latitude, longitude, created_at, updated_at, rev) VALUES (?, ?, 47.6, -122.3, ?, ?, 3)`,
    id,
    owner,
    T1,
    T1,
  );
  await db.runAsync(
    `INSERT INTO media (id, spot_id, owner_id, file_path, created_at, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?, 4)`,
    `${id}-photo`,
    id,
    owner,
    `cache/photos/${id}/${id}-photo.jpg`,
    T1,
    T1,
  );
  new fakeFs.Directory(fakeFs.Paths.cache, 'photos', id).create({ intermediates: true });
  fakeFs.__putFile(`${CACHE}photos/${id}/${id}-photo.jpg`, new Uint8Array([1, 2, 3]));
}

beforeEach(async () => {
  fakeFs.__resetFs(DOC);
  db = await createMigratedTestDb();
  await adoptPhoneFor(db, ME);
  fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: ME, username: 'me' });
  useInboxStore.getState().clearInbox();
  useHitListsStore.getState().setLists([]);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('shareList', () => {
  beforeEach(async () => {
    await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME }));
    await db.runAsync('UPDATE hit_lists SET rev = 60 WHERE id = ?', 'list-1');
    await clearOutbox(db);
    fake.rpcHandlers.share_list = () => ({ data: serverList(), error: null });
  });

  it('turns sharing on through share_list, then invites each friend with the role (invited_by = me)', async () => {
    await expect(shareList(db, client(), ME, 'list-1', [ANA, BEN], 'add')).resolves.toBe(true);

    expect(kinds()).toEqual(['rpc share_list', 'upsert hit_list_members']);
    expect(fake.rpcs[0].args).toEqual({ p_list: 'list-1' });
    const insert = fake.calls[1];
    expect(insert).toMatchObject({ options: { onConflict: 'list_id,user_id', ignoreDuplicates: true } });
    expect(insert.kind === 'upsert' && insert.rows).toEqual([
      { list_id: 'list-1', user_id: ANA, role: 'add', status: 'invited', invited_by: ME },
      { list_id: 'list-1', user_id: BEN, role: 'add', status: 'invited', invited_by: ME },
    ]);
  });

  it("marks the local list shared with the server's rev (no outbox echo) and mirrors the invitations", async () => {
    await shareList(db, client(), ME, 'list-1', [ANA, BEN], 'view');

    expect(await listRow('list-1')).toEqual({ shared: 1, rev: 70 });
    expect(await outboxOps(db)).toEqual([]);
    expect((await getMembers(db, 'list-1')).map(({ user_id, role, status }) => [user_id, role, status])).toEqual([
      [ANA, 'view', 'invited'],
      [BEN, 'view', 'invited'],
    ]);
    const stored = useHitListsStore.getState().lists.find((l) => l.id === 'list-1');
    expect(stored?.shared).toBe(true);
    expect(stored?.members).toHaveLength(2);
  });

  it('an already shared list only invites', async () => {
    await db.runAsync('UPDATE hit_lists SET shared = 1 WHERE id = ?', 'list-1');
    await clearOutbox(db);

    await shareList(db, client(), ME, 'list-1', [ANA], 'add');

    expect(kinds()).toEqual(['upsert hit_list_members']);
  });

  it("refuses (D85, no call) a list that waits in the outbox, or one that isn't the rider's", async () => {
    await db.runAsync("UPDATE hit_lists SET name = 'Renamed' WHERE id = ?", 'list-1');
    await expect(shareList(db, client(), ME, 'list-1', [ANA], 'add')).rejects.toBeInstanceOf(ListNotBackedUpError);
    await insertHitList(db, createTestHitList({ id: 'theirs', owner_id: ANA }));
    await expect(shareList(db, client(), ME, 'theirs', [BEN], 'add')).rejects.toBeInstanceOf(ListNotBackedUpError);
    await insertHitList(db, createTestHitList({ id: 'phone-only' }));
    await expect(shareList(db, client(), ME, 'phone-only', [BEN], 'add')).rejects.toBeInstanceOf(ListNotBackedUpError);

    expect(fake.calls).toEqual([]);
  });

  it('a 42501 from share_list is NotAllowedError and writes nothing', async () => {
    fake.failNext('rpc', { message: 'not a live list of yours', code: '42501' }, 'share_list');

    await expect(shareList(db, client(), ME, 'list-1', [ANA], 'add')).rejects.toBeInstanceOf(NotAllowedError);

    expect(kinds()).toEqual(['rpc share_list']);
    expect(await listRow('list-1')).toEqual({ shared: 0, rev: 60 });
    expect(await getMembers(db, 'list-1')).toEqual([]);
  });

  it('a failed invite keeps the list shared (Invite retries) and mirrors no invitation', async () => {
    fake.failNext('upsert', { message: 'blocked', code: '42501' }, 'hit_list_members');

    await expect(shareList(db, client(), ME, 'list-1', [ANA], 'add')).rejects.toThrow('blocked');

    expect(await listRow('list-1')).toEqual({ shared: 1, rev: 70 });
    expect(await getMembers(db, 'list-1')).toEqual([]);
  });
});

describe('invite, setRole, removeMember', () => {
  beforeEach(async () => {
    await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME, shared: true }));
    await clearOutbox(db);
  });

  it('invite upserts one row per friend and mirrors it', async () => {
    await expect(invite(db, client(), ME, 'list-1', [CAL], 'view')).resolves.toBe(true);

    const call = fake.calls[0];
    expect(call.kind === 'upsert' && call.rows).toEqual([
      { list_id: 'list-1', user_id: CAL, role: 'view', status: 'invited', invited_by: ME },
    ]);
    expect(await getMembers(db, 'list-1')).toEqual([{ list_id: 'list-1', user_id: CAL, role: 'view', status: 'invited' }]);
  });

  it('setRole updates the member row and the mirror', async () => {
    await upsertMembers(db, [member()]);
    fake.tables.hit_list_members = [{ list_id: 'list-1', user_id: ANA, role: 'add', status: 'member' }];

    await expect(setRole(db, client(), ME, 'list-1', ANA, 'view')).resolves.toBe(true);

    expect(fake.calls).toEqual([
      {
        kind: 'update',
        table: 'hit_list_members',
        values: { role: 'view' },
        filters: [
          ['list_id', 'list-1'],
          ['user_id', ANA],
        ],
      },
    ]);
    expect((await getMembers(db, 'list-1'))[0].role).toBe('view');
  });

  it('setRole on a row the server no longer lets the rider change is NotAllowedError, mirror unchanged', async () => {
    await upsertMembers(db, [member()]);
    fake.tables.hit_list_members = [];

    await expect(setRole(db, client(), ME, 'list-1', ANA, 'view')).rejects.toBeInstanceOf(NotAllowedError);

    expect((await getMembers(db, 'list-1'))[0].role).toBe('add');
  });

  it("removeMember calls remove_member, drops the mirror row and the member's spots from the list (nothing queued)", async () => {
    await upsertMembers(db, [member(), member({ user_id: BEN })]);
    await insertSpot(db, createTestSpot({ id: 'mine', owner_id: ME }));
    await pulledMembership('list-1', 'mine', ME);
    await foreignSpot('ana-1', ANA);
    await pulledMembership('list-1', 'ana-1', ANA);
    await clearOutbox(db);

    await expect(removeMember(db, client(), ME, 'list-1', ANA)).resolves.toBe(true);

    expect(fake.rpcs).toEqual([{ fn: 'remove_member', args: { p_list: 'list-1', p_user: ANA } }]);
    expect((await getMembers(db, 'list-1')).map((m) => m.user_id)).toEqual([BEN]);
    expect(await memberships()).toEqual(['list-1/mine']);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('a 42501 from remove_member is NotAllowedError and removes nothing', async () => {
    await upsertMembers(db, [member()]);
    fake.failNext('rpc', { message: 'not the list owner', code: '42501' }, 'remove_member');

    await expect(removeMember(db, client(), ME, 'list-1', ANA)).rejects.toBeInstanceOf(NotAllowedError);

    expect(await getMembers(db, 'list-1')).toHaveLength(1);
  });
});

describe('leave', () => {
  beforeEach(async () => {
    await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ANA, shared: true }));
    await insertHitList(db, createTestHitList({ id: 'list-2', owner_id: BEN, shared: true }));
    await upsertMembers(db, [
      member({ user_id: ME }),
      member({ user_id: CAL }),
      member({ list_id: 'list-2', user_id: ME }),
    ]);
    await insertSpot(db, createTestSpot({ id: 'mine', owner_id: ME }));
    await foreignSpot('ana-1', ANA);
    await foreignSpot('ana-2', ANA);
    await pulledMembership('list-1', 'mine', ME);
    await pulledMembership('list-1', 'ana-1', ANA);
    await pulledMembership('list-1', 'ana-2', ANA);
    // ana, a member of ben's list too, added ana-2 there: it stays, list-2 still shows it
    await pulledMembership('list-2', 'ana-2', ANA);
    await clearOutbox(db);
  });

  it("calls leave_list, then removes the list, its memberships, its mirror rows and the others' spots only it showed", async () => {
    await expect(leave(db, client(), ME, 'list-1')).resolves.toBe(true);

    expect(fake.rpcs).toEqual([{ fn: 'leave_list', args: { p_list: 'list-1' } }]);
    expect(await ids('hit_lists')).toEqual(['list-2']);
    expect(await memberships()).toEqual(['list-2/ana-2']);
    expect(await ids('spots')).toEqual(['ana-2', 'mine']);
    expect(await ids('media')).toEqual(['ana-2-photo']);
    expect(await ids('hit_list_members', "list_id || '/' || user_id")).toEqual([`list-2/${ME}`]);
    expect(await outboxOps(db)).toEqual([]);
  });

  it('deletes the cache folder of every spot it removed, and nothing under Paths.document', async () => {
    await leave(db, client(), ME, 'list-1');

    expect(fakeFs.__fileExists(`${CACHE}photos/ana-1/ana-1-photo.jpg`)).toBe(false);
    expect(fakeFs.__fileExists(`${CACHE}photos/ana-2/ana-2-photo.jpg`)).toBe(true);
    expect(fakeFs.__writes().filter((uri) => uri.startsWith(DOC))).toEqual([]);
  });

  it('reloads the stores', async () => {
    useHitListsStore.getState().setLists(await getHitLists(db));

    await leave(db, client(), ME, 'list-1');

    expect(useHitListsStore.getState().lists.map((l) => l.id)).toEqual(['list-2']);
  });

  it('a failed leave_list removes nothing', async () => {
    fake.failNext('rpc', { message: 'offline' }, 'leave_list');

    await expect(leave(db, client(), ME, 'list-1')).rejects.toThrow('offline');

    expect(await ids('hit_lists')).toEqual(['list-1', 'list-2']);
    expect(await ids('spots')).toEqual(['ana-1', 'ana-2', 'mine']);
    expect(fakeFs.__fileExists(`${CACHE}photos/ana-1/ana-1-photo.jpg`)).toBe(true);
  });
});

describe('stopSharing', () => {
  beforeEach(async () => {
    await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME, shared: true }));
    await db.runAsync('UPDATE hit_lists SET rev = 60 WHERE id = ?', 'list-1');
    await upsertMembers(db, [member(), member({ user_id: BEN, status: 'invited' })]);
    await insertSpot(db, createTestSpot({ id: 'mine', owner_id: ME }));
    await pulledMembership('list-1', 'mine', ME);
    await foreignSpot('ana-1', ANA);
    await pulledMembership('list-1', 'ana-1', ANA);
    await clearOutbox(db);
    fake.tables.hit_lists = [serverList({ shared: false, rev: 80, updated_at: '2026-10-23T11:00:00+00:00' })];
  });

  it("calls stop_sharing, re-reads the list and writes it with the server's rev (no outbox row)", async () => {
    await expect(stopSharing(db, client(), ME, 'list-1')).resolves.toBe(true);

    expect(fake.rpcs).toEqual([{ fn: 'stop_sharing', args: { p_list: 'list-1' } }]);
    expect(fake.selects).toEqual([
      expect.objectContaining({ table: 'hit_lists', columns: '*', filters: [['eq', 'id', 'list-1']] }),
    ]);
    expect(await listRow('list-1')).toEqual({ shared: 0, rev: 80 });
    expect(await outboxOps(db)).toEqual([]);
  });

  it("drops the mirror rows and the members' spots, keeping the rider's own", async () => {
    await stopSharing(db, client(), ME, 'list-1');

    expect(await getMembers(db, 'list-1')).toEqual([]);
    expect(await memberships()).toEqual(['list-1/mine']);
    expect(await ids('spots')).toEqual(['mine']);
    expect(await ids('media')).toEqual([]);
    expect(fakeFs.__fileExists(`${CACHE}photos/ana-1/ana-1-photo.jpg`)).toBe(false);
  });

  it('a failed stop_sharing changes nothing', async () => {
    fake.failNext('rpc', { message: 'not the list owner', code: '42501' }, 'stop_sharing');

    await expect(stopSharing(db, client(), ME, 'list-1')).rejects.toBeInstanceOf(NotAllowedError);

    expect(await listRow('list-1')).toEqual({ shared: 1, rev: 60 });
    expect(await getMembers(db, 'list-1')).toHaveLength(2);
  });
});

describe('respondInvite', () => {
  const inviteItem: InviteItem = {
    kind: 'invite',
    id: 'list-1',
    created_at: T1,
    listId: 'list-1',
    listName: 'Downtown',
    listKind: 'manual',
    from: { id: ANA, username: 'ana', display_name: null },
    role: 'add',
    spotCount: 12,
  };

  beforeEach(async () => {
    await upsertMembers(db, [member({ user_id: ME, status: 'invited' })]);
    useInboxStore.getState().setItems(ME, 'invite', [inviteItem]);
    fake.tables.hit_list_members = [
      { list_id: 'list-1', user_id: ME, role: 'add', status: 'invited', invited_by: ANA, joined_at: null },
    ];
  });

  it("join sets the rider's own row to 'member', mirrors it and takes the invitation off the Inbox", async () => {
    await expect(respondInvite(db, client(), ME, 'list-1', 'join')).resolves.toBe(true);

    expect(fake.calls).toEqual([
      {
        kind: 'update',
        table: 'hit_list_members',
        values: { status: 'member' },
        filters: [
          ['list_id', 'list-1'],
          ['user_id', ME],
        ],
      },
    ]);
    expect((await getMembers(db, 'list-1'))[0]).toMatchObject({ user_id: ME, status: 'member' });
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('join of an invitation withdrawn meanwhile (0 rows) is NotAllowedError; it leaves the mirror and the Inbox', async () => {
    fake.tables.hit_list_members = [];

    await expect(respondInvite(db, client(), ME, 'list-1', 'join')).rejects.toBeInstanceOf(NotAllowedError);

    expect(await getMembers(db, 'list-1')).toEqual([]);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it("decline deletes the rider's own row, then the mirror row and the Inbox item", async () => {
    await expect(respondInvite(db, client(), ME, 'list-1', 'decline')).resolves.toBe(true);

    expect(fake.calls).toEqual([
      {
        kind: 'delete',
        table: 'hit_list_members',
        filters: [
          ['list_id', 'list-1'],
          ['user_id', ME],
        ],
      },
    ]);
    expect(await getMembers(db, 'list-1')).toEqual([]);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('a failed answer keeps the invitation', async () => {
    fake.failNext('delete', { message: 'offline' }, 'hit_list_members');

    await expect(respondInvite(db, client(), ME, 'list-1', 'decline')).rejects.toThrow('offline');

    expect(await getMembers(db, 'list-1')).toHaveLength(1);
    expect(useInboxStore.getState().items).toHaveLength(1);
  });
});

describe('invitations (list_invitations, D83)', () => {
  const rows = [
    {
      list_id: 'list-1',
      name: 'Downtown',
      kind: 'manual',
      owner_id: ANA,
      owner_username: 'ana',
      owner_display_name: 'Ana',
      role: 'add',
      spot_count: 12,
      invited_at: '2026-10-23T10:00:00+00:00',
    },
    {
      list_id: 'list-2',
      name: 'Area',
      kind: 'area',
      owner_id: BEN,
      owner_username: null,
      owner_display_name: null,
      role: 'view',
      spot_count: 0,
      invited_at: '2026-10-23T11:00:00.5+00:00',
    },
  ];

  beforeEach(() => {
    fake.rpcHandlers.list_invitations = () => ({ data: rows, error: null });
  });

  it('loadInvites maps each row to an Inbox invite item, newest first', async () => {
    await expect(loadInvites(client(), ME)).resolves.toEqual([
      {
        kind: 'invite',
        id: 'list-2',
        created_at: '2026-10-23T11:00:00.500Z',
        listId: 'list-2',
        listName: 'Area',
        listKind: 'area',
        from: { id: BEN, username: null, display_name: null },
        role: 'view',
        spotCount: 0,
      },
      {
        kind: 'invite',
        id: 'list-1',
        created_at: '2026-10-23T10:00:00.000Z',
        listId: 'list-1',
        listName: 'Downtown',
        listKind: 'manual',
        from: { id: ANA, username: 'ana', display_name: 'Ana' },
        role: 'add',
        spotCount: 12,
      },
    ]);
    expect(fake.rpcs).toEqual([{ fn: 'list_invitations', args: undefined }]);
  });

  it('loadAndApplyInvites fills the Inbox (kind invite, counted in the badge) and mirrors the known owner names', async () => {
    await useInboxStore.getState().loadSeen(db, ME);

    await loadAndApplyInvites(db, client(), ME);

    expect(useInboxStore.getState().items.map((i) => `${i.kind} ${i.id}`)).toEqual(['invite list-2', 'invite list-1']);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(2);
    expect(await getProfiles(db, [ANA, BEN])).toEqual({ [ANA]: { id: ANA, username: 'ana', display_name: 'Ana' } });
  });

  it('a failed load warns and keeps what the Inbox showed', async () => {
    await loadAndApplyInvites(db, client(), ME);
    fake.failNext('rpc', { message: 'offline' }, 'list_invitations');

    await loadAndApplyInvites(db, client(), ME);

    expect(useInboxStore.getState().items).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith('[lists] loading invitations failed:', 'offline');
  });
});

describe('without a session for the rider', () => {
  it('every call resolves false (null for loadInvites) and asks the server nothing', async () => {
    fake.setSession(null);
    await insertHitList(db, createTestHitList({ id: 'list-1', owner_id: ME }));

    await expect(shareList(db, client(), ME, 'list-1', [ANA], 'add')).resolves.toBe(false);
    await expect(invite(db, client(), ME, 'list-1', [ANA], 'add')).resolves.toBe(false);
    await expect(setRole(db, client(), ME, 'list-1', ANA, 'view')).resolves.toBe(false);
    await expect(removeMember(db, client(), ME, 'list-1', ANA)).resolves.toBe(false);
    await expect(leave(db, client(), ME, 'list-1')).resolves.toBe(false);
    await expect(stopSharing(db, client(), ME, 'list-1')).resolves.toBe(false);
    await expect(respondInvite(db, client(), ME, 'list-1', 'join')).resolves.toBe(false);
    await expect(loadInvites(client(), ME)).resolves.toBeNull();
    await loadAndApplyInvites(db, client(), ME);

    expect(fake.calls).toEqual([]);
    expect(fake.selects).toEqual([]);
  });

  it("nothing is written on a phone whose rows are another account's", async () => {
    await adoptPhoneFor(db, 'someone-else');
    await expect(leave(db, client(), ME, 'list-1')).resolves.toBe(false);
    expect(fake.calls).toEqual([]);
  });
});
