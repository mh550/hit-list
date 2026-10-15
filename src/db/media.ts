import type { SQLiteDatabase } from 'expo-sqlite';
import type { Media, GeoPoint } from '@/src/types';

interface MediaRow {
  id: string;
  spot_id: string;
  file_path: string;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

function rowToMedia(row: MediaRow): Media {
  const media: Media = {
    id: row.id,
    spot_id: row.spot_id,
    file_path: row.file_path,
    captured_at: row.captured_at ?? undefined,
    created_at: row.created_at,
  };
  if (row.latitude != null && row.longitude != null) {
    media.location = { latitude: row.latitude, longitude: row.longitude } as GeoPoint;
  }
  return media;
}

export async function insertMedia(db: SQLiteDatabase, media: Media): Promise<void> {
  await db.runAsync(
    `INSERT INTO media (id, spot_id, file_path, captured_at, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    media.id,
    media.spot_id,
    media.file_path,
    media.captured_at ?? null,
    media.location?.latitude ?? null,
    media.location?.longitude ?? null,
    media.created_at,
  );
}

export async function getMediaForSpot(db: SQLiteDatabase, spotId: string): Promise<Media[]> {
  const rows = await db.getAllAsync<MediaRow>(
    `SELECT * FROM media WHERE spot_id = ? ORDER BY created_at ASC`,
    spotId,
  );
  return rows.map(rowToMedia);
}

/** Every media row, grouped by spot and in capture order within a spot (hydrates the media store). */
export async function getAllMedia(db: SQLiteDatabase): Promise<Media[]> {
  const rows = await db.getAllAsync<MediaRow>(
    `SELECT * FROM media ORDER BY spot_id, created_at ASC`,
  );
  return rows.map(rowToMedia);
}

export async function deleteMedia(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM media WHERE id = ?`, id);
}
