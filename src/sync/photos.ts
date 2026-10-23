import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
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
