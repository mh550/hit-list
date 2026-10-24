import type { SupabaseClient } from '@supabase/supabase-js';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import type { Media } from '@/src/types';
import { photoFolder, resolvePhotoUri } from '@/src/utils/photo-storage';
import { errorMessage } from './errors';

/** Uploads are re-encoded (D46): the long edge at most this many px, JPEG at this quality. */
export const UPLOAD_MAX_EDGE = 2048;
export const UPLOAD_JPEG_QUALITY = 0.85;
export const PHOTOS_BUCKET = 'photos';

/**
 * How push reaches a media row's file. Injectable: Jest fakes it, the integration test (S5-07) reads with Node's fs.
 * Paths are `media.file_path` as stored (relative to Paths.document, or an absolute uri when the copy failed).
 */
export interface PhotoIO {
  exists(filePath: string): boolean;
  /** The upload copy (see preparePhoto); `cleanup` deletes it. */
  prepare(filePath: string): Promise<{ uri: string; bytes: Uint8Array; cleanup(): void }>;
  /** Writes a downloaded photo to a relative `photos/…` (or a cached `cache/photos/…`) path, making its folder. */
  write(filePath: string, bytes: Uint8Array): void;
  /** Deletes a file `write` made (a save that didn't go through, S7); one that isn't there is fine. */
  remove(filePath: string): void;
}

/*
 * A download that started before its photo's cache was deleted doesn't write a photo whose row may be gone. Bumped per
 * spot (a removal names its spots or files; every sync makes one, often of nothing) and for all at once (sign-out), so
 * only the downloads of what was removed are dropped (S8-09 review A#1).
 */
let cacheGeneration = 0;
const spotGenerations = new Map<string, number>();
const bumpSpot = (spotId: string) => spotGenerations.set(spotId, (spotGenerations.get(spotId) ?? 0) + 1);
const generationOf = (spotId: string) => `${cacheGeneration}/${spotGenerations.get(spotId) ?? 0}`;

/** Where another rider's photo is cached on this phone, as their media row's file_path (S8, §3.4: never Paths.document). */
export const cachedPhotoPath = (spotId: string, mediaId: string) => `cache/photos/${spotId}/${mediaId}.jpg`;

/**
 * Deletes each spot's cached photo folder (`Paths.cache/photos/<spotId>/`) once its rows left the phone (Leave, Stop
 * sharing, a pull that lost read). A folder that isn't there is skipped; one that can't be deleted warns.
 */
export function deleteCachedPhotos(spotIds: readonly string[]): void {
  for (const spotId of spotIds) {
    bumpSpot(spotId);
    try {
      const dir = new Directory(Paths.cache, 'photos', spotId);
      if (dir.exists) dir.delete();
    } catch (err) {
      console.warn(`[sync] could not delete the cached photos of ${spotId}:`, errorMessage(err));
    }
  }
}

/** Deletes the whole cache of others' photos (`Paths.cache/photos/`): sign-out (D86). One that can't go warns. */
export function deleteAllCachedPhotos(): void {
  cacheGeneration += 1;
  try {
    const dir = new Directory(Paths.cache, 'photos');
    if (dir.exists) dir.delete();
  } catch (err) {
    console.warn('[sync] could not delete the cached photos:', errorMessage(err));
  }
}

/** Deletes single cached photos (`cache/photos/…` file paths) of rows a pull removed; others' paths are ignored. */
export function deleteCachedFiles(filePaths: readonly string[]): void {
  for (const filePath of filePaths) {
    if (!filePath.startsWith('cache/')) continue;
    // cache/photos/<spot>/<media>.jpg
    const spotId = filePath.split('/')[2];
    if (spotId) bumpSpot(spotId);
    try {
      const file = new File(Paths.cache, filePath.slice('cache/'.length));
      if (file.exists) file.delete();
    } catch (err) {
      console.warn(`[sync] could not delete the cached photo ${filePath}:`, errorMessage(err));
    }
  }
}

/** Where a photo lives in the bucket; always derived, local media has no storage_path column. */
export const storagePath = (owner: string, media: Pick<Media, 'id' | 'spot_id'>) =>
  `${owner}/${media.spot_id}/${media.id}.jpg`;

/**
 * Re-encodes a photo for upload into a new file in the cache directory (where the manipulator saves) and reads its
 * bytes. The original under Paths.document/photos is only read.
 */
export async function preparePhoto(localUri: string): Promise<{ uri: string; bytes: Uint8Array }> {
  const context = ImageManipulator.manipulate(localUri);
  const images: ImageRef[] = [];
  try {
    let image = await context.renderAsync();
    images.push(image);
    if (Math.max(image.width, image.height) > UPLOAD_MAX_EDGE) {
      context.resize(image.width >= image.height ? { width: UPLOAD_MAX_EDGE } : { height: UPLOAD_MAX_EDGE });
      image = await context.renderAsync();
      images.push(image);
    }
    const saved = await image.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
    try {
      return { uri: saved.uri, bytes: await new File(saved.uri).bytes() };
    } catch (err) {
      deleteCopy(saved.uri);
      throw err;
    }
  } finally {
    for (const image of images) image.release();
    context.release();
  }
}

function deleteCopy(uri: string): void {
  try {
    new File(uri).delete();
  } catch (err) {
    console.warn('[sync] could not delete the upload copy', err);
  }
}

export const defaultPhotoIO: PhotoIO = {
  exists: (filePath) => new File(resolvePhotoUri(filePath)).exists,
  async prepare(filePath) {
    const prepared = await preparePhoto(resolvePhotoUri(filePath));
    return {
      ...prepared,
      cleanup: () => deleteCopy(prepared.uri),
    };
  },
  write(filePath, bytes) {
    photoFolder(filePath).create({ intermediates: true, idempotent: true });
    new File(resolvePhotoUri(filePath)).write(bytes);
  },
  remove(filePath) {
    const file = new File(resolvePhotoUri(filePath));
    if (file.exists) file.delete();
  },
};

/** Uploads to photos/<owner>/<spot>/<media>.jpg (upsert: a retry after a failed row write re-uploads harmlessly). */
export async function uploadPhoto(
  client: SupabaseClient,
  owner: string,
  media: Pick<Media, 'id' | 'spot_id'>,
  bytes: Uint8Array,
): Promise<string> {
  const path = storagePath(owner, media);
  const { error } = await client.storage
    .from(PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** A downloaded Blob's bytes. React Native's Blob has no arrayBuffer(); its FileReader reads one (Node's Blob has it). */
export function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the download'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Downloads under way per media id: two tiles showing one photo share one download. */
const cacheDownloads = new Map<string, Promise<string>>();

/**
 * The uri to show a photo from (S8, D91). The rider's own (`photos/…`, or an absolute uri) resolves at once; another
 * rider's (`cache/photos/<spot>/<media>.jpg`, written by pull) is served from the cache, downloaded from
 * `<owner>/<spot>/<media>.jpg` first when the file isn't there (iOS may have cleared it). A refused or failed
 * download (403/404/offline) rejects and writes nothing; the next call tries again.
 */
export function cachedPhotoUri(
  client: SupabaseClient | null,
  media: Pick<Media, 'id' | 'spot_id' | 'file_path' | 'owner_id'>,
  io: Pick<PhotoIO, 'exists' | 'write'> = defaultPhotoIO,
): Promise<string> {
  const uri = resolvePhotoUri(media.file_path);
  if (!media.file_path.startsWith('cache/') || io.exists(media.file_path)) return Promise.resolve(uri);
  const running = cacheDownloads.get(media.id);
  if (running) return running;
  const generation = generationOf(media.spot_id);
  const download = (async () => {
    if (!client) throw new Error('accounts are not set up in this build');
    if (!media.owner_id) throw new Error(`photo ${media.id} has no owner`);
    const { data, error } = await client.storage.from(PHOTOS_BUCKET).download(storagePath(media.owner_id, media));
    if (error) throw new Error(error.message);
    const bytes = await blobBytes(data);
    if (generation !== generationOf(media.spot_id)) throw new Error(`photo ${media.id} was removed while downloading`);
    io.write(media.file_path, bytes);
    return uri;
  })().finally(() => cacheDownloads.delete(media.id));
  cacheDownloads.set(media.id, download);
  return download;
}

/**
 * The rider's own live photos of live spots that reached the server (`rev` set: pulled, or this phone's push came
 * back) but whose file is not on this phone: a second phone, or a reinstall. Up to `limit` downloads per sync, one at a time, newest
 * first; a failure warns and the photo is tried again next sync. Others' photos (S8) go to the cache lazily, not here.
 * Returns how many files were written.
 */
export async function downloadMissingPhotos(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  io: PhotoIO = defaultPhotoIO,
  limit = 20,
): Promise<number> {
  const rows = await db.getAllAsync<Pick<Media, 'id' | 'spot_id' | 'file_path'>>(
    `SELECT m.id, m.spot_id, m.file_path FROM media m JOIN spots s ON s.id = m.spot_id
     WHERE m.owner_id = ? AND m.deleted_at IS NULL AND s.deleted_at IS NULL AND m.rev IS NOT NULL
       AND m.file_path LIKE 'photos/%'
     ORDER BY m.created_at DESC, m.id`,
    uid,
  );
  let tried = 0;
  let written = 0;
  for (const media of rows) {
    if (tried >= limit) break;
    if (io.exists(media.file_path)) continue;
    tried += 1;
    try {
      const { data, error } = await client.storage.from(PHOTOS_BUCKET).download(storagePath(uid, media));
      if (error) throw new Error(error.message);
      io.write(media.file_path, await blobBytes(data));
      written += 1;
    } catch (err) {
      console.warn(`[sync] could not download photo ${media.id}:`, errorMessage(err));
    }
  }
  return written;
}
