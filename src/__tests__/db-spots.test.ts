import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpot, getSpots, getSpotLegacy, updateSpot, softDeleteSpot } from '@/src/db';
import { upsertProfiles } from '@/src/db/profiles';
import { FeatureType } from '@/src/types';
import { createTestSpot } from './factories';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';

describe('spots against real SQLite', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = await createMigratedTestDb();
  });

  it('migrateDb → insertSpot → getSpots round-trips a spot', async () => {
    const spot = createTestSpot({ name: 'Ledge at Pier 57' });

    await insertSpot(db, spot);

    expect(await getSpots(db)).toEqual([spot]);
  });

  it('reads a spot whose feature_types_json is unreadable as untagged instead of failing the whole list', async () => {
    // getSpots throwing would open the app writable with an empty list, as if every spot had gone.
    const bad = createTestSpot({ name: 'bad row', feature_types: [FeatureType.Rail] });
    const good = createTestSpot({ name: 'good row' });
    await insertSpot(db, bad);
    await insertSpot(db, good);
    await db.runAsync("UPDATE spots SET feature_types_json = 'x' WHERE id = ?", bad.id);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const spots = await getSpots(db);

    expect(spots.map((s) => s.name).sort()).toEqual(['bad row', 'good row']);
    expect(spots.find((s) => s.id === bad.id)?.feature_types).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('lists newest first and excludes soft-deleted spots', async () => {
    const older = createTestSpot({ created_at: '2026-10-13T10:00:00.000Z' });
    const newer = createTestSpot({ created_at: '2026-10-13T12:00:00.000Z' });
    const gone = createTestSpot({ created_at: '2026-10-13T11:00:00.000Z' });
    for (const s of [older, newer, gone]) await insertSpot(db, s);
    await softDeleteSpot(db, gone.id);

    expect((await getSpots(db)).map((s) => s.id)).toEqual([newer.id, older.id]);
  });

  it('getSpot returns null for a soft-deleted spot', async () => {
    const s = createTestSpot();
    await insertSpot(db, s);
    await softDeleteSpot(db, s.id);

    expect(await getSpot(db, s.id)).toBeNull();
  });

  it('round-trips feature_types, stopped, natural_speed and notes', async () => {
    const s = createTestSpot({
      feature_types: [FeatureType.Rail, FeatureType.Ledge],
      stopped: true,
      natural_speed: 0, // None is a real rating: it must not come back as unset
      notes: 'kinked, wax it',
    });

    await insertSpot(db, s);

    const read = await getSpot(db, s.id);
    expect(read).toEqual(s);
    expect(read?.natural_speed).toBe(0);
  });

  it('a spot saved without tags reads back untagged: [] / false / unset', async () => {
    const s = createTestSpot();
    await insertSpot(db, s);

    const read = await getSpot(db, s.id);
    expect(read).toMatchObject({ feature_types: [], stopped: false });
    expect(read?.natural_speed).toBeUndefined();
    expect(read?.notes).toBeUndefined();
  });

  it('partial updateSpot leaves the other columns intact', async () => {
    const s = createTestSpot({
      feature_types: [FeatureType.Rail],
      stopped: true,
      natural_speed: 2,
      notes: 'kinked',
    });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { name: 'Kinked rail' });

    expect(await getSpot(db, s.id)).toMatchObject({
      name: 'Kinked rail',
      feature_types: [FeatureType.Rail],
      stopped: true,
      natural_speed: 2,
      notes: 'kinked',
    });
  });

  it('updateSpot writes feature_types, stopped, natural_speed 0 and notes', async () => {
    const s = createTestSpot({ feature_types: [FeatureType.Rail], stopped: true, natural_speed: 4 });
    await insertSpot(db, s);

    await updateSpot(db, s.id, {
      feature_types: [FeatureType.Bank, FeatureType.Hip],
      stopped: false,
      natural_speed: 0,
      notes: 'icy',
    });

    expect(await getSpot(db, s.id)).toMatchObject({
      feature_types: [FeatureType.Bank, FeatureType.Hip],
      stopped: false,
      natural_speed: 0,
      notes: 'icy',
    });
  });

  it('updateSpot with natural_speed: null and notes: null clears them', async () => {
    const s = createTestSpot({ natural_speed: 3, notes: 'hello', feature_types: [FeatureType.Gap] });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { natural_speed: null, notes: null });

    const read = await getSpot(db, s.id);
    expect(read?.natural_speed).toBeUndefined();
    expect(read?.notes).toBeUndefined();
    expect(read?.feature_types).toEqual([FeatureType.Gap]);
    expect(
      await db.getFirstAsync('SELECT natural_speed, notes FROM spots WHERE id = ?', s.id),
    ).toEqual({ natural_speed: null, notes: null });
  });

  it('round-trips quotes, dashes and emoji in text fields', async () => {
    const name = `O'Brien's "kink" rail — Pier 57 🛹`;
    const s = createTestSpot({ name, notes: `it's "fine"; DROP TABLE spots; --` });

    await insertSpot(db, s);

    expect(await getSpot(db, s.id)).toEqual(s);
  });

  it('updateSpot with name: null clears the stored name and leaves other columns alone', async () => {
    // Clearing the name in Edit must persist; undefined means "leave the column alone", so only null clears it.
    const s = createTestSpot({
      name: 'Pier 57 rail',
      generated_name: 'Seattle',
      feature_types: [FeatureType.Rail],
      notes: 'kinked',
    });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { name: null });

    const { name, updated_at: _updatedAt, ...rest } = s; // updateSpot rewrites updated_at itself
    expect(name).toBe('Pier 57 rail');
    const read = await getSpot(db, s.id);
    expect(read?.name ?? null).toBeNull();
    expect(read).toMatchObject(rest);
  });

  it("reads another rider's spot with its owner's @username from the profiles mirror (S8), never storing it", async () => {
    await upsertProfiles(db, [{ id: 'u-ana', username: 'ana', display_name: null }]);
    await insertSpot(db, createTestSpot({ id: 'anas', owner_id: 'u-ana' }));
    await insertSpot(db, createTestSpot({ id: 'bens', owner_id: 'u-ben' }));
    await insertSpot(db, createTestSpot({ id: 'phone' }));

    expect((await getSpot(db, 'anas'))?.owner_username).toBe('ana');
    const byId = Object.fromEntries((await getSpots(db)).map((s) => [s.id, s]));
    expect(byId.anas.owner_username).toBe('ana');
    expect(byId.bens.owner_username).toBeUndefined();
    expect(byId.phone.owner_username).toBeUndefined();
    expect('owner_username' in byId.phone).toBe(false);
  });

  describe('getSpotLegacy', () => {
    it('returns null for a spot saved since migration 3', async () => {
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);

      expect(await getSpotLegacy(db, s.id)).toBeNull();
    });

    it('returns null for an unknown id', async () => {
      expect(await getSpotLegacy(db, 'no-such-spot')).toBeNull();
    });

    it('returns the archived object for a migrated spot, which getSpot never carries', async () => {
      // Migration 3 writes legacy_json (db-migrate.test.ts runs it on v2 rows); here the column is set directly.
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);
      await db.runAsync(
        'UPDATE spots SET legacy_json = ? WHERE id = ?',
        '{"material":"steel","landing_surface":"snow_built"}',
        s.id,
      );

      expect(await getSpotLegacy(db, s.id)).toEqual({ material: 'steel', landing_surface: 'snow_built' });
      expect(await getSpot(db, s.id)).toEqual(s);
    });

    it('rejects when the archive is not JSON, so the detail screen can warn and skip Older details', async () => {
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);
      await db.runAsync('UPDATE spots SET legacy_json = ? WHERE id = ?', '{"material":', s.id);

      await expect(getSpotLegacy(db, s.id)).rejects.toThrow(SyntaxError);
    });

    it.each(['"oops"', '[1,2]', '3', 'null'])('returns null for an archive that is JSON but not an object (%s)', async (json) => {
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);
      await db.runAsync('UPDATE spots SET legacy_json = ? WHERE id = ?', json, s.id);

      expect(await getSpotLegacy(db, s.id)).toBeNull();
    });
  });

  describe('timestamps are ISO 8601 UTC', () => {
    const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const NOW = new Date('2026-10-15T12:34:56.789Z');

    // Fake only Date so promises, timers and node:sqlite keep working; datetime('now') ignores it (real clock).
    beforeEach(() => {
      jest.useFakeTimers({
        now: NOW,
        doNotFake: [
          'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
          'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
          'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        ],
      });
    });
    afterEach(() => jest.useRealTimers());

    it('updateSpot stores the updated_at the caller passes', async () => {
      // The Edit screen stamps updated_at; the DB must keep that value, not replace it with its own clock.
      const s = createTestSpot();
      await insertSpot(db, s);

      await updateSpot(db, s.id, { name: 'x', updated_at: '2026-10-15T12:00:00.000Z' });

      expect((await getSpot(db, s.id))?.updated_at).toBe('2026-10-15T12:00:00.000Z');
    });

    it('updateSpot without updated_at stamps now as ISO 8601 UTC', async () => {
      // datetime('now') gives "2026-10-15 12:34:56" (no T, no Z), which Hermes may misparse; use toISOString().
      const s = createTestSpot();
      await insertSpot(db, s);

      await updateSpot(db, s.id, { name: 'x' });

      const stored = (await getSpot(db, s.id))?.updated_at ?? '';
      expect(stored).toMatch(ISO_Z);
      expect(stored).toBe(NOW.toISOString()); // Date is faked, so exact; the real-clock datetime('now') cannot match
    });

    it('softDeleteSpot writes deleted_at and updated_at as the same ISO string', async () => {
      // Both columns must be ISO 8601 UTC like every other timestamp, and agree with each other.
      const s = createTestSpot();
      await insertSpot(db, s);

      await softDeleteSpot(db, s.id);

      const row = await db.getFirstAsync<{ deleted_at: string; updated_at: string }>(
        'SELECT deleted_at, updated_at FROM spots WHERE id = ?',
        s.id,
      );
      expect(row?.deleted_at).toMatch(ISO_Z);
      expect(row?.updated_at).toBe(row?.deleted_at);
      expect(row?.deleted_at).toBe(NOW.toISOString());
    });

    it('softDeleteSpot with an explicit at writes it to both columns', async () => {
      // The hook stamps one time and shares it with the store, so the DB must use the caller's value.
      const s = createTestSpot();
      await insertSpot(db, s);
      const at = '2026-10-15T09:00:00.000Z';

      await softDeleteSpot(db, s.id, at);

      const row = await db.getFirstAsync<{ deleted_at: string; updated_at: string }>(
        'SELECT deleted_at, updated_at FROM spots WHERE id = ?',
        s.id,
      );
      expect(row).toEqual({ deleted_at: at, updated_at: at });
    });
  });

  describe('outbox (migration 5 triggers)', () => {
    beforeEach(async () => {
      await adoptPhoneFor(db);
    });

    it("getSpots/getSpot return owner_id, undefined when it is NULL", async () => {
      const mine = createTestSpot({ owner_id: ME, created_at: '2026-10-13T12:00:00.000Z' });
      const loose = createTestSpot({ created_at: '2026-10-13T11:00:00.000Z' });
      await insertSpot(db, mine);
      await insertSpot(db, loose);

      const [a, b] = await getSpots(db);

      expect(a.owner_id).toBe(ME);
      expect(b.owner_id).toBeUndefined();
      expect((await getSpot(db, mine.id))?.owner_id).toBe(ME);
    });

    it('a received copy (S7) keeps copied_from_send and from_username, queues its upsert, and an edit keeps both', async () => {
      const copy = createTestSpot({ owner_id: ME, copied_from_send: 'send-1', from_username: 'Ana_B' });

      await insertSpot(db, copy);
      await updateSpot(db, copy.id, { name: 'renamed' });

      expect(await getSpots(db)).toEqual([expect.objectContaining({ copied_from_send: 'send-1', from_username: 'Ana_B', name: 'renamed' })]);
      expect(await getSpot(db, copy.id)).toMatchObject({ copied_from_send: 'send-1', from_username: 'Ana_B' });
      expect(await outboxOps(db)).toEqual([
        ['spot', copy.id, 'upsert'],
        ['spot', copy.id, 'upsert'],
      ]);
    });

    it('a spot of the rider\'s own reads both send fields as undefined', async () => {
      const own = createTestSpot({ owner_id: ME });
      await insertSpot(db, own);

      const [read] = await getSpots(db);

      expect(read.copied_from_send).toBeUndefined();
      expect(read.from_username).toBeUndefined();
    });

    it("insert, update and soft delete of an owned spot each append one row: upsert, upsert, delete", async () => {
      const s = createTestSpot({ owner_id: ME });

      await insertSpot(db, s);
      expect(await outboxOps(db)).toEqual([['spot', s.id, 'upsert']]);

      await updateSpot(db, s.id, { name: 'Pier rail' });
      expect(await outboxOps(db)).toEqual([
        ['spot', s.id, 'upsert'],
        ['spot', s.id, 'upsert'],
      ]);

      await softDeleteSpot(db, s.id);
      expect(await outboxOps(db)).toEqual([
        ['spot', s.id, 'upsert'],
        ['spot', s.id, 'upsert'],
        ['spot', s.id, 'delete'],
      ]);
    });

    it('a spot with no owner (phone-only) appends nothing, whatever is written', async () => {
      const s = createTestSpot();

      await insertSpot(db, s);
      await updateSpot(db, s.id, { notes: 'kinked' });
      await softDeleteSpot(db, s.id);

      expect(await outboxOps(db)).toEqual([]);
    });

    it("a spot owned by another rider (S8) appends nothing", async () => {
      const s = createTestSpot({ owner_id: 'someone-else' });

      await insertSpot(db, s);
      await updateSpot(db, s.id, { notes: 'kinked' });

      expect(await outboxOps(db)).toEqual([]);
    });

    it('with no account on the phone (sync_state has no user_id) an owned spot appends nothing', async () => {
      await db.runAsync("DELETE FROM sync_state WHERE key = 'user_id'");
      const s = createTestSpot({ owner_id: ME });

      await insertSpot(db, s);
      await updateSpot(db, s.id, { notes: 'x' });

      expect(await outboxOps(db)).toEqual([]);
    });

    it("writes that set rev (a pull) append nothing; a later local edit of the pulled row does", async () => {
      const s = createTestSpot({ owner_id: ME });
      await db.runAsync(
        `INSERT INTO spots (id, owner_id, rev, latitude, longitude, created_at, updated_at) VALUES (?, ?, 7, 1, 2, ?, ?)`,
        s.id,
        ME,
        s.created_at,
        s.updated_at,
      );
      await db.runAsync("UPDATE spots SET name = 'from the server', rev = 8 WHERE id = ?", s.id);
      expect(await outboxOps(db)).toEqual([]);

      await updateSpot(db, s.id, { name: 'renamed here' });

      expect(await outboxOps(db)).toEqual([['spot', s.id, 'upsert']]);
    });

    it('a failing insert (duplicate id) appends no row of its own', async () => {
      const s = createTestSpot({ owner_id: ME });
      await insertSpot(db, s);

      await expect(insertSpot(db, s)).rejects.toThrow();

      expect(await outboxOps(db)).toEqual([['spot', s.id, 'upsert']]);
    });

    it('the outbox row is part of the write: when it cannot be appended the edit is not saved either', async () => {
      const s = createTestSpot({ owner_id: ME, name: 'before' });
      await insertSpot(db, s);
      await db.execAsync('DROP TABLE sync_outbox');

      await expect(updateSpot(db, s.id, { name: 'after' })).rejects.toThrow(/sync_outbox/);

      expect((await getSpot(db, s.id))?.name).toBe('before');
    });

    it('updateSpot on an owned spot appends upsert even when only the town changes', async () => {
      const s = createTestSpot({ owner_id: ME });
      await insertSpot(db, s);

      await updateSpot(db, s.id, { generated_name: 'Belltown', updated_at: s.updated_at });

      expect(await outboxOps(db)).toEqual([
        ['spot', s.id, 'upsert'],
        ['spot', s.id, 'upsert'],
      ]);
    });

    it('deleting a spot twice queues one delete and keeps the first deleted_at', async () => {
      const s = createTestSpot({ owner_id: ME });
      await insertSpot(db, s);

      await softDeleteSpot(db, s.id, '2026-10-23T01:00:00.000Z');
      await softDeleteSpot(db, s.id, '2026-10-23T02:00:00.000Z');

      expect(await outboxOps(db)).toEqual([
        ['spot', s.id, 'upsert'],
        ['spot', s.id, 'delete'],
      ]);
      expect(await db.getFirstAsync('SELECT deleted_at, updated_at FROM spots WHERE id = ?', s.id)).toEqual({
        deleted_at: '2026-10-23T01:00:00.000Z',
        updated_at: '2026-10-23T01:00:00.000Z',
      });
    });
  });
});
