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
  uploaded_by: string | null;
  owner_id: string | null;
}

const MEDIA_COLUMNS = 'id, spot_id, file_path, captured_at, latitude, longitude, created_at, uploaded_by, owner_id';

function rowToMedia(row: MediaRow): Media {
  const media: Media = {
    id: row.id,
    spot_id: row.spot_id,
    file_path: row.file_path,
    captured_at: row.captured_at ?? undefined,
    created_at: row.created_at,
    uploaded_by: row.uploaded_by ?? undefined,
    owner_id: row.owner_id ?? undefined,
  };
  if (row.latitude != null && row.longitude != null) {
    media.location = { latitude: row.latitude, longitude: row.longitude } as GeoPoint;
  }
  return media;
}

/**
 * A photo belongs to its spot's owner (also while signed out after Keep), so `media.owner_id` is ignored here. Its
 * updated_at starts as created_at; an owned photo gets its outbox row from migration 5's trigger.
 */
export async function insertMedia(db: SQLiteDatabase, media: Media): Promise<void> {
  await db.runAsync(
    `INSERT INTO media (id, spot_id, file_path, captured_at, latitude, longitude, created_at, updated_at, uploaded_by, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT owner_id FROM spots WHERE id = ?))`,
    media.id,
    media.spot_id,
    media.file_path,
    media.captured_at ?? null,
    media.location?.latitude ?? null,
    media.location?.longitude ?? null,
    media.created_at,
    media.created_at,
    media.uploaded_by ?? null,
    media.spot_id,
  );
}

/** A spot's live photos, oldest first. */
export async function getMediaForSpot(db: SQLiteDatabase, spotId: string): Promise<Media[]> {
  const rows = await db.getAllAsync<MediaRow>(
    `SELECT ${MEDIA_COLUMNS} FROM media WHERE spot_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
    spotId,
  );
  return rows.map(rowToMedia);
}

/** Every live media row, oldest first (hydrates the media store, which groups by spot). */
export async function getAllMedia(db: SQLiteDatabase): Promise<Media[]> {
  const rows = await db.getAllAsync<MediaRow>(
    `SELECT ${MEDIA_COLUMNS} FROM media WHERE deleted_at IS NULL ORDER BY created_at ASC`,
  );
  return rows.map(rowToMedia);
}

/**
 * Removes a photo: a soft delete (`deleted_at` = `updated_at` = `at`) so the removal can sync; the file stays (D3).
 * Removing it again changes nothing.
 */
export async function deleteMedia(
  db: SQLiteDatabase,
  id: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync('UPDATE media SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', at, at, id);
}
