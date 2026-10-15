import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { getUserSettings, saveUserSettings, setSetting } from '@/src/db';
import { DEFAULT_USER_SETTINGS, GearItem, UnitSystem } from '@/src/types';

describe('user settings against real SQLite', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = await createMigratedTestDb();
  });

  it('returns defaults on an empty DB', async () => {
    expect(await getUserSettings(db)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('round-trips saved settings', async () => {
    const s = { units: UnitSystem.Metric, batch_import_radius: 120, gear: [GearItem.Winch] };

    await saveUserSettings(db, s);

    expect(await getUserSettings(db)).toEqual(s);
  });

  it('fills keys missing from an older saved blob with defaults', async () => {
    await setSetting(db, 'user_settings', JSON.stringify({ units: UnitSystem.Metric }));

    expect(await getUserSettings(db)).toEqual({ ...DEFAULT_USER_SETTINGS, units: UnitSystem.Metric });
  });

  it('falls back to defaults when the saved blob is not valid JSON', async () => {
    await setSetting(db, 'user_settings', '{not json');

    expect(await getUserSettings(db)).toEqual(DEFAULT_USER_SETTINGS);
  });
});
