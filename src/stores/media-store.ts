import { create } from 'zustand';
import type { Media } from '@/src/types';

interface MediaState {
  /** Media per spot id, in the order given (getAllMedia and callers supply capture order). */
  mediaBySpot: Record<string, Media[]>;
  setAll: (media: Media[]) => void;
  /** Appends newly saved media in one store update. */
  addMany: (media: Media[]) => void;
}

function grouped(base: Record<string, Media[]>, media: Media[]): Record<string, Media[]> {
  const next = { ...base };
  for (const m of media) next[m.spot_id] = [...(next[m.spot_id] ?? []), m];
  return next;
}

export const useMediaStore = create<MediaState>((set) => ({
  mediaBySpot: {},
  setAll: (media) => set({ mediaBySpot: grouped({}, media) }),
  addMany: (media) => set((s) => ({ mediaBySpot: grouped(s.mediaBySpot, media) })),
}));
