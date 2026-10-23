import type { SupabaseClient } from '@supabase/supabase-js';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import type { Media } from '@/src/types';
import { resolvePhotoUri } from '@/src/utils/photo-storage';

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
  /** Writes a downloaded photo to a relative `photos/<spot>/<media>.jpg` path, making its folder. */
  write(filePath: string, bytes: Uint8Array): void;
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
    new Directory(Paths.document, filePath.slice(0, filePath.lastIndexOf('/'))).create({
      intermediates: true,
      idempotent: true,
    });
    new File(resolvePhotoUri(filePath)).write(bytes);
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
function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the download'));
    reader.readAsArrayBuffer(blob);
  });
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
      console.warn(`[sync] could not download photo ${media.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return written;
}
