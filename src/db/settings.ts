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

export async function getUserSettings(db: SQLiteDatabase): Promise<UserSettings> {
  const raw = await getSetting(db, 'user_settings');
  if (!raw) return { ...DEFAULT_USER_SETTINGS };
  try {
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) } as UserSettings;
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export async function saveUserSettings(db: SQLiteDatabase, settings: UserSettings): Promise<void> {
  await setSetting(db, 'user_settings', JSON.stringify(settings));
}
