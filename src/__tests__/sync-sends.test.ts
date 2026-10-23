// src/sync/sends.ts (S7-03, docs/plans/2026-10-22-s7-send.md "Photo copy", "Inbox", "Sent"): sending, the Inbox's
// received sends, Save / Dismiss / Withdraw and the Sent list, against the fake client, real SQLite and the in-memory
// expo-file-system fake.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeCall, type FakeSupabase } from './helpers/fake-supabase';
import { fakeFs } from './helpers/fake-fs';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
import { createTestMedia, createTestSpot } from './factories';

import { getAllMedia, getHitLists, getListMemberships, getSpots, insertMedia, insertSpot } from '@/src/db';
import { upsertProfiles } from '@/src/db/profiles';
import { clearOutbox, enqueue } from '@/src/db/sync';
import {
  NotBackedUpError,
  createLinkSend,
  createSend,
  listSentLinks,
  makeSendLink,
  revokeSentLink,
  dismissSend,
  hasPendingSave,
  listSent,
  loadAndApplySends,
  loadSends,
  saveSend,
  withdrawSend,
} from '@/src/sync/sends';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { selectUnseenCount, useInboxStore, type SendItem } from '@/src/stores/inbox-store';
import { useSpotsStore } from '@/src/stores';
import { FeatureType, type Media, type Spot } from '@/src/types';
import { freezeSend, MAX_SEND_SPOTS, type SendPayload } from '@/src/utils/send-payload';
import { newId } from '@/src/utils/id';

const ANA = '00000000-0000-4000-8000-0000000000a1';
const BEN = '00000000-0000-4000-8000-0000000000b1';
const DOC = 'file:///data/Documents/';
const SENDER = { username: 'Ana_B', display_name: 'Ana B' };
const BYTES = new Uint8Array([0xff, 0xd8, 7, 7, 7]);

/** A promise the test opens when it chooses. */
function gate<T>() {
  let open!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

let db: SQLiteDatabase;
let fake: FakeSupabase;
let warn: jest.SpyInstance;
const client = () => fake as unknown as SupabaseClient;

const kinds = () => fake.calls.map((c: FakeCall) => (c.kind === 'rpc' ? `rpc ${c.fn}` : c.kind));
const rpcArgs = (fn: string) => fake.rpcs.filter((r) => r.fn === fn).map((r) => r.args ?? {});
const countRows = async (table: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;

/** One of the rider's own spots with `photos` photos, backed up (on the server, nothing in the outbox). */
async function backedUpSpot(name: string, photos = 1, overrides: Partial<Spot> = {}): Promise<{ spot: Spot; media: Media[] }> {
  const spot = createTestSpot({ name, owner_id: ME, feature_types: [FeatureType.Rail], natural_speed: 0, ...overrides });
  await insertSpot(db, spot);
  const media: Media[] = [];
  for (let i = 0; i < photos; i += 1) {
    const id = newId();
    const m = createTestMedia({
      id,
      spot_id: spot.id,
      file_path: `photos/${spot.id}/${id}.jpg`,
      created_at: `2026-10-0${i + 1}T10:00:00.000Z`,
      captured_at: '2026-10-01T09:30:00.000Z',
    });
    await insertMedia(db, m);
    media.push(m);
    fake.objects.set(`photos/${ME}/${spot.id}/${id}.jpg`, BYTES);
  }
  await clearOutbox(db);
  return { spot, media };
}

beforeEach(async () => {
  fakeFs.__resetFs(DOC);
  db = await createMigratedTestDb();
  await adoptPhoneFor(db, ME);
  fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  fake.tables.sends = [];
  useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: ME, username: 'me' });
  useInboxStore.getState().clearInbox();
  useSpotsStore.getState().setSpots([]);
  await upsertProfiles(db, [
    { id: ANA, username: 'ana', display_name: 'Ana' },
    { id: BEN, username: 'ben', display_name: null },
  ]);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('createSend', () => {
  it('copies every photo into sends/<id>/ before create_send, once per recipient with its own send id', async () => {
    const one = await backedUpSpot('Library rail', 2);
    const two = await backedUpSpot('Bank', 1);

    const result = await createSend(db, client(), ME, {
      spotIds: [one.spot.id, two.spot.id],
      recipientIds: [ANA, BEN],
      sender: SENDER,
    });

    expect(kinds()).toEqual(['copy', 'copy', 'copy', 'rpc create_send', 'copy', 'copy', 'copy', 'rpc create_send']);
    const [toAna, toBen] = rpcArgs('create_send');
    expect(toAna.p_recipient).toBe(ANA);
    expect(toBen.p_recipient).toBe(BEN);
    expect(toAna.p_id).not.toBe(toBen.p_id);
    const copies = fake.calls.filter((c): c is Extract<FakeCall, { kind: 'copy' }> => c.kind === 'copy');
    expect(copies.slice(0, 3).map((c) => [c.bucket, c.from, c.to])).toEqual(
      [...one.media, ...two.media].map((m) => [
        'photos',
        `${ME}/${m.spot_id}/${m.id}.jpg`,
        `sends/${String(toAna.p_id)}/${m.id}.jpg`,
      ]),
    );
    expect(copies.slice(3).every((c) => c.to.startsWith(`sends/${String(toBen.p_id)}/`))).toBe(true);
    // the payload is the frozen copy of these spots for that send id
    const payload = toAna.p_payload as SendPayload;
    expect(payload).toEqual(
      freezeSend({
        sendId: String(toAna.p_id),
        sender: SENDER,
        spots: [one.spot, two.spot].map((s) => ({ ...s })),
        mediaBySpot: { [one.spot.id]: one.media, [two.spot.id]: two.media },
      }),
    );
    expect(result).toEqual({
      sentTo: [
        { id: ANA, username: 'ana', display_name: 'Ana' },
        { id: BEN, username: 'ben', display_name: null },
      ],
    });
  });

  it('a copy failing partway removes exactly the paths already copied and sends nothing', async () => {
    const one = await backedUpSpot('Library rail', 2);
    fake.objects.delete(`photos/${ME}/${one.spot.id}/${one.media[1].id}.jpg`);

    const result = await createSend(db, client(), ME, { spotIds: [one.spot.id], recipientIds: [ANA], sender: SENDER });

    expect(kinds()).toEqual(['copy', 'copy', 'remove']);
    const firstCopy = fake.calls[0] as Extract<FakeCall, { kind: 'copy' }>;
    expect(fake.calls[2]).toEqual({ kind: 'remove', bucket: 'photos', paths: [firstCopy.to] });
    expect(rpcArgs('create_send')).toEqual([]);
    expect(result).toEqual({
      sentTo: [],
      failed: { to: { id: ANA, username: 'ana', display_name: 'Ana' }, message: 'Object not found' },
    });
  });

  it('create_send failing for the second friend keeps the first send, removes the second one’s copies and stops', async () => {
    const one = await backedUpSpot('Library rail', 1);
    let n = 0;
    fake.rpcHandlers.create_send = () => {
      n += 1;
      return n === 2
        ? { data: null, error: { message: 'you can only send to friends', code: '42501' } }
        : { data: null, error: null };
    };

    const result = await createSend(db, client(), ME, {
      spotIds: [one.spot.id],
      recipientIds: [ANA, BEN],
      sender: SENDER,
    });

    expect(kinds()).toEqual(['copy', 'rpc create_send', 'copy', 'rpc create_send', 'remove']);
    const secondCopy = fake.calls[2] as Extract<FakeCall, { kind: 'copy' }>;
    expect(fake.calls[4]).toEqual({ kind: 'remove', bucket: 'photos', paths: [secondCopy.to] });
    expect(result).toEqual({
      sentTo: [{ id: ANA, username: 'ana', display_name: 'Ana' }],
      failed: { to: { id: BEN, username: 'ben', display_name: null }, message: 'you can only send to friends' },
    });
  });

  it('a lost create_send answer after the send went in counts as sent and keeps its photos', async () => {
    const one = await backedUpSpot('Library rail', 1);
    fake.rpcHandlers.create_send = (args) => {
      fake.tables.sends.push({ id: args?.p_id, sender: ME, recipient: args?.p_recipient });
      return { data: null, error: { message: 'network request failed' } };
    };
    const result = await createSend(db, client(), ME, { spotIds: [one.spot.id], recipientIds: [ANA], sender: SENDER });
    expect(result).toEqual({ sentTo: [{ id: ANA, username: 'ana', display_name: 'Ana' }] });
    expect(kinds()).not.toContain('remove');
  });

  it('a create_send error when the send can’t be checked leaves the copies (account-delete sweeps staged ones)', async () => {
    const one = await backedUpSpot('Library rail', 1);
    fake.failNext('rpc', { message: 'network request failed' }, 'create_send');
    fake.failSelect((s) => s.table === 'sends', { message: 'offline' });
    const result = await createSend(db, client(), ME, { spotIds: [one.spot.id], recipientIds: [ANA], sender: SENDER });
    expect(result?.failed?.message).toBe('network request failed');
    expect(kinds()).not.toContain('remove');
  });

  it('a spot that is not backed up (waiting, failed or parked; a photo of it waiting; phone-only; another account’s) refuses before any call', async () => {
    const waiting = await backedUpSpot('Waiting', 1);
    const photoWaits = await backedUpSpot('Photo waits', 1);
    const parked = await backedUpSpot('Parked', 0);
    const fine = await backedUpSpot('Fine', 1);
    const phoneOnly = createTestSpot({ name: 'Phone only' });
    await insertSpot(db, phoneOnly);
    const theirs = createTestSpot({ name: 'Theirs', owner_id: ANA });
    await insertSpot(db, theirs);
    // backedUpSpot empties the outbox: the waiting rows go in last
    await enqueue(db, 'spot', waiting.spot.id, 'upsert');
    await enqueue(db, 'media', photoWaits.media[0].id, 'upsert');
    await enqueue(db, 'spot', parked.spot.id, 'upsert');
    await db.runAsync('UPDATE sync_outbox SET parked = 1 WHERE entity_id = ?', parked.spot.id);

    const attempt = createSend(db, client(), ME, {
      spotIds: [waiting.spot.id, photoWaits.spot.id, parked.spot.id, phoneOnly.id, theirs.id, fine.spot.id],
      recipientIds: [ANA],
      sender: SENDER,
    });

    await expect(attempt).rejects.toBeInstanceOf(NotBackedUpError);
    await expect(attempt).rejects.toMatchObject({ count: 5 });
    expect(fake.calls).toEqual([]);
  });

  it('a friend or a spot given twice is sent once', async () => {
    const one = await backedUpSpot('Library rail', 1);
    const result = await createSend(db, client(), ME, {
      spotIds: [one.spot.id, one.spot.id],
      recipientIds: [ANA, ANA],
      sender: SENDER,
    });
    expect(kinds()).toEqual(['copy', 'rpc create_send']);
    expect(result?.sentTo.map((f) => f.id)).toEqual([ANA]);
  });

  it('a spot that is gone (deleted or never here) refuses too', async () => {
    const gone = await backedUpSpot('Gone', 0, { deleted_at: '2026-10-20T10:00:00.000Z' });
    await expect(
      createSend(db, client(), ME, { spotIds: [gone.spot.id, newId()], recipientIds: [ANA], sender: SENDER }),
    ).rejects.toMatchObject({ count: 2 });
    expect(fake.calls).toEqual([]);
  });

  it(`more than ${MAX_SEND_SPOTS} spots, no spots or no friend is refused before any call`, async () => {
    const ids = Array.from({ length: MAX_SEND_SPOTS + 1 }, () => newId());
    await expect(createSend(db, client(), ME, { spotIds: ids, recipientIds: [ANA], sender: SENDER })).rejects.toThrow(
      'at most 100 spots',
    );
    await expect(createSend(db, client(), ME, { spotIds: [], recipientIds: [ANA], sender: SENDER })).rejects.toThrow();
    const one = await backedUpSpot('One');
    await expect(
      createSend(db, client(), ME, { spotIds: [one.spot.id], recipientIds: [], sender: SENDER }),
    ).rejects.toThrow();
    expect(fake.calls).toEqual([]);
  });

  it('does nothing without a session for the rider', async () => {
    const one = await backedUpSpot('One');
    fake.setSession(null);
    expect(
      await createSend(db, client(), ME, { spotIds: [one.spot.id], recipientIds: [ANA], sender: SENDER }),
    ).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('names a friend the phone has no name for by id only', async () => {
    const one = await backedUpSpot('One', 0);
    const stranger = '00000000-0000-4000-8000-0000000000c1';
    const result = await createSend(db, client(), ME, {
      spotIds: [one.spot.id],
      recipientIds: [stranger],
      sender: SENDER,
    });
    expect(result).toEqual({ sentTo: [{ id: stranger, username: null, display_name: null }] });
  });
});

// The recipient's side ------------------------------------------------------------------------------------------------

const SEND_1 = '00000000-0000-4000-8000-000000000501';
const SEND_2 = '00000000-0000-4000-8000-000000000502';
const SPOT_A = 'sender-spot-a';
const SPOT_B = 'sender-spot-b';
const PHOTO_A1 = '00000000-0000-4000-8000-0000000000f1';
const PHOTO_A2 = '00000000-0000-4000-8000-0000000000f2';
const PHOTO_B1 = '00000000-0000-4000-8000-0000000000f3';

/** What the sender froze: spot A with two photos (rated None), spot B with one. */
function payloadFor(sendId: string): SendPayload {
  return {
    v: 1,
    sender: SENDER,
    spots: [
      {
        id: SPOT_A,
        name: 'Library rail',
        generated_name: 'Capitol Hill',
        lat: 47.6,
        lng: -122.3,
        feature_types: [FeatureType.Rail],
        stopped: true,
        natural_speed: 0,
        notes: 'kinked',
        photos: [PHOTO_A1, PHOTO_A2].map((id) => ({
          media_id: id,
          path: `sends/${sendId}/${id}.jpg`,
          captured_at: '2026-10-01',
        })),
      },
      {
        id: SPOT_B,
        name: null,
        generated_name: 'Fremont',
        lat: 47.65,
        lng: -122.35,
        feature_types: [],
        stopped: false,
        natural_speed: null,
        notes: null,
        photos: [{ media_id: PHOTO_B1, path: `sends/${sendId}/${PHOTO_B1}.jpg`, captured_at: null }],
      },
    ],
  };
}

/** A send to the rider on the server, with its photo objects. */
function serverSend(sendId: string, row: Record<string, unknown> = {}) {
  fake.tables.sends.push({
    id: sendId,
    sender: ANA,
    recipient: ME,
    payload: payloadFor(sendId),
    created_at: '2026-10-22 10:00:00+00',
    saved_at: null,
    dismissed_at: null,
    withdrawn_at: null,
    ...row,
  });
  for (const id of [PHOTO_A1, PHOTO_A2, PHOTO_B1]) fake.objects.set(`photos/sends/${sendId}/${id}.jpg`, BYTES);
}

const itemFor = (sendId: string): SendItem => ({
  kind: 'send',
  id: sendId,
  sendId,
  created_at: '2026-10-22T10:00:00.000Z',
  from: SENDER,
  payload: payloadFor(sendId),
});

describe('loadSends and loadAndApplySends', () => {
  it('returns the sends to the rider that are not saved, dismissed or withdrawn, newest first, as Inbox items', async () => {
    serverSend(SEND_1, { created_at: '2026-10-21 10:00:00+00' });
    serverSend(SEND_2, { created_at: '2026-10-22 10:00:00+00' });
    serverSend('00000000-0000-4000-8000-000000000503', { saved_at: '2026-10-22 11:00:00+00' });
    serverSend('00000000-0000-4000-8000-000000000504', { dismissed_at: '2026-10-22 11:00:00+00' });
    serverSend('00000000-0000-4000-8000-000000000505', { withdrawn_at: '2026-10-22 11:00:00+00' });
    serverSend('00000000-0000-4000-8000-000000000506', { sender: ME, recipient: ANA });

    const items = await loadSends(client(), ME);

    expect(items).toEqual([
      { ...itemFor(SEND_2), created_at: '2026-10-22T10:00:00.000Z' },
      { ...itemFor(SEND_1), created_at: '2026-10-21T10:00:00.000Z' },
    ]);
    const select = fake.selects.find((s) => s.table === 'sends');
    expect(select?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'recipient', ME],
        ['is', 'saved_at', null],
        ['is', 'dismissed_at', null],
      ]),
    );
  });

  it('skips a send whose payload is not a send (warns) and keeps the rest', async () => {
    serverSend(SEND_1);
    serverSend(SEND_2, { payload: { v: 2 } });
    const items = await loadSends(client(), ME);
    expect(items?.map((i) => i.id)).toEqual([SEND_1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sends]'), expect.stringContaining('version 2'));
  });

  it('is null without a session, and selects nothing', async () => {
    fake.setSession(null);
    expect(await loadSends(client(), ME)).toBeNull();
    expect(fake.selects).toEqual([]);
  });

  it('loadAndApplySends puts the sends into the Inbox next to the friend requests, and they count toward the badge', async () => {
    serverSend(SEND_1);
    useInboxStore.getState().setItems(ME, 'friend_request', [
      {
        kind: 'friend_request',
        id: 'f1',
        friendshipId: 'f1',
        created_at: '2026-10-20T10:00:00.000Z',
        from: { id: BEN, username: 'ben', display_name: null },
      },
    ]);
    useInboxStore.setState({ seenAt: '2026-10-21T00:00:00.000Z' });

    await loadAndApplySends(db, client(), ME);

    const { items } = useInboxStore.getState();
    expect(items.map((i) => `${i.kind} ${i.id}`)).toEqual(['friend_request f1', `send ${SEND_1}`]);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(1);
  });

  it('loadAndApplySends warns on a server error and leaves the Inbox as it was', async () => {
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
    fake.failNext('select', { message: 'offline' }, 'sends');
    await loadAndApplySends(db, client(), ME);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sends]'), 'offline');
  });

  it('loadAndApplySends applies nothing on a phone whose rows are another account’s', async () => {
    serverSend(SEND_1);
    await adoptPhoneFor(db, 'someone-else');
    await loadAndApplySends(db, client(), ME);
    expect(useInboxStore.getState().items).toEqual([]);
  });
});

describe('saveSend', () => {
  const ownedSpots = async () => (await getSpots(db)).filter((s) => s.owner_id === ME);

  beforeEach(() => {
    serverSend(SEND_1);
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
  });

  it('Save all downloads every photo, marks the send saved, then inserts owned copies marked From @Ana_B', async () => {
    let filesWhenMarked = -1;
    fake.rpcHandlers.mark_send_saved = () => {
      filesWhenMarked = fakeFs.__writes().length;
      return { data: null, error: null };
    };

    const result = await saveSend(db, client(), ME, itemFor(SEND_1));

    expect(result).toEqual({ status: 'saved', saved: 2, failedPhotos: 0 });
    expect(rpcArgs('mark_send_saved')).toEqual([{ p_id: SEND_1, p_token: expect.any(String) }]);
    expect(filesWhenMarked).toBe(3);

    const spots = await ownedSpots();
    expect(spots).toHaveLength(2);
    const rail = spots.find((s) => s.name === 'Library rail')!;
    expect(rail).toMatchObject({
      owner_id: ME,
      copied_from_send: SEND_1,
      from_username: 'Ana_B',
      generated_name: 'Capitol Hill',
      location: { latitude: 47.6, longitude: -122.3 },
      feature_types: [FeatureType.Rail],
      stopped: true,
      natural_speed: 0,
      notes: 'kinked',
    });
    expect(rail.id).not.toBe(SPOT_A);
    const media = await getAllMedia(db);
    expect(media).toHaveLength(3);
    const railMedia = media.filter((m) => m.spot_id === rail.id);
    expect(railMedia).toHaveLength(2);
    for (const m of media) {
      expect(m.file_path).toBe(`photos/${m.spot_id}/${m.id}.jpg`);
      expect(fakeFs.__fileBytes(`${DOC}${m.file_path}`)).toEqual(BYTES);
    }
    // owned rows queue for the rider's backup
    const queued = await outboxOps(db);
    expect(queued.filter(([entity]) => entity === 'spot')).toHaveLength(2);
    expect(queued.filter(([entity]) => entity === 'media')).toHaveLength(3);
    // the Inbox item leaves and the Spots tab shows the copies
    expect(useInboxStore.getState().items).toEqual([]);
    expect(useSpotsStore.getState().spots.map((s) => s.id).sort()).toEqual(spots.map((s) => s.id).sort());
  });

  it('the copy’s primary photo is the first one sent', async () => {
    await saveSend(db, client(), ME, itemFor(SEND_1));
    const rail = (await ownedSpots()).find((s) => s.name === 'Library rail')!;
    const primary = (await getAllMedia(db)).find((m) => m.id === rail.primary_photo_id);
    expect(primary?.spot_id).toBe(rail.id);
    // the first download is the first photo of the first spot
    expect(fakeFs.__writes()[0]).toBe(`${DOC}photos/${rail.id}/${primary!.id}.jpg`);
  });

  it('Pick spots saves only the picked ones and still finishes the send', async () => {
    const result = await saveSend(db, client(), ME, itemFor(SEND_1), { spotIds: [SPOT_B] });
    expect(result).toEqual({ status: 'saved', saved: 1, failedPhotos: 0 });
    const spots = await ownedSpots();
    expect(spots.map((s) => s.generated_name)).toEqual(['Fremont']);
    expect(await getAllMedia(db)).toHaveLength(1);
    expect(rpcArgs('mark_send_saved')).toEqual([{ p_id: SEND_1, p_token: expect.any(String) }]);
  });

  it('Save into a new hit list also makes an owned list named From @Ana_B holding the copies', async () => {
    const result = await saveSend(db, client(), ME, itemFor(SEND_1), { newList: true });
    expect(result).toMatchObject({ status: 'saved', saved: 2, listId: expect.any(String) });
    const lists = await getHitLists(db);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ id: (result as { listId: string }).listId, name: 'From @Ana_B', kind: 'manual', owner_id: ME });
    const memberships = await getListMemberships(db);
    const spots = await ownedSpots();
    for (const spot of spots) expect(memberships[spot.id]).toEqual([lists[0].id]);
    const queued = await outboxOps(db);
    expect(queued.filter(([entity]) => entity === 'hit_list')).toHaveLength(1);
    expect(queued.filter(([entity]) => entity === 'hit_list_spot')).toHaveLength(2);
  });

  it('a photo that could not be downloaded is left out; its spot stays and the result counts it', async () => {
    fake.objects.delete(`photos/sends/${SEND_1}/${PHOTO_A1}.jpg`);
    const result = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(result).toEqual({ status: 'saved', saved: 2, failedPhotos: 1 });
    const rail = (await ownedSpots()).find((s) => s.name === 'Library rail')!;
    const railMedia = (await getAllMedia(db)).filter((m) => m.spot_id === rail.id);
    expect(railMedia).toHaveLength(1);
    expect(rail.primary_photo_id).toBe(railMedia[0].id);
    expect(warn).toHaveBeenCalled();
  });

  it('a spot whose only photo failed has no primary photo', async () => {
    fake.objects.delete(`photos/sends/${SEND_1}/${PHOTO_B1}.jpg`);
    await saveSend(db, client(), ME, itemFor(SEND_1));
    const fremont = (await ownedSpots()).find((s) => s.generated_name === 'Fremont')!;
    expect(fremont.primary_photo_id).toBeUndefined();
  });

  it('the session ending before mark_send_saved inserts nothing, deletes the downloads and keeps the item', async () => {
    fake.rpcHandlers.mark_send_saved = () => {
      fake.setSession(null);
      return { data: null, error: { message: 'not signed in', code: '42501' } };
    };
    const result = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(result).toEqual({ status: 'failed' });
    expect(await countRows('spots')).toBe(0);
    expect(await countRows('media')).toBe(0);
    for (const uri of fakeFs.__writes()) expect(fakeFs.__fileExists(uri)).toBe(false);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);
  });

  it('a send saved already (55000, another phone) inserts nothing, deletes the downloads and drops the item', async () => {
    fake.failNext('rpc', { message: 'this send was saved already', code: '55000' }, 'mark_send_saved');
    const result = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(result).toEqual({ status: 'already_saved' });
    expect(await countRows('spots')).toBe(0);
    for (const uri of fakeFs.__writes()) expect(fakeFs.__fileExists(uri)).toBe(false);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  /** mark_send_saved as the server answers it: once per send, the same token again succeeds (a retry after a lost answer). */
  function serverMark({ loseFirstAnswer = false } = {}) {
    let savedWith: unknown = null;
    let calls = 0;
    fake.rpcHandlers.mark_send_saved = (args) => {
      calls += 1;
      if (savedWith === null) savedWith = args?.p_token;
      else if (savedWith !== args?.p_token) return { data: null, error: { message: 'saved already', code: '55000' } };
      return loseFirstAnswer && calls === 1
        ? { data: null, error: { message: 'network request failed' } }
        : { data: null, error: null };
    };
  }

  it('a lost answer after the server saved it: the retry sends the same token, saves the copies once, downloads nothing again', async () => {
    serverMark({ loseFirstAnswer: true });

    const first = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(first).toEqual({ status: 'failed' });
    expect(await countRows('spots')).toBe(0);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);
    const downloaded = fakeFs.__writes();
    // the files stay for the retry
    for (const uri of downloaded) expect(fakeFs.__fileExists(uri)).toBe(true);

    const second = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(second).toEqual({ status: 'saved', saved: 2, failedPhotos: 0 });
    const [a, b] = rpcArgs('mark_send_saved');
    expect(b.p_token).toBe(a.p_token);
    expect(fakeFs.__writes()).toEqual(downloaded);
    expect(await countRows('spots')).toBe(2);
    expect(await countRows('media')).toBe(3);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('hasPendingSave is true only while a save the server may have marked waits for its retry (the Inbox offers Try again)', async () => {
    serverMark({ loseFirstAnswer: true });
    expect(hasPendingSave(ME, SEND_1)).toBe(false);

    await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(hasPendingSave(ME, SEND_1)).toBe(true);
    expect(hasPendingSave('rider-other', SEND_1)).toBe(false);

    await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(hasPendingSave(ME, SEND_1)).toBe(false);
  });

  it('a stale item saved on another phone (a lost answer, then 55000 with this phone’s token) saves nothing', async () => {
    fake.tables.sends[0].saved_at = '2026-10-22 12:00:00+00';
    fake.failNext('rpc', { message: 'network request failed' }, 'mark_send_saved');
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'failed' });
    fake.failNext('rpc', { message: 'saved already', code: '55000' }, 'mark_send_saved');
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'already_saved' });
    expect(await countRows('spots')).toBe(0);
    for (const uri of fakeFs.__writes()) expect(fakeFs.__fileExists(uri)).toBe(false);
  });

  it('an insert failing after the send was marked saved keeps the save: the retry inserts each copy once', async () => {
    serverMark();
    // the photos' inserts fail after the spots went in
    await db.execAsync(
      "CREATE TEMP TRIGGER fail_media BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT, 'database is locked'); END",
    );

    await expect(saveSend(db, client(), ME, itemFor(SEND_1))).resolves.toEqual({ status: 'failed' });
    expect(await countRows('spots')).toBe(2);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);
    await db.execAsync('DROP TRIGGER fail_media');

    const retry = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(retry).toEqual({ status: 'saved', saved: 2, failedPhotos: 0 });
    expect(await countRows('spots')).toBe(2);
    expect(await countRows('media')).toBe(3);
    for (const m of await getAllMedia(db)) expect(fakeFs.__fileBytes(`${DOC}${m.file_path}`)).toEqual(BYTES);
  });

  it('offline (every photo fails to download) it marks nothing and saves nothing; back online the save has its photos', async () => {
    const paths = [PHOTO_A1, PHOTO_A2, PHOTO_B1].map((id) => `photos/sends/${SEND_1}/${id}.jpg`);
    for (const path of paths) fake.objects.delete(path);

    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'failed' });
    expect(rpcArgs('mark_send_saved')).toHaveLength(0);
    expect(await countRows('spots')).toBe(0);
    expect(hasPendingSave(ME, SEND_1)).toBe(false);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);

    for (const path of paths) fake.objects.set(path, BYTES);
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'saved', saved: 2, failedPhotos: 0 });
    expect(await countRows('media')).toBe(3);
  });

  it('a photo that failed is downloaded again on the retry after a lost answer', async () => {
    serverMark({ loseFirstAnswer: true });
    const path = `photos/sends/${SEND_1}/${PHOTO_A1}.jpg`;
    fake.objects.delete(path);
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'failed' });

    fake.objects.set(path, BYTES);
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'saved', saved: 2, failedPhotos: 0 });
    expect(await countRows('media')).toBe(3);
    for (const m of await getAllMedia(db)) expect(fakeFs.__fileBytes(`${DOC}${m.file_path}`)).toEqual(BYTES);
  });

  it('a sends load after a lost answer keeps the item waiting for Try again (the server lists it saved)', async () => {
    serverMark({ loseFirstAnswer: true });
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toEqual({ status: 'failed' });
    fake.tables.sends[0].saved_at = '2026-10-22 12:00:00+00';

    await loadAndApplySends(db, client(), ME);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);

    const retry = useInboxStore.getState().items[0] as SendItem;
    expect(await saveSend(db, client(), ME, retry)).toMatchObject({ status: 'saved', saved: 2 });
    expect(useInboxStore.getState().items).toEqual([]);
    await loadAndApplySends(db, client(), ME);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('a send the sender took back (no longer readable) inserts nothing and drops the item', async () => {
    fake.failNext('rpc', { message: 'no such send', code: '42501' }, 'mark_send_saved');
    fake.tables.sends = [];
    const result = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(result).toEqual({ status: 'taken_back' });
    expect(await countRows('spots')).toBe(0);
    for (const uri of fakeFs.__writes()) expect(fakeFs.__fileExists(uri)).toBe(false);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('any other error with the send still unsaved inserts nothing and keeps the item; the retry saves', async () => {
    fake.failNext('rpc', { message: 'timeout' }, 'mark_send_saved');
    const result = await saveSend(db, client(), ME, itemFor(SEND_1));
    expect(result).toEqual({ status: 'failed' });
    expect(await countRows('spots')).toBe(0);
    expect(useInboxStore.getState().items.map((i) => i.id)).toEqual([SEND_1]);
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toMatchObject({ status: 'saved', saved: 2 });
  });

  it('two saves of one send at once share one save: one rpc, one set of copies', async () => {
    const [a, b] = await Promise.all([
      saveSend(db, client(), ME, itemFor(SEND_1)),
      saveSend(db, client(), ME, itemFor(SEND_1)),
    ]);
    expect(a).toEqual(b);
    expect(rpcArgs('mark_send_saved')).toHaveLength(1);
    expect(await countRows('spots')).toBe(2);
  });

  it('a sends load that started before the save cannot put the saved item back', async () => {
    // the load reads the session first and gets it only after the save is done; the server still lists the send
    const session = gate<Awaited<ReturnType<FakeSupabase['auth']['getSession']>>>();
    fake.auth.getSession.mockImplementationOnce(() => session.promise);
    const staleLoad = loadAndApplySends(db, client(), ME);
    await saveSend(db, client(), ME, itemFor(SEND_1));
    session.open({ data: { session: fakeSession({ userId: ME }) }, error: null });
    await staleLoad;
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('a sends load started while the save runs (pull to refresh) cannot put the saved item back', async () => {
    const save = saveSend(db, client(), ME, itemFor(SEND_1));
    // this load starts after the save took its ticket and reads the server before mark_send_saved
    const session = gate<Awaited<ReturnType<FakeSupabase['auth']['getSession']>>>();
    fake.auth.getSession.mockImplementationOnce(() => session.promise);
    const midLoad = loadAndApplySends(db, client(), ME);
    await save;
    session.open({ data: { session: fakeSession({ userId: ME }) }, error: null });
    await midLoad;
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('does nothing without a session for the rider', async () => {
    fake.setSession(null);
    expect(await saveSend(db, client(), ME, itemFor(SEND_1))).toBeNull();
    expect(fake.rpcs).toEqual([]);
    expect(fakeFs.__writes()).toEqual([]);
  });
});

describe('dismissSend and withdrawSend', () => {
  it('dismissSend calls dismiss_send and drops the item', async () => {
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
    await dismissSend(client(), ME, SEND_1);
    expect(rpcArgs('dismiss_send')).toEqual([{ p_id: SEND_1 }]);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('a sends load that started before a dismiss cannot put the item back', async () => {
    serverSend(SEND_1);
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
    const session = gate<Awaited<ReturnType<FakeSupabase['auth']['getSession']>>>();
    fake.auth.getSession.mockImplementationOnce(() => session.promise);
    const staleLoad = loadAndApplySends(db, client(), ME);
    await dismissSend(client(), ME, SEND_1);
    session.open({ data: { session: fakeSession({ userId: ME }) }, error: null });
    await staleLoad;
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('a sends load started while the dismiss runs cannot put the item back', async () => {
    serverSend(SEND_1);
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
    const dismissed = gate<{ data: null; error: null }>();
    fake.rpcHandlers.dismiss_send = () => dismissed.promise as never;
    const dismiss = dismissSend(client(), ME, SEND_1);
    await new Promise((resolve) => setImmediate(resolve));
    // this load starts after the dismiss took its ticket and lands after the item left
    const session = gate<Awaited<ReturnType<FakeSupabase['auth']['getSession']>>>();
    fake.auth.getSession.mockImplementationOnce(() => session.promise);
    const midLoad = loadAndApplySends(db, client(), ME);
    dismissed.open({ data: null, error: null });
    await dismiss;
    session.open({ data: { session: fakeSession({ userId: ME }) }, error: null });
    await midLoad;
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('dismissSend of a send already gone (42501 with the session there) also drops the item', async () => {
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
    fake.failNext('rpc', { message: 'no such send', code: '42501' }, 'dismiss_send');
    await dismissSend(client(), ME, SEND_1);
    expect(useInboxStore.getState().items).toEqual([]);
  });

  it('dismissSend throws on another error and keeps the item', async () => {
    useInboxStore.getState().setItems(ME, 'send', [itemFor(SEND_1)]);
    fake.failNext('rpc', { message: 'timeout' }, 'dismiss_send');
    await expect(dismissSend(client(), ME, SEND_1)).rejects.toThrow('timeout');
    expect(useInboxStore.getState().items).toHaveLength(1);
  });

  it('withdrawSend calls withdraw_send, then removes the send’s photos', async () => {
    const result = await withdrawSend(client(), ME, {
      id: SEND_1,
      photoPaths: [`sends/${SEND_1}/${PHOTO_A1}.jpg`, `sends/${SEND_1}/${PHOTO_B1}.jpg`],
    });
    expect(result).toBe('withdrawn');
    expect(kinds()).toEqual(['rpc withdraw_send', 'remove']);
    expect(rpcArgs('withdraw_send')).toEqual([{ p_id: SEND_1 }]);
    expect(fake.calls[1]).toEqual({
      kind: 'remove',
      bucket: 'photos',
      paths: [`sends/${SEND_1}/${PHOTO_A1}.jpg`, `sends/${SEND_1}/${PHOTO_B1}.jpg`],
    });
  });

  it('withdrawSend of a send they saved already answers saved and removes nothing', async () => {
    fake.failNext('rpc', { message: 'this send was saved', code: '55000' }, 'withdraw_send');
    const result = await withdrawSend(client(), ME, { id: SEND_1, photoPaths: [`sends/${SEND_1}/${PHOTO_A1}.jpg`] });
    expect(result).toBe('saved');
    expect(kinds()).toEqual(['rpc withdraw_send']);
  });

  it('a failed photo remove after a withdraw only warns', async () => {
    fake.failNext('remove', { message: 'offline' });
    const result = await withdrawSend(client(), ME, { id: SEND_1, photoPaths: [`sends/${SEND_1}/${PHOTO_A1}.jpg`] });
    expect(result).toBe('withdrawn');
    expect(warn).toHaveBeenCalled();
  });

  it('neither calls anything without a session', async () => {
    fake.setSession(null);
    await dismissSend(client(), ME, SEND_1);
    expect(await withdrawSend(client(), ME, { id: SEND_1, photoPaths: [] })).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});

describe('listSent', () => {
  const CAL = '00000000-0000-4000-8000-0000000000c2';
  const DEE = '00000000-0000-4000-8000-0000000000d2';

  beforeEach(() => {
    const sent = (id: string, recipient: string | null, created: string, row: Record<string, unknown> = {}) =>
      fake.tables.sends.push({
        id,
        sender: ME,
        recipient,
        payload: payloadFor(id),
        created_at: created,
        saved_at: null,
        dismissed_at: null,
        withdrawn_at: null,
        ...row,
      });
    sent('00000000-0000-4000-8000-000000000601', BEN, '2026-10-22 09:00:00+00');
    sent('00000000-0000-4000-8000-000000000602', ANA, '2026-10-22 10:00:00+00', { saved_at: '2026-10-22 11:00:00+00' });
    sent('00000000-0000-4000-8000-000000000603', CAL, '2026-10-22 08:00:00+00', {
      withdrawn_at: '2026-10-22 08:30:00+00',
    });
    sent('00000000-0000-4000-8000-000000000604', DEE, '2026-10-22 07:00:00+00', {
      dismissed_at: '2026-10-22 07:30:00+00',
    });
    sent('00000000-0000-4000-8000-000000000605', null, '2026-10-22 12:00:00+00');
    // a send to the rider is not one they sent
    fake.tables.sends.push({ ...fake.tables.sends[0], id: '00000000-0000-4000-8000-000000000606', sender: ANA, recipient: ME });
    fake.profiles.set(CAL, { username: 'cal', display_name: 'Cal' });
    fake.profiles.set(BEN, { username: 'ben', display_name: null });
    fake.readableProfiles = new Set([CAL, BEN]);
  });

  it('lists the rider’s sends to friends newest first with status, count and names (server, then the mirror)', async () => {
    const sent = await listSent(db, client(), ME);
    expect(sent?.map(({ id, to, count, status }) => [id.slice(-3), to, count, status])).toEqual([
      ['602', { id: ANA, username: 'ana', display_name: 'Ana' }, 2, 'saved'],
      ['601', { id: BEN, username: 'ben', display_name: null }, 2, 'waiting'],
      ['603', { id: CAL, username: 'cal', display_name: 'Cal' }, 2, 'withdrawn'],
      // a dismissed send reads Waiting to its sender (D82); a rider the phone has no name for has none
      ['604', { id: DEE, username: null, display_name: null }, 2, 'waiting'],
    ]);
    expect(sent?.[0]).toMatchObject({
      created_at: '2026-10-22T10:00:00.000Z',
      photoPaths: [PHOTO_A1, PHOTO_A2, PHOTO_B1].map((p) => `sends/00000000-0000-4000-8000-000000000602/${p}.jpg`),
    });
    const select = fake.selects.find((s) => s.table === 'sends');
    expect(select?.filters).toEqual(expect.arrayContaining([['eq', 'sender', ME]]));
  });

  it('is null without a session; throws when the server can’t be read', async () => {
    fake.failNext('select', { message: 'offline' }, 'sends');
    await expect(listSent(db, client(), ME)).rejects.toThrow('offline');
    fake.setSession(null);
    expect(await listSent(db, client(), ME)).toBeNull();
  });
});

describe('link sends (S9, D94)', () => {
  it('createLinkSend copies the photos, then makes one create_send with no recipient', async () => {
    const one = await backedUpSpot('Library rail', 2);

    const made = await createLinkSend(db, client(), ME, { spotIds: [one.spot.id, one.spot.id], sender: SENDER });

    expect(kinds()).toEqual(['copy', 'copy', 'rpc create_send']);
    const [args] = rpcArgs('create_send');
    expect(args.p_recipient).toBeNull();
    expect(made).toEqual({
      sendId: args.p_id,
      photoPaths: one.media.map((m) => `sends/${String(args.p_id)}/${m.id}.jpg`),
    });
  });

  it('createLinkSend throws on a spot not backed up, and on a failed create_send (removing its copies)', async () => {
    const one = await backedUpSpot('One');
    await enqueue(db, 'spot', one.spot.id, 'upsert');
    await expect(createLinkSend(db, client(), ME, { spotIds: [one.spot.id], sender: SENDER })).rejects.toBeInstanceOf(
      NotBackedUpError,
    );
    expect(fake.calls).toEqual([]);

    await clearOutbox(db);
    fake.failNext('rpc', { message: 'boom' }, 'create_send');
    await expect(createLinkSend(db, client(), ME, { spotIds: [one.spot.id], sender: SENDER })).rejects.toThrow('boom');
    expect(kinds()).toEqual(['copy', 'rpc create_send', 'remove']);
  });

  it('createLinkSend is null without a session', async () => {
    const one = await backedUpSpot('One');
    fake.setSession(null);
    expect(await createLinkSend(db, client(), ME, { spotIds: [one.spot.id], sender: SENDER })).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('makeSendLink makes the link-only send, then its link with the expiry, and returns the URL', async () => {
    const one = await backedUpSpot('One');

    const url = await makeSendLink(db, client(), ME, { spotIds: [one.spot.id], sender: SENDER, expiry: '30d' });

    expect(kinds()).toEqual(['copy', 'rpc create_send', 'rpc create_link']);
    const [link] = rpcArgs('create_link');
    expect(link).toMatchObject({ p_kind: 'send', p_target: rpcArgs('create_send')[0].p_id });
    expect(url).toMatch(/#t=[A-Za-z0-9_-]{22}$/);
  });

  it('makeSendLink withdraws the send (and its photos) when the link can’t be made, then throws', async () => {
    const one = await backedUpSpot('One');
    fake.failNext('rpc', { message: 'boom' }, 'create_link');

    await expect(
      makeSendLink(db, client(), ME, { spotIds: [one.spot.id], sender: SENDER, expiry: '7d' }),
    ).rejects.toThrow('boom');
    expect(kinds()).toEqual(['copy', 'rpc create_send', 'rpc create_link', 'rpc withdraw_send', 'remove']);
    expect(rpcArgs('withdraw_send')).toEqual([{ p_id: rpcArgs('create_send')[0].p_id }]);
  });

  describe('listSentLinks and revokeSentLink', () => {
    const LINK_SEND = '00000000-0000-4000-8000-000000000701';
    const OLD_SEND = '00000000-0000-4000-8000-000000000702';
    const GONE_SEND = '00000000-0000-4000-8000-000000000703';
    const future = () => new Date(Date.now() + 864e5).toISOString();
    const past = () => new Date(Date.now() - 1000).toISOString();
    const link = (id: string, sendId: string, over: Record<string, unknown> = {}) => ({
      id,
      kind: 'send',
      send_id: sendId,
      list_id: null,
      role: null,
      created_at: '2026-10-22T10:00:00+00:00',
      expires_at: future(),
      revoked_at: null,
      used_at: null,
      used_by: null,
      used_by_username: null,
      ...over,
    });

    beforeEach(() => {
      const send = (id: string, row: Record<string, unknown> = {}) =>
        fake.tables.sends.push({
          id,
          sender: ME,
          recipient: null,
          payload: payloadFor(id),
          created_at: '2026-10-22 09:00:00+00',
          saved_at: null,
          dismissed_at: null,
          withdrawn_at: null,
          ...row,
        });
      send(LINK_SEND);
      send(OLD_SEND);
      send(GONE_SEND, { withdrawn_at: '2026-10-22 11:00:00+00' });
      // a send to a friend has no link row
      send('00000000-0000-4000-8000-000000000704', { recipient: ANA });
    });

    it('pairs each send link with its link-only send: count, status, expiry, photos; newest first as listed', async () => {
      fake.rpcHandlers.list_my_links = () => ({
        data: [
          link('link-active', LINK_SEND),
          link('link-expired', OLD_SEND, { expires_at: past() }),
          link('link-revoked', LINK_SEND, { revoked_at: past() }),
          link('link-never', LINK_SEND, { expires_at: null }),
        ],
        error: null,
      });

      const links = await listSentLinks(client(), ME);

      expect(rpcArgs('list_my_links')).toEqual([{ p_kind: 'send' }]);
      expect(links?.map((l) => [l.id, l.status, l.count])).toEqual([
        ['link-active', 'active', 2],
        ['link-expired', 'expired', 2],
        ['link-revoked', 'revoked', 2],
        ['link-never', 'active', 2],
      ]);
      expect(links?.[0]).toMatchObject({
        sendId: LINK_SEND,
        createdAt: '2026-10-22T10:00:00.000Z',
        photoPaths: [PHOTO_A1, PHOTO_A2, PHOTO_B1].map((p) => `sends/${LINK_SEND}/${p}.jpg`),
      });
      expect(links?.[3].expiresAt).toBeNull();
      const select = fake.selects.find((s) => s.table === 'sends');
      expect(select?.filters).toEqual(expect.arrayContaining([['eq', 'sender', ME], ['is', 'recipient', null]]));
    });

    it('a link whose send was withdrawn reads revoked and its revoke is retried quietly', async () => {
      fake.rpcHandlers.list_my_links = () => ({ data: [link('link-half', GONE_SEND)], error: null });

      const links = await listSentLinks(client(), ME);

      expect(links?.map((l) => l.status)).toEqual(['revoked']);
      await new Promise((done) => setImmediate(done));
      expect(rpcArgs('revoke_link')).toEqual([{ p_id: 'link-half' }]);
    });

    it('a link whose send the rider can’t read is left out', async () => {
      fake.rpcHandlers.list_my_links = () => ({
        data: [link('link-x', '00000000-0000-4000-8000-000000000799'), link('link-active', LINK_SEND)],
        error: null,
      });
      expect((await listSentLinks(client(), ME))?.map((l) => l.id)).toEqual(['link-active']);
    });

    it('is null without a session; throws when the server can’t be read', async () => {
      fake.failNext('rpc', { message: 'offline' }, 'list_my_links');
      await expect(listSentLinks(client(), ME)).rejects.toThrow('offline');
      fake.setSession(null);
      expect(await listSentLinks(client(), ME)).toBeNull();
    });

    it('revokeSentLink withdraws the link-only send (removing its photos) first, then revokes the link (D93)', async () => {
      const paths = [`sends/${LINK_SEND}/${PHOTO_A1}.jpg`];

      expect(await revokeSentLink(client(), ME, { id: 'link-active', sendId: LINK_SEND, photoPaths: paths })).toBe(true);

      expect(kinds()).toEqual(['rpc withdraw_send', 'remove', 'rpc revoke_link']);
      expect(rpcArgs('withdraw_send')).toEqual([{ p_id: LINK_SEND }]);
      expect(rpcArgs('revoke_link')).toEqual([{ p_id: 'link-active' }]);
    });

    it('revokeSentLink throws when the withdraw fails, and calls nothing without a session', async () => {
      fake.failNext('rpc', { message: 'boom' }, 'withdraw_send');
      await expect(
        revokeSentLink(client(), ME, { id: 'link-active', sendId: LINK_SEND, photoPaths: [] }),
      ).rejects.toThrow('boom');
      expect(rpcArgs('revoke_link')).toEqual([]);
      fake.setSession(null);
      expect(await revokeSentLink(client(), ME, { id: 'link-active', sendId: LINK_SEND, photoPaths: [] })).toBeNull();
    });
  });
});
