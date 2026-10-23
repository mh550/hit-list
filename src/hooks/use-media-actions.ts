import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { deleteMedia, insertMedia } from '@/src/db';
import { useMediaStore } from '@/src/stores/media-store';
import { useSpotsStore } from '@/src/stores/spots-store';
import { assertOwn } from '@/src/sync/owner';
import { persistPhoto } from '@/src/utils/photo-storage';
import type { Media } from '@/src/types';

export type NewPhoto = Omit<Media, 'file_path'> & { sourceUri: string };

/**
 * Photo changes are DB-first (unlike useSpotActions), and only rows the DB accepted reach the store, in one update.
 * - savePhotos: each photo is copied into app storage (D3), then its row inserted. Resolves the photos actually
 *   saved, in the order given; a failed insert is logged and the others are still saved.
 * - removePhotos: each row is deleted; the file in app storage stays (D3) and the camera roll is never touched.
 *   Resolves the ids actually removed; a failed delete is logged and its photo stays.
 * Both reject with 'not your spot', changing nothing, for another rider's spot (S8, D47).
 */
export function useMediaActions() {
  const db = useSQLiteContext();
  const addMany = useMediaStore((s) => s.addMany);
  const removeMany = useMediaStore((s) => s.removeMany);

  const savePhotos = useCallback(
    async (photos: NewPhoto[]): Promise<Media[]> => {
      const spots = useSpotsStore.getState().spots;
      for (const p of photos) assertOwn(spots.find((s) => s.id === p.spot_id), 'spot');
      const results = await Promise.allSettled(
        photos.map(async ({ sourceUri, ...fields }) => {
          const media: Media = { ...fields, file_path: await persistPhoto(sourceUri, fields.spot_id, fields.id) };
          await insertMedia(db, media);
          return media;
        }),
      );
      const saved: Media[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') saved.push(r.value);
        else console.error('[useMediaActions] insertMedia failed:', r.reason);
      }
      addMany(saved);
      return saved;
    },
    [db, addMany],
  );

  const removePhotos = useCallback(
    async (ids: string[]): Promise<string[]> => {
      const known = Object.values(useMediaStore.getState().mediaBySpot).flat();
      for (const id of ids) assertOwn(known.find((m) => m.id === id), 'spot');
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
