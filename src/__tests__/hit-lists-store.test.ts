import {
  useHitListsStore,
  selectListSpots,
  selectSpotLists,
  selectListCounts,
  selectListsByName,
} from '@/src/stores';
import { createTestHitList, createTestSpot } from './factories';

const initial = useHitListsStore.getState();

describe('hit-lists store', () => {
  beforeEach(() => {
    useHitListsStore.setState(initial, true);
  });

  it('starts empty with no active list', () => {
    const s = useHitListsStore.getState();
    expect(s.lists).toEqual([]);
    expect(s.membershipBySpot).toEqual({});
    expect(s.activeListId).toBeNull();
  });

  it('setActiveListId sets and clears the active list', () => {
    useHitListsStore.getState().setActiveListId('L1');
    expect(useHitListsStore.getState().activeListId).toBe('L1');
    useHitListsStore.getState().setActiveListId(null);
    expect(useHitListsStore.getState().activeListId).toBeNull();
  });

  it('setLists, addList, updateList and removeList', () => {
    const a = createTestHitList({ id: 'A', name: 'Downtown' });
    const b = createTestHitList({ id: 'B', name: 'Night' });
    const { setLists, addList, updateList, removeList } = useHitListsStore.getState();
    setLists([a]);
    addList(b);
    expect(useHitListsStore.getState().lists.map((l) => l.id)).toEqual(['A', 'B']);

    updateList('A', { name: 'Uptown', updated_at: '2026-10-22T00:00:00.000Z' });
    expect(useHitListsStore.getState().lists[0]).toEqual({
      ...a,
      name: 'Uptown',
      updated_at: '2026-10-22T00:00:00.000Z',
    });
    // An undefined key keeps the stored value.
    updateList('A', { name: undefined });
    expect(useHitListsStore.getState().lists[0].name).toBe('Uptown');

    removeList('A');
    expect(useHitListsStore.getState().lists).toEqual([b]);
  });

  it('removeList of the active list resets activeListId to null; another list leaves it', () => {
    const a = createTestHitList({ id: 'A' });
    const b = createTestHitList({ id: 'B' });
    useHitListsStore.setState({ lists: [a, b], activeListId: 'A' });
    useHitListsStore.getState().removeList('B');
    expect(useHitListsStore.getState().activeListId).toBe('A');
    useHitListsStore.getState().removeList('A');
    expect(useHitListsStore.getState().activeListId).toBeNull();
  });

  it('addMemberships dedupes and appends the list to each spot', () => {
    const { setMemberships, addMemberships } = useHitListsStore.getState();
    setMemberships({ a: ['L1'] });
    addMemberships('L2', ['a', 'b', 'b']);
    addMemberships('L2', ['a']);
    expect(useHitListsStore.getState().membershipBySpot).toEqual({ a: ['L1', 'L2'], b: ['L2'] });
  });

  it('removeMemberships drops the list and any key left empty', () => {
    useHitListsStore.setState({ membershipBySpot: { a: ['L1', 'L2'], b: ['L2'], c: ['L1'] } });
    useHitListsStore.getState().removeMemberships('L2', ['a', 'b', 'z']);
    expect(useHitListsStore.getState().membershipBySpot).toEqual({ a: ['L1'], c: ['L1'] });
  });
});

describe('hit-lists selectors', () => {
  const a = createTestSpot({ id: 'a' });
  const b = createTestSpot({ id: 'b' });
  const c = createTestSpot({ id: 'c' });
  const gone = createTestSpot({ id: 'gone', deleted_at: '2026-10-02T00:00:00.000Z' });
  const spots = [c, a, gone, b];
  const L1 = createTestHitList({ id: 'L1', name: 'downtown' });
  const L2 = createTestHitList({ id: 'L2', name: 'Bridges' });
  const L3 = createTestHitList({ id: 'L3', name: 'Empty' });
  const membership = { a: ['L1', 'L2'], b: ['L1'], gone: ['L1', 'L2'], c: ['L2', 'DELETED'] };

  it('selectListSpots: live spots mapped to the list, in spots order', () => {
    expect(selectListSpots(L1, spots, membership).map((s) => s.id)).toEqual(['a', 'b']);
    expect(selectListSpots(L2, spots, membership).map((s) => s.id)).toEqual(['c', 'a']);
    expect(selectListSpots(L3, spots, membership)).toEqual([]);
  });

  it('selectSpotLists: the live lists a spot is in, by name, skipping lists not in the store', () => {
    const lists = [L1, L2, L3];
    expect(selectSpotLists('a', lists, membership)).toEqual([L2, L1]);
    expect(selectSpotLists('c', lists, membership)).toEqual([L2]);
    expect(selectSpotLists('nowhere', lists, membership)).toEqual([]);
    const softDeleted = { ...L1, deleted_at: '2026-10-03T00:00:00.000Z' };
    expect(selectSpotLists('b', [softDeleted, L2], membership)).toEqual([]);
  });

  it('selectListCounts: live spots per list, 0 for an empty list', () => {
    expect(selectListCounts([L1, L2, L3], spots, membership)).toEqual({ L1: 2, L2: 2, L3: 0 });
  });

  it('selectListsByName: case-insensitive name order, without mutating the input', () => {
    const lists = [L1, L3, L2];
    expect(selectListsByName(lists).map((l) => l.name)).toEqual(['Bridges', 'downtown', 'Empty']);
    expect(lists.map((l) => l.id)).toEqual(['L1', 'L3', 'L2']);
  });
});
