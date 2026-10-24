/**
 * Sync against the local stack (S5-07, docs/plans/2026-10-22-s5-sync.md "Integration test design"): two phones of one
 * rider (two real sessions, two node:sqlite DBs) converge through src/sync, and one phone signed in by two riders in
 * turn keeps each account's spots apart and loses no photo. Needs the stack: npm run db:start, then
 * npm run test:integration.
 *
 * Phones A and B keep their photos in their own temp folder (nodePhotoIO); phone P, the one two riders share, uses
 * the app's own PhotoIO over the in-memory expo-file-system fake (__mocks__, applied to node_modules automatically),
 * because the account switch deletes photo folders through expo-file-system. Node has no image manipulator, so every
 * `prepare` hands the stored bytes over unchanged: the byte-for-byte checks prove the transport and the storage path,
 * not D46's re-encoding (on the phone the server copy is the re-encoded JPEG, tested in sync-photos.test.ts).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import * as fileSystem from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getMediaForSpot, getSpot, getSpots, insertMedia, insertSpot, softDeleteSpot, updateSpot } from '@/src/db';
import {
  addSpotsToList,
  getHitLists,
  getListMemberships,
  insertHitList,
  removeSpotFromList,
} from '@/src/db/hit-lists';
import { countPending, getCursor, getSyncState } from '@/src/db/sync';
import { adopt } from '@/src/sync/adopt';
import { defaultPhotoIO, storagePath, type PhotoIO } from '@/src/sync/photos';
import { createMigratedTestDb } from '@/src/__tests__/helpers/node-sqlite-db';
import { FeatureType, type HitList, type Spot } from '@/src/types';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { newId } from '@/src/utils/id';

import { createRider, deleteRiderAndPhotos, signInAgain, uniqueUsername, type Rider } from './helpers';
import { FIXTURE, nodePhotoIO, pullAll, pushAll, sync } from './phones';

// The engine (imported by adopt) reaches the app's client module, which needs React Native; these tests hand their own
// clients to push and pull, so the app client is never used.
jest.mock('@/src/sync/client', () => ({ getSupabase: () => null, isConfigured: () => false }));
// photos.ts imports the manipulator for preparePhoto, which these tests replace (no native module in Node).
jest.mock('expo-image-manipulator', () => ({}));
// newId is expo-crypto's native randomUUID on the phone; Node's crypto here.
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { randomUUID: () => nodeCrypto.randomUUID() };
});

const fakeFs = fileSystem as unknown as typeof import('../../__mocks__/expo-file-system');

/** The app's PhotoIO (expo-file-system, here the in-memory fake) with the bytes uploaded as stored. */
const appPhotoIO: PhotoIO = {
  ...defaultPhotoIO,
  async prepare(filePath) {
    const bytes = fakeFs.__fileBytes(resolvePhotoUri(filePath));
    if (!bytes) throw new Error(`no file at ${filePath}`);
    return { uri: resolvePhotoUri(filePath), bytes, cleanup: () => {} };
  },
};

const now = () => new Date().toISOString();
const later = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

function makeSpot(name: string, owner?: string): Spot {
  const at = now();
  return {
    id: newId(),
    name,
    location: { latitude: 47.6062, longitude: -122.3321 },
    created_at: at,
    updated_at: at,
    feature_types: [FeatureType.Rail, FeatureType.Ledge],
    stopped: true,
    natural_speed: 0,
    owner_id: owner,
  };
}

function makeList(name: string, owner?: string): HitList {
  const at = now();
  return { id: newId(), name, kind: 'manual', shared: false, owner_id: owner, created_at: at, updated_at: at };
}

/** A photo on a phone, as Quick Add leaves it: the file under photos/<spot>/<media>.jpg and its media row. */
async function addPhoto(db: SQLiteDatabase, spotId: string, io: PhotoIO): Promise<string> {
  const id = newId();
  const filePath = `photos/${spotId}/${id}.jpg`;
  io.write(filePath, FIXTURE);
  await insertMedia(db, { id, spot_id: spotId, file_path: filePath, created_at: now() });
  return id;
}

/** Every row id of a table, whatever its deleted_at (getSpots hides soft-deleted rows; removal must leave none). */
async function allIds(db: SQLiteDatabase, table: 'spots' | 'media' | 'hit_lists' | 'hit_list_spots'): Promise<string[]> {
  const column = table === 'hit_list_spots' ? "list_id || '/' || spot_id" : 'id';
  const rows = await db.getAllAsync<{ id: string }>(`SELECT ${column} AS id FROM ${table} ORDER BY 1`);
  return rows.map((r) => r.id);
}

async function deletedAt(db: SQLiteDatabase, spotId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ deleted_at: string | null }>('SELECT deleted_at FROM spots WHERE id = ?', spotId);
  return row?.deleted_at ?? null;
}

async function serverBytes(client: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await client.storage.from('photos').download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

/** Every rider made here, deleted with their photos in afterAll (a test that failed signed out still gets cleaned up). */
const riders: { email: string; userId: string }[] = [];
const tempDirs: string[] = [];

afterAll(async () => {
  for (const rider of riders) await deleteRiderAndPhotos(rider.email, rider.userId);
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('two phones of one rider', () => {
  let rider: Rider;
  let clientB: SupabaseClient;
  let dbA: SQLiteDatabase;
  let dbB: SQLiteDatabase;
  let ioA: PhotoIO;
  let ioB: PhotoIO;
  let dirB: string;
  const spotS = makeSpot('Courthouse rail');
  const listL = makeList('Downtown');
  let mediaM: string;

  beforeAll(async () => {
    rider = await createRider(uniqueUsername('two'));
    riders.push({ email: rider.email, userId: rider.userId });
    clientB = await signInAgain(rider.email);
    const dirA = mkdtempSync(join(tmpdir(), 'hl-sync-a-'));
    dirB = mkdtempSync(join(tmpdir(), 'hl-sync-b-'));
    tempDirs.push(dirA, dirB);
    ioA = nodePhotoIO(dirA);
    ioB = nodePhotoIO(dirB);
    dbA = await createMigratedTestDb();
    dbB = await createMigratedTestDb();
    expect(await adopt(dbA, rider.userId)).toBe('done');
    expect(await adopt(dbB, rider.userId)).toBe('done');
  });

  it('holds two separate sessions of the same rider', async () => {
    const [a, b] = await Promise.all([rider.client.auth.getSession(), clientB.auth.getSession()]);
    expect(a.data.session?.user.id).toBe(rider.userId);
    expect(b.data.session?.user.id).toBe(rider.userId);
    expect(a.data.session?.access_token).not.toBe(b.data.session?.access_token);
  });

  it("A's new spot, its photo and a list holding it reach B", async () => {
    await insertSpot(dbA, { ...spotS, owner_id: rider.userId });
    mediaM = await addPhoto(dbA, spotS.id, ioA);
    await insertHitList(dbA, { ...listL, owner_id: rider.userId });
    await addSpotsToList(dbA, listL.id, [spotS.id]);
    await sync(dbA, rider.client, rider.userId, ioA);

    await sync(dbB, clientB, rider.userId, ioB);

    const spot = (await getSpots(dbB)).find((s) => s.id === spotS.id);
    expect(spot).toMatchObject({
      name: 'Courthouse rail',
      owner_id: rider.userId,
      feature_types: [FeatureType.Rail, FeatureType.Ledge],
      stopped: true,
      natural_speed: 0,
    });
    const media = await getMediaForSpot(dbB, spotS.id);
    expect(media.map((m) => m.id)).toEqual([mediaM]);
    expect(media[0].owner_id).toBe(rider.userId);
    expect(new Uint8Array(readFileSync(join(dirB, media[0].file_path)))).toEqual(FIXTURE);
    expect(await serverBytes(clientB, storagePath(rider.userId, { id: mediaM, spot_id: spotS.id }))).toEqual(FIXTURE);
    expect((await getHitLists(dbB)).map((l) => [l.id, l.name, l.owner_id])).toEqual([
      [listL.id, 'Downtown', rider.userId],
    ]);
    expect((await getListMemberships(dbB))[spotS.id]).toEqual([listL.id]);
  });

  it("A's rename reaches B", async () => {
    await updateSpot(dbA, spotS.id, { name: 'Courthouse handrail' });
    await sync(dbA, rider.client, rider.userId, ioA);
    await sync(dbB, clientB, rider.userId, ioB);
    expect((await getSpot(dbB, spotS.id))?.name).toBe('Courthouse handrail');
  });

  it("A's delete reaches B, and the spot keeps its place in the list", async () => {
    await softDeleteSpot(dbA, spotS.id);
    await sync(dbA, rider.client, rider.userId, ioA);
    await sync(dbB, clientB, rider.userId, ioB);
    expect(await deletedAt(dbB, spotS.id)).toEqual(expect.any(String));
    expect(await getSpot(dbB, spotS.id)).toBeNull();
    const rows = await dbB.getAllAsync('SELECT list_id FROM hit_list_spots WHERE spot_id = ?', spotS.id);
    expect(rows).toEqual([{ list_id: listL.id }]);
  });

  describe('offline edits on both phones', () => {
    const spotT = makeSpot('Library ledge');
    const spotU = makeSpot('Plaza bank');
    const spotW = makeSpot('Loading dock');

    beforeAll(async () => {
      await insertSpot(dbA, { ...spotT, owner_id: rider.userId });
      await insertSpot(dbA, { ...spotU, owner_id: rider.userId });
      await insertSpot(dbA, { ...spotW, owner_id: rider.userId });
      await sync(dbA, rider.client, rider.userId, ioA);
      await sync(dbB, clientB, rider.userId, ioB);
      expect((await getSpot(dbB, spotT.id))?.name).toBe('Library ledge');
    });

    it('converge on the later edit (B edited last, A pushed first)', async () => {
      const t = now();
      await updateSpot(dbA, spotT.id, { notes: 'A: waxed it', updated_at: t });
      await updateSpot(dbB, spotT.id, { notes: 'B: security at 9', updated_at: later(t, 1000) });

      await pushAll(dbA, rider.client, rider.userId, ioA);
      await pushAll(dbB, clientB, rider.userId, ioB);
      await pullAll(dbA, rider.client, rider.userId);
      await pullAll(dbB, clientB, rider.userId);

      expect((await getSpot(dbA, spotT.id))?.notes).toBe('B: security at 9');
      expect((await getSpot(dbB, spotT.id))?.notes).toBe('B: security at 9');
      expect(await countPending(dbA)).toBe(0);
      expect(await countPending(dbB)).toBe(0);
    });

    it('converge on the later edit when the later one reaches the server first', async () => {
      const t = now();
      await updateSpot(dbA, spotU.id, { notes: 'A: rough run-up', updated_at: t });
      await updateSpot(dbB, spotU.id, { notes: 'B: kicker fixed', updated_at: later(t, 1000) });

      await pushAll(dbB, clientB, rider.userId, ioB);
      // The server keeps B's later edit: A's older one is accepted and skipped (skip_stale_update), not an error.
      await pushAll(dbA, rider.client, rider.userId, ioA);
      await pullAll(dbA, rider.client, rider.userId);
      await pullAll(dbB, clientB, rider.userId);

      expect((await getSpot(dbA, spotU.id))?.notes).toBe('B: kicker fixed');
      expect((await getSpot(dbB, spotU.id))?.notes).toBe('B: kicker fixed');
      expect(await countPending(dbA)).toBe(0);
      expect(await countPending(dbB)).toBe(0);
    });

    it("a pull never overwrites the phone's own later edit that hasn't been pushed yet", async () => {
      const t = now();
      await updateSpot(dbB, spotW.id, { notes: 'B: older', updated_at: t });
      await updateSpot(dbA, spotW.id, { notes: 'A: newer, still on the phone', updated_at: later(t, 1000) });

      await pushAll(dbB, clientB, rider.userId, ioB);
      await pullAll(dbA, rider.client, rider.userId);
      expect((await getSpot(dbA, spotW.id))?.notes).toBe('A: newer, still on the phone');
      expect(await countPending(dbA)).toBe(1);

      await sync(dbA, rider.client, rider.userId, ioA);
      await sync(dbB, clientB, rider.userId, ioB);
      expect((await getSpot(dbB, spotW.id))?.notes).toBe('A: newer, still on the phone');
    });

    it("A adding a spot to the list reaches B, and so does A taking it out", async () => {
      await addSpotsToList(dbA, listL.id, [spotT.id]);
      await sync(dbA, rider.client, rider.userId, ioA);
      await sync(dbB, clientB, rider.userId, ioB);
      expect((await getListMemberships(dbB))[spotT.id]).toEqual([listL.id]);

      await removeSpotFromList(dbA, listL.id, spotT.id);
      await sync(dbA, rider.client, rider.userId, ioA);
      await sync(dbB, clientB, rider.userId, ioB);
      expect((await getListMemberships(dbB))[spotT.id]).toBeUndefined();
      expect((await getSpot(dbB, spotT.id))?.name).toBe('Library ledge');
    });
  });
});

describe('one phone, two riders in turn', () => {
  let x: Rider;
  let y: Rider;
  let xClient: SupabaseClient;
  let dbP: SQLiteDatabase;
  const xSpots = [makeSpot('Bank to wall'), makeSpot('Kinked rail')];
  const ySpot = makeSpot('Y rail');
  const xPhotos: { spotId: string; mediaId: string; filePath: string }[] = [];

  const fileOnP = (filePath: string) => fakeFs.__fileBytes(resolvePhotoUri(filePath));

  beforeAll(async () => {
    fakeFs.__resetFs();
    x = await createRider(uniqueUsername('ridx'));
    xClient = x.client;
    riders.push({ email: x.email, userId: x.userId });
    y = await createRider(uniqueUsername('ridy'));
    riders.push({ email: y.email, userId: y.userId });

    // Y's one spot comes from Y's own phone.
    const dbY = await createMigratedTestDb();
    const dirY = mkdtempSync(join(tmpdir(), 'hl-sync-y-'));
    tempDirs.push(dirY);
    expect(await adopt(dbY, y.userId)).toBe('done');
    await insertSpot(dbY, { ...ySpot, owner_id: y.userId });
    await sync(dbY, y.client, y.userId, nodePhotoIO(dirY));

    dbP = await createMigratedTestDb();
  });

  it("X's phone-only spots and photos are adopted and backed up", async () => {
    for (const spot of xSpots) {
      await insertSpot(dbP, spot);
      const mediaId = await addPhoto(dbP, spot.id, appPhotoIO);
      xPhotos.push({ spotId: spot.id, mediaId, filePath: `photos/${spot.id}/${mediaId}.jpg` });
    }
    expect(await adopt(dbP, x.userId)).toBe('done');
    await sync(dbP, xClient, x.userId, appPhotoIO);

    expect((await getSpots(dbP)).map((s) => s.owner_id)).toEqual([x.userId, x.userId]);
    for (const photo of xPhotos) {
      expect(await serverBytes(xClient, storagePath(x.userId, { id: photo.mediaId, spot_id: photo.spotId }))).toEqual(
        FIXTURE,
      );
    }
  });

  it('signing out with Keep leaves them on the phone', async () => {
    // Keep = signOutOfAccount alone (src/sync/auth.ts), which is the client's signOut.
    const { error } = await xClient.auth.signOut();
    expect(error).toBeNull();
    expect((await getSpots(dbP)).map((s) => s.id).sort()).toEqual(xSpots.map((s) => s.id).sort());
    for (const photo of xPhotos) expect(fileOnP(photo.filePath)).toEqual(FIXTURE);
    expect(await getSyncState(dbP, 'user_id')).toBe(x.userId);
  });

  it("Y signing in removes X's rows and photo files, and Y's pull brings Y's spot", async () => {
    expect(await adopt(dbP, y.userId)).toBe('done');
    for (const table of ['spots', 'media', 'hit_lists', 'hit_list_spots'] as const) {
      expect(await allIds(dbP, table)).toEqual([]);
    }
    for (const photo of xPhotos) expect(fileOnP(photo.filePath)).toBeUndefined();
    expect(await getCursor(dbP, 'spots')).toBe(0);

    await sync(dbP, y.client, y.userId, appPhotoIO);
    expect((await getSpots(dbP)).map((s) => [s.id, s.name, s.owner_id])).toEqual([[ySpot.id, 'Y rail', y.userId]]);
  });

  it("X signing back in removes Y's rows and brings X's spots and photos back, byte for byte", async () => {
    const { error } = await y.client.auth.signOut();
    expect(error).toBeNull();
    xClient = await signInAgain(x.email);

    expect(await adopt(dbP, x.userId)).toBe('done');
    expect(await allIds(dbP, 'spots')).toEqual([]);
    expect(await allIds(dbP, 'media')).toEqual([]);
    for (const photo of xPhotos) expect(fileOnP(photo.filePath)).toBeUndefined();
    expect(await sync(dbP, xClient, x.userId, appPhotoIO)).toBe(2);

    const spots = await getSpots(dbP);
    expect(spots.map((s) => s.id).sort()).toEqual(xSpots.map((s) => s.id).sort());
    expect(spots.every((s) => s.owner_id === x.userId)).toBe(true);
    for (const photo of xPhotos) {
      const media = await getMediaForSpot(dbP, photo.spotId);
      expect(media.map((m) => [m.id, m.file_path])).toEqual([[photo.mediaId, photo.filePath]]);
      expect(fileOnP(photo.filePath)).toEqual(FIXTURE);
    }
  });
});
