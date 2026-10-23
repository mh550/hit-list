import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getMediaForSpot, getSpot, insertMedia, insertSpot } from '@/src/db';
import type { Media, Spot } from '@/src/types';
import { newId } from '@/src/utils/id';
import { isForeign } from '@/src/utils/ownership';
import { photoFolder, photoRelativePath, resolvePhotoUri } from '@/src/utils/photo-storage';
import { errorMessage } from './errors';
import { cachedPhotoUri, defaultPhotoIO, type PhotoIO } from './photos';
import { reloadStoresQuietly } from './reload';

/** What Save a copy needs of the files: the cache download (PhotoIO) and a copy into Paths.document. */
export interface CopyIO extends Pick<PhotoIO, 'exists' | 'write' | 'remove'> {
  /** Copies one media file_path to another, making the target's folder. */
  copy(fromPath: string, toPath: string): Promise<void>;
}

export const defaultCopyIO: CopyIO = {
  ...defaultPhotoIO,
  async copy(fromPath, toPath) {
    photoFolder(toPath).create({ intermediates: true, idempotent: true });
    await new File(resolvePhotoUri(fromPath)).copy(new File(resolvePhotoUri(toPath)));
  },
};

export interface CopyResult {
  spotId: string;
  /** Photos left out because they could not be downloaded (D89). */
  missingPhotos: number;
}

/**
 * Save a copy (S8, D47, D89): another rider's spot becomes the rider's own private spot. Its photos are downloaded
 * into the cache first where missing (cachedPhotoUri), then copied to `photos/<newId>/<newMediaId>.jpg`; one that
 * can't be downloaded is left out and counted. The copy keeps the name, town, tags, speed, notes and place, gets
 * fresh ids and timestamps, `uid` as owner and the owner's @username as `from_username`, and is written through
 * src/db so the triggers queue its backup. Then the stores reload. Rejects for a spot that isn't another rider's.
 */
export async function saveCopy(
  db: SQLiteDatabase,
  client: SupabaseClient | null,
  uid: string,
  spotId: string,
  io: CopyIO = defaultCopyIO,
): Promise<CopyResult> {
  const source = await getSpot(db, spotId);
  if (!source || !isForeign(source, uid)) throw new Error("not another rider's spot");

  const id = newId();
  const now = new Date().toISOString();
  const photos: Media[] = [];
  let missingPhotos = 0;
  let primary: string | undefined;
  for (const media of await getMediaForSpot(db, spotId)) {
    const copy: Media = {
      id: newId(),
      spot_id: id,
      file_path: '',
      captured_at: media.captured_at,
      location: media.location,
      created_at: media.created_at,
    };
    copy.file_path = photoRelativePath(id, copy.id);
    try {
      await cachedPhotoUri(client, media, io);
      await io.copy(media.file_path, copy.file_path);
    } catch (err) {
      missingPhotos += 1;
      console.warn(`[copy] could not copy photo ${media.id}:`, errorMessage(err));
      continue;
    }
    photos.push(copy);
    if (media.id === source.primary_photo_id) primary = copy.id;
  }

  const spot: Spot = {
    id,
    name: source.name,
    generated_name: source.generated_name,
    location: source.location,
    created_at: now,
    updated_at: now,
    feature_types: source.feature_types,
    stopped: source.stopped,
    natural_speed: source.natural_speed,
    notes: source.notes,
    primary_photo_id: primary,
    owner_id: uid,
    from_username: source.owner_username,
  };
  let inserted = 0;
  try {
    await insertSpot(db, spot);
    for (const photo of photos) {
      await insertMedia(db, photo);
      inserted += 1;
    }
  } catch (err) {
    // the files no row points at
    for (const photo of photos.slice(inserted)) io.remove(photo.file_path);
    throw err;
  }
  await reloadStoresQuietly(db);
  return { spotId: id, missingPhotos };
}
