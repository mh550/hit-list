import { create } from 'zustand';
import { DEFAULT_FILTERS, type GeoPoint, type HitList, type HitListUpdate, type Spot, type SpotFilters } from '@/src/types';
import { isAreaList, spotsInCircle } from '@/src/utils/area';
import type { InboxItem, InviteItem } from './inbox-store';
import { selectFilteredSpots } from './spots-store';

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
  /** Swaps in this version of the list, by id (a failed write's revert, which may need to drop a key). */
  replaceList: (list: HitList) => void;
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

  updateList: (id, { area_place, ...rest }) =>
    set((s) => {
      // An undefined key keeps the stored value, as updateHitList in src/db does; area_place: null clears the place.
      const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      return {
        lists: s.lists.map((l) => {
          if (l.id !== id) return l;
          const next: HitList = { ...l, ...defined };
          if (area_place === null) delete next.area_place;
          else if (area_place !== undefined) next.area_place = area_place;
          return next;
        }),
      };
    }),

  replaceList: (list) => set((s) => ({ lists: s.lists.map((l) => (l.id === list.id ? list : l)) })),

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

/**
 * The one rule for "in the area" (picker count, area lists, detail, sheet): live, located, inside the circle (the
 * boundary counts), passing the filters; in `spots` order.
 */
export function selectAreaSpots(spots: Spot[], center: GeoPoint, radiusM: number, filters: SpotFilters): Spot[] {
  return selectFilteredSpots(spotsInCircle(spots.filter((s) => s.deleted_at === undefined), center, radiusM), filters);
}

/**
 * The list's live spots, in `spots` order. A manual list's come from its memberships; an area list's are computed from
 * its circle and filters (never stored), and an area list missing its centre or radius holds none.
 */
export function selectListSpots(
  list: HitList,
  spots: Spot[],
  membershipBySpot: Record<string, string[]>,
): Spot[] {
  if (list.kind === 'area') {
    if (!isAreaList(list)) return [];
    return selectAreaSpots(spots, list.area_center, list.area_radius_m, list.area_filters ?? DEFAULT_FILTERS);
  }
  return spots.filter((s) => s.deleted_at === undefined && membershipBySpot[s.id]?.includes(list.id));
}

/** Lists by name, case-insensitive (oldest first among equal names); a new array, the input is untouched. */
export function selectListsByName(lists: HitList[]): HitList[] {
  return [...lists].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.created_at.localeCompare(b.created_at),
  );
}

/** The live lists the spot is in, by name: the manual lists it was added to and the area lists whose circle holds it. */
export function selectSpotLists(
  spot: Spot,
  lists: HitList[],
  membershipBySpot: Record<string, string[]>,
): HitList[] {
  return selectListsByName(
    lists.filter((l) => l.deleted_at === undefined && selectListSpots(l, [spot], membershipBySpot).length > 0),
  );
}

/** `{ [listId]: live spots in it }` for every list given, 0 for an empty one. */
export function selectListCounts(
  lists: HitList[],
  spots: Spot[],
  membershipBySpot: Record<string, string[]>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const manualIds = new Set<string>();
  for (const list of lists) {
    if (list.kind === 'area') counts[list.id] = selectListSpots(list, spots, membershipBySpot).length;
    else {
      counts[list.id] = 0;
      manualIds.add(list.id);
    }
  }
  // Manual lists: one pass over the spots.
  for (const spot of spots) {
    if (spot.deleted_at !== undefined) continue;
    for (const listId of membershipBySpot[spot.id] ?? []) {
      if (manualIds.has(listId)) counts[listId] += 1;
    }
  }
  return counts;
}

/**
 * Others' lists the rider joined (S8): an owner that isn't `uid` and a members row of `uid`'s with status 'member'
 * (an invitation isn't joined, D57), by name.
 */
export function selectSharedWithMe(lists: HitList[], uid: string): HitList[] {
  return selectListsByName(
    lists.filter(
      (l) =>
        l.owner_id !== undefined &&
        l.owner_id !== uid &&
        (l.members ?? []).some((m) => m.user_id === uid && m.status === 'member'),
    ),
  );
}

/**
 * The rider's open invitations (status 'invited'), newest first: the Inbox's invite items, from list_invitations()
 * (D83: an invited rider doesn't hold the list, only its name and count). Takes the Inbox store's items.
 */
export function selectInvitations(items: InboxItem[]): InviteItem[] {
  return items
    .filter((i): i is InviteItem => i.kind === 'invite')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
