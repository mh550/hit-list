import { Directory, File, Paths } from 'expo-file-system';

const PHOTOS_DIR = 'photos';
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function photoRelativePath(spotId: string, mediaId: string): string {
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

/** Relative paths resolve against the current document directory, which iOS moves on reinstall. */
export function resolvePhotoUri(filePath: string): string {
  if (HAS_SCHEME.test(filePath) || filePath.startsWith('/')) return filePath;
  return new File(Paths.document, filePath).uri;
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
