import type { SQLiteDatabase } from 'expo-sqlite';
import type { UserSettings } from '@/src/types';
import { DEFAULT_USER_SETTINGS } from '@/src/types';

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM user_settings WHERE key = ?`,
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)`,
    key,
    value,
  );
}

/** The saved settings over the defaults. Keys an older build saved (e.g. `gear`, D22) are dropped. */
export async function getUserSettings(db: SQLiteDatabase): Promise<UserSettings> {
  const raw = await getSetting(db, 'user_settings');
  try {
    const { units, batch_import_radius } = { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw ?? 'null') } as UserSettings;
    return { units, batch_import_radius };
  } catch {
    return { ...DEFAULT_USER_SETTINGS }; // corrupt blob
  }
}

export async function saveUserSettings(db: SQLiteDatabase, settings: UserSettings): Promise<void> {
  await setSetting(db, 'user_settings', JSON.stringify(settings));
}
