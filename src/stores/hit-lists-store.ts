import { create } from 'zustand';
import type { HitList, HitListUpdate, Spot } from '@/src/types';

interface HitListsState {
  /** Live lists, in the order loaded (getHitLists: oldest first) then created. */
  lists: HitList[];
  /** spotId → the ids of the lists it is in. May still name a list that was deleted: the selectors skip those. */
  membershipBySpot: Record<string, string[]>;
  /** The Spots tab's list picker; null = 'My spots'. */
  activeListId: string | null;

  setLists: (lists: HitList[]) => void;
  setMemberships: (membershipBySpot: Record<string, string[]>) => void;
  addList: (list: HitList) => void;
  updateList: (id: string, updates: HitListUpdate) => void;
  /** Also resets activeListId to null when it was this list. */
  removeList: (id: string) => void;
  /** No duplicates: a spot already in the list keeps its place. */
  addMemberships: (listId: string, spotIds: string[]) => void;
  /** Drops spots left in no list from the map. */
  removeMemberships: (listId: string, spotIds: string[]) => void;
  setActiveListId: (id: string | null) => void;
}

export const useHitListsStore = create<HitListsState>((set) => ({
  lists: [],
  membershipBySpot: {},
  activeListId: null,

  setLists: (lists) => set({ lists }),
  setMemberships: (membershipBySpot) => set({ membershipBySpot }),

  addList: (list) => set((s) => ({ lists: [...s.lists, list] })),

  updateList: (id, updates) =>
    set((s) => {
      // An undefined key keeps the stored value, as updateHitList in src/db does.
      const defined = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      return { lists: s.lists.map((l) => (l.id === id ? { ...l, ...defined } : l)) };
    }),

  removeList: (id) =>
    set((s) => ({
      lists: s.lists.filter((l) => l.id !== id),
      activeListId: s.activeListId === id ? null : s.activeListId,
    })),

  addMemberships: (listId, spotIds) =>
    set((s) => {
      const next = { ...s.membershipBySpot };
      for (const spotId of spotIds) {
        const current = next[spotId] ?? [];
        if (!current.includes(listId)) next[spotId] = [...current, listId];
      }
      return { membershipBySpot: next };
    }),

  removeMemberships: (listId, spotIds) =>
    set((s) => {
      const next = { ...s.membershipBySpot };
      for (const spotId of spotIds) {
        const current = next[spotId];
        if (!current?.includes(listId)) continue;
        const rest = current.filter((id) => id !== listId);
        if (rest.length > 0) next[spotId] = rest;
        else delete next[spotId];
      }
      return { membershipBySpot: next };
    }),

  setActiveListId: (activeListId) => set({ activeListId }),
}));

// ── Selectors ───────────────────────────────────────────
// Pure: screens select the raw state and useMemo these. A selector that builds a new array inside the store hook
// would hand zustand 5 a fresh value on every render and loop.

/** The list's live spots, in `spots` order. */
export function selectListSpots(
  list: HitList,
  spots: Spot[],
  membershipBySpot: Record<string, string[]>,
): Spot[] {
  return spots.filter((s) => s.deleted_at === undefined && membershipBySpot[s.id]?.includes(list.id));
}

/** Lists by name, case-insensitive (oldest first among equal names); a new array, the input is untouched. */
export function selectListsByName(lists: HitList[]): HitList[] {
  return [...lists].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.created_at.localeCompare(b.created_at),
  );
}

/** The live lists the spot is in, by name. */
export function selectSpotLists(
  spotId: string,
  lists: HitList[],
  membershipBySpot: Record<string, string[]>,
): HitList[] {
  const ids = membershipBySpot[spotId] ?? [];
  return selectListsByName(lists.filter((l) => l.deleted_at === undefined && ids.includes(l.id)));
}

/** `{ [listId]: live spots in it }` for every list given, 0 for an empty one. */
export function selectListCounts(
  lists: HitList[],
  spots: Spot[],
  membershipBySpot: Record<string, string[]>,
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(lists.map((l) => [l.id, 0]));
  for (const spot of spots) {
    if (spot.deleted_at !== undefined) continue;
    for (const listId of membershipBySpot[spot.id] ?? []) {
      if (Object.hasOwn(counts, listId)) counts[listId] += 1;
    }
  }
  return counts;
}
