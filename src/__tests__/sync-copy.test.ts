import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';
import { fakeFs } from './helpers/fake-fs';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
import { createTestMedia, createTestSpot } from './factories';

import { getMediaForSpot, getSpot, getSpots, insertMedia, insertSpot } from '@/src/db';
import { upsertProfiles } from '@/src/db/profiles';
import { saveCopy } from '@/src/sync/copy';
import { useSpotsStore } from '@/src/stores';
import { FeatureType } from '@/src/types';

const ANA = 'rider-ana';
const DOC = 'file:///data/Documents/';
const CACHE = 'file:///data/Caches/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let db: SQLiteDatabase;
let fake: FakeSupabase;
const client = () => fake as unknown as SupabaseClient;

const anas = createTestSpot({
  id: 'anas-ledge',
  name: 'Courthouse ledge',
  generated_name: 'Capitol Hill',
  owner_id: ANA,
  feature_types: [FeatureType.Ledge, FeatureType.Rail],
  stopped: true,
  natural_speed: 0,
  notes: 'Security after 6',
  location: { latitude: 47.62, longitude: -122.31 },
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-02T10:00:00.000Z',
});
const first = createTestMedia({
  id: 'p1',
  spot_id: anas.id,
  file_path: `cache/photos/${anas.id}/p1.jpg`,
  captured_at: '2026-09-01',
  created_at: '2026-09-01T10:00:00.000Z',
});
const second = createTestMedia({
  id: 'p2',
  spot_id: anas.id,
  file_path: `cache/photos/${anas.id}/p2.jpg`,
  created_at: '2026-09-01T10:01:00.000Z',
});
const BYTES1 = new Uint8Array([1, 1]);
const BYTES2 = new Uint8Array([2, 2]);

beforeEach(async () => {
  fakeFs.__resetFs();
  db = await createMigratedTestDb();
  await adoptPhoneFor(db);
  fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  await upsertProfiles(db, [{ id: ANA, username: 'ana', display_name: null }]);
  // others' rows arrive by pull: owned by ana, so no trigger queues them here
  await insertSpot(db, { ...anas, primary_photo_id: second.id });
  await insertMedia(db, first);
  await insertMedia(db, second);
  fakeFs.__putFile(`${CACHE}photos/${anas.id}/p1.jpg`, BYTES1);
  fake.objects.set(`photos/${ANA}/${anas.id}/p2.jpg`, BYTES2);
  useSpotsStore.setState({ spots: [] });
});

describe('saveCopy (S8, D47/D89): another rider\'s spot becomes the rider\'s own private spot', () => {
  it('inserts an owned copy From @ana with the same name, tags, speed, notes, place and town, queued for backup', async () => {
    const result = await saveCopy(db, client(), ME, anas.id);

    expect(result.spotId).toMatch(UUID);
    expect(result.missingPhotos).toBe(0);
    const copy = await getSpot(db, result.spotId);
    expect(copy).toMatchObject({
      owner_id: ME,
      from_username: 'ana',
      name: 'Courthouse ledge',
      generated_name: 'Capitol Hill',
      feature_types: [FeatureType.Ledge, FeatureType.Rail],
      stopped: true,
      natural_speed: 0,
      notes: 'Security after 6',
      location: anas.location,
    });
    expect(copy?.copied_from_send).toBeUndefined();
    expect(copy?.created_at).not.toBe(anas.created_at);
    const ops = await outboxOps(db);
    expect(ops.filter(([, id]) => id === result.spotId)).toEqual([['spot', result.spotId, 'upsert']]);
    expect(ops.filter(([entity]) => entity === 'media')).toHaveLength(2);
    // ana's spot is untouched, and the stores show the copy
    expect(await getSpot(db, anas.id)).toMatchObject({ owner_id: ANA, name: 'Courthouse ledge' });
    expect(useSpotsStore.getState().spots.map((s) => s.id).sort()).toEqual(
      (await getSpots(db)).map((s) => s.id).sort(),
    );
  });

  it('copies each cached photo into Paths.document/photos/<newId>/ as owned media (downloading a missing one first), primary mapped', async () => {
    const { spotId } = await saveCopy(db, client(), ME, anas.id);

    const media = await getMediaForSpot(db, spotId);
    expect(media).toHaveLength(2);
    for (const m of media) {
      expect(m.id).toMatch(UUID);
      expect(m.owner_id).toBe(ME);
      expect(m.file_path).toBe(`photos/${spotId}/${m.id}.jpg`);
    }
    expect(media.map((m) => fakeFs.__fileBytes(`${DOC}${m.file_path}`))).toEqual([BYTES1, BYTES2]);
    expect(media[0].captured_at).toBe('2026-09-01');
    expect((await getSpot(db, spotId))?.primary_photo_id).toBe(media[1].id);
    // the download landed in the cache, never in Documents under ana's spot
    expect(fakeFs.__fileBytes(`${CACHE}photos/${anas.id}/p2.jpg`)).toEqual(BYTES2);
    expect(fakeFs.__fileExists(`${DOC}photos/${anas.id}/p2.jpg`)).toBe(false);
  });

  it('a photo that cannot be downloaded is left out and counted (missingPhotos: 1); the primary is cleared', async () => {
    fake.objects.clear();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { spotId, missingPhotos } = await saveCopy(db, client(), ME, anas.id);

    expect(missingPhotos).toBe(1);
    const media = await getMediaForSpot(db, spotId);
    expect(media).toHaveLength(1);
    expect(fakeFs.__fileBytes(`${DOC}${media[0].file_path}`)).toEqual(BYTES1);
    expect((await getSpot(db, spotId))?.primary_photo_id).toBeUndefined();
    warn.mockRestore();
  });

  it("refuses the rider's own spot or one that isn't here, writing nothing", async () => {
    await insertSpot(db, createTestSpot({ id: 'mine', owner_id: ME }));
    const before = await outboxOps(db);
    await expect(saveCopy(db, client(), ME, 'mine')).rejects.toThrow("not another rider's spot");
    await expect(saveCopy(db, client(), ME, 'gone')).rejects.toThrow("not another rider's spot");
    expect(await outboxOps(db)).toEqual(before);
  });
});
