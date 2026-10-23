import { Directory, File, Paths } from 'expo-file-system';

const PHOTOS_DIR = 'photos';
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Where a photo lives under the document directory, as media.file_path stores it. */
export function photoRelativePath(spotId: string, mediaId: string): string {
  return `${PHOTOS_DIR}/${spotId}/${mediaId}.jpg`;
}

/**
 * Copies a (purgeable) camera or picker cache URI into the app's document directory (D3).
 * Returns the relative path to store in media.file_path, or the source URI if the copy failed,
 * so the photo row is never lost.
 */
export async function persistPhoto(sourceUri: string, spotId: string, mediaId: string): Promise<string> {
  const relative = photoRelativePath(spotId, mediaId);
  try {
    new Directory(Paths.document, PHOTOS_DIR, spotId).create({ intermediates: true, idempotent: true });
    await new File(sourceUri).copy(new File(Paths.document, relative));
    return relative;
  } catch (err) {
    console.warn('[persistPhoto] copy failed, keeping the original URI:', err);
    return sourceUri;
  }
}

/** The prefix of another rider's cached photo (S8): `cache/photos/<spot>/<media>.jpg`, under Paths.cache (§3.4). */
const CACHE_PREFIX = 'cache/';

/**
 * Relative paths resolve against the current document directory, which iOS moves on reinstall; another rider's cached
 * photo (`cache/…`) against the cache directory.
 */
export function resolvePhotoUri(filePath: string): string {
  if (HAS_SCHEME.test(filePath) || filePath.startsWith('/')) return filePath;
  if (filePath.startsWith(CACHE_PREFIX)) return new File(Paths.cache, filePath.slice(CACHE_PREFIX.length)).uri;
  return new File(Paths.document, filePath).uri;
}

/** The folder a relative file_path's file goes in, under the root resolvePhotoUri picks for it. */
export function photoFolder(filePath: string): Directory {
  const dir = filePath.slice(0, filePath.lastIndexOf('/'));
  return dir.startsWith(CACHE_PREFIX)
    ? new Directory(Paths.cache, dir.slice(CACHE_PREFIX.length))
    : new Directory(Paths.document, dir);
}

/**
 * Deletes each spot's photo folder (`photos/<spotId>/`) when an account's rows leave the phone (S5-06). A folder that
 * is not there is skipped; one that can't be deleted warns and the rest still go.
 */
export function deleteSpotPhotos(spotIds: string[]): void {
  for (const spotId of spotIds) {
    try {
      const dir = new Directory(Paths.document, PHOTOS_DIR, spotId);
      if (dir.exists) dir.delete();
    } catch (err) {
      console.warn(`[deleteSpotPhotos] could not delete the photos of ${spotId}:`, err);
    }
  }
}
