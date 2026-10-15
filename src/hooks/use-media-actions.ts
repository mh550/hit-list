import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { deleteMedia, insertMedia } from '@/src/db';
import { useMediaStore } from '@/src/stores/media-store';
import { persistPhoto } from '@/src/utils/photo-storage';
import type { Media } from '@/src/types';

export type NewPhoto = Omit<Media, 'file_path'> & { sourceUri: string };

/**
 * Photo changes are DB-first (unlike useSpotActions), and only rows the DB accepted reach the store, in one update.
 * - savePhotos: each photo is copied into app storage (D3), then its row inserted.
 * - removePhotos: each row is deleted; the file in app storage stays (D3) and the camera roll is never touched.
 *   Resolves the ids actually removed; a failed delete is logged and its photo stays.
 */
export function useMediaActions() {
  const db = useSQLiteContext();
  const addMany = useMediaStore((s) => s.addMany);
  const removeMany = useMediaStore((s) => s.removeMany);

  const savePhotos = useCallback(
    async (photos: NewPhoto[]) => {
      const saved = await Promise.all(
        photos.map(async ({ sourceUri, ...fields }) => {
          const media: Media = { ...fields, file_path: await persistPhoto(sourceUri, fields.spot_id, fields.id) };
          try {
            await insertMedia(db, media);
            return media;
          } catch (err) {
            console.error('[useMediaActions] insertMedia failed:', err);
            return null;
          }
        }),
      );
      addMany(saved.filter((m): m is Media => m !== null));
    },
    [db, addMany],
  );

  const removePhotos = useCallback(
    async (ids: string[]): Promise<string[]> => {
      const results = await Promise.allSettled(ids.map((id) => deleteMedia(db, id)));
      const removed: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') removed.push(ids[i]);
        else console.error('[useMediaActions] deleteMedia failed:', r.reason);
      });
      removeMany(removed);
      return removed;
    },
    [db, removeMany],
  );

  return { savePhotos, removePhotos };
}
