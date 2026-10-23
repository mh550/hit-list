import { create } from 'zustand';
import type { Media } from '@/src/types';

interface MediaState {
  /** Media per spot id, in the order given (getAllMedia and callers supply capture order). */
  mediaBySpot: Record<string, Media[]>;
  setAll: (media: Media[]) => void;
  /** Appends newly saved media in one store update; ids already there (a sync reload read them first) are skipped. */
  addMany: (media: Media[]) => void;
  /** Drops these media ids from every spot's list in one store update, keeping the rest in order. */
  removeMany: (ids: string[]) => void;
}

function grouped(base: Record<string, Media[]>, media: Media[]): Record<string, Media[]> {
  const next = { ...base };
  for (const m of media) next[m.spot_id] = [...(next[m.spot_id] ?? []), m];
  return next;
}

export const useMediaStore = create<MediaState>((set) => ({
  mediaBySpot: {},
  setAll: (media) => set({ mediaBySpot: grouped({}, media) }),
  addMany: (media) =>
    set((s) => {
      const known = new Set(Object.values(s.mediaBySpot).flatMap((list) => list.map((m) => m.id)));
      return { mediaBySpot: grouped(s.mediaBySpot, media.filter((m) => !known.has(m.id))) };
    }),
  removeMany: (ids) => {
    if (ids.length === 0) return; // nothing to drop: no new map, no subscriber notification
    set((s) => {
      const drop = new Set(ids);
      const next: Record<string, Media[]> = {};
      for (const [spotId, list] of Object.entries(s.mediaBySpot)) {
        // Untouched spots keep their array, so their selectors see no change.
        next[spotId] = list.some((m) => drop.has(m.id)) ? list.filter((m) => !drop.has(m.id)) : list;
      }
      return { mediaBySpot: next };
    });
  },
}));
