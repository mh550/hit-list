import {
  useHitListsStore,
  useSpotsStore,
  selectAreaSpots,
  selectListSpots,
  selectSpotLists,
  selectListCounts,
  selectListsByName,
  selectSharedWithMe,
  selectInvitations,
} from '@/src/stores';
import type { InboxItem } from '@/src/stores/inbox-store';
import { DEFAULT_FILTERS, FeatureType, type GeoPoint } from '@/src/types';
import { NO_LOCATION } from '@/src/utils/geo';
import { CITIES, createTestHitList, createTestSpot } from './factories';

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

  // S10-01 review U3: a list that leaves through a reload (Leave, removed, Stop sharing, deleted elsewhere)
  it('setLists clears the active list when it is no longer among the live lists', () => {
    const { setLists, setActiveListId } = useHitListsStore.getState();
    setLists([createTestHitList({ id: 'L1' }), createTestHitList({ id: 'L2' })]);
    setActiveListId('L1');
    setLists([createTestHitList({ id: 'L1' })]);
    expect(useHitListsStore.getState().activeListId).toBe('L1');
    setLists([createTestHitList({ id: 'L1', deleted_at: '2026-10-23T00:00:00.000Z' }), createTestHitList({ id: 'L2' })]);
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
    expect(selectSpotLists(a, lists, membership)).toEqual([L2, L1]);
    expect(selectSpotLists(c, lists, membership)).toEqual([L2]);
    expect(selectSpotLists(createTestSpot({ id: 'nowhere' }), lists, membership)).toEqual([]);
    const softDeleted = { ...L1, deleted_at: '2026-10-03T00:00:00.000Z' };
    expect(selectSpotLists(b, [softDeleted, L2], membership)).toEqual([]);
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

describe('area lists (computed from the circle and its filters, never stored)', () => {
  const initialSpots = useSpotsStore.getState();
  /** A point `meters` due north of `p` (haversine's Earth: 6371 km). */
  const north = (p: GeoPoint, meters: number): GeoPoint => ({
    latitude: p.latitude + (meters / 6_371_000) * (180 / Math.PI),
    longitude: p.longitude,
  });
  const center = CITIES.seattle;
  const rail = createTestSpot({ id: 'rail', location: north(center, 500), feature_types: [FeatureType.Rail] });
  const ledge = createTestSpot({ id: 'ledge', location: north(center, 800), feature_types: [FeatureType.Ledge] });
  const far = createTestSpot({ id: 'far', location: north(center, 2000), feature_types: [FeatureType.Rail] });
  const nowhere = createTestSpot({ id: 'nowhere', location: NO_LOCATION, feature_types: [FeatureType.Rail] });
  const gone = createTestSpot({
    id: 'gone',
    location: north(center, 100),
    feature_types: [FeatureType.Rail],
    deleted_at: '2026-10-02T00:00:00.000Z',
  });
  const spots = [ledge, far, nowhere, gone, rail];
  const area = createTestHitList({ id: 'AREA', name: 'Area', kind: 'area', area_center: center, area_radius_m: 1609 });
  const railsOnly = { ...area, id: 'RAILS', area_filters: { types: [FeatureType.Rail] } };

  beforeEach(() => {
    useSpotsStore.setState(initialSpots, true);
    useHitListsStore.setState(initial, true);
  });

  it('selectAreaSpots: live, located spots inside the circle that pass the filters, in spots order', () => {
    expect(selectAreaSpots(spots, center, 1609, DEFAULT_FILTERS).map((s) => s.id)).toEqual(['ledge', 'rail']);
    expect(selectAreaSpots(spots, center, 1609, { types: [FeatureType.Rail] }).map((s) => s.id)).toEqual(['rail']);
    expect(selectAreaSpots(spots, NO_LOCATION, 50_000, DEFAULT_FILTERS)).toEqual([]);
  });

  it('selectListSpots: an area list holds the live spots inside its circle, with no memberships', () => {
    expect(selectListSpots(area, spots, {}).map((s) => s.id)).toEqual(['ledge', 'rail']);
  });

  it('selectListSpots: area_filters apply (types rail drops a ledge inside the circle)', () => {
    expect(selectListSpots(railsOnly, spots, {}).map((s) => s.id)).toEqual(['rail']);
  });

  it('selectListSpots: memberships never add a spot to an area list', () => {
    expect(selectListSpots(area, spots, { far: ['AREA'] }).map((s) => s.id)).toEqual(['ledge', 'rail']);
  });

  it("selectListSpots (S8): an area list holds only its owner's spots; a member's own spots in ana's circle never show", () => {
    const anas = { ...rail, id: 'anas', owner_id: 'u-ana' };
    const mine = { ...ledge, id: 'mine', owner_id: 'u-me' };
    const phoneOnly = { ...rail, id: 'phone' };
    const pool = [anas, mine, phoneOnly];
    expect(selectListSpots({ ...area, owner_id: 'u-ana' }, pool, {}).map((s) => s.id)).toEqual(['anas', 'phone']);
    expect(selectListSpots({ ...area, owner_id: 'u-me' }, pool, {}).map((s) => s.id)).toEqual(['mine', 'phone']);
    // a phone-only list (signed out after Keep) still holds the kept spots of the last account
    expect(selectListSpots(area, pool, {}).map((s) => s.id)).toEqual(['anas', 'mine', 'phone']);
  });

  it("selectListSpots (S8-05): ana's shared area list on a member's phone holds only ana's pulled spots inside the circle", () => {
    const anasList = { ...area, owner_id: 'u-ana', shared: true, members: [{ user_id: 'u-me', role: 'view' as const, status: 'member' as const }] };
    const anasIn = { ...rail, id: 'anas-in', owner_id: 'u-ana' };
    const anasLedge = { ...ledge, id: 'anas-ledge', owner_id: 'u-ana' };
    const anasOut = { ...far, id: 'anas-out', owner_id: 'u-ana' };
    const mineIn = { ...rail, id: 'mine-in', owner_id: 'u-me' };
    const bensIn = { ...ledge, id: 'bens-in', owner_id: 'u-ben' };
    const pool = [mineIn, anasIn, bensIn, anasOut, anasLedge];
    expect(selectListSpots(anasList, pool, {}).map((s) => s.id)).toEqual(['anas-in', 'anas-ledge']);
    // her filters still apply
    expect(selectListSpots({ ...anasList, area_filters: { types: [FeatureType.Rail] } }, pool, {}).map((s) => s.id)).toEqual([
      'anas-in',
    ]);
  });

  it('selectListSpots: an area list missing its centre or radius holds nothing', () => {
    expect(selectListSpots({ ...area, area_center: undefined }, spots, {})).toEqual([]);
    expect(selectListSpots({ ...area, area_radius_m: undefined }, spots, {})).toEqual([]);
  });

  it('a spot added to the spots store inside the circle is in the next selectListSpots call', () => {
    useSpotsStore.getState().setSpots([rail]);
    expect(selectListSpots(area, useSpotsStore.getState().spots, {}).map((s) => s.id)).toEqual(['rail']);

    useSpotsStore.getState().addSpot(createTestSpot({ id: 'new', location: north(center, 1000) }));

    const ids = selectListSpots(area, useSpotsStore.getState().spots, {}).map((s) => s.id);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining(['rail', 'new']));
  });

  it('selectListCounts counts area lists the same way, next to manual ones', () => {
    const manual = createTestHitList({ id: 'M' });
    expect(selectListCounts([manual, area, railsOnly], spots, { far: ['M'], rail: ['M'] })).toEqual({
      M: 2,
      AREA: 2,
      RAILS: 1,
    });
  });

  it('selectSpotLists includes an area list for a spot inside its circle and not for one outside', () => {
    const manual = createTestHitList({ id: 'M', name: 'Zoo' });
    const lists = [manual, area, railsOnly];
    expect(selectSpotLists(rail, lists, { rail: ['M'] }).map((l) => l.id)).toEqual(['AREA', 'RAILS', 'M']);
    expect(selectSpotLists(ledge, lists, {}).map((l) => l.id)).toEqual(['AREA']);
    expect(selectSpotLists(far, lists, {})).toEqual([]);
    expect(selectSpotLists(nowhere, lists, {})).toEqual([]);
  });

  it('updateList sets the area fields, and area_place: null clears the place', () => {
    const list = { ...area, area_place: 'Capitol Hill' };
    useHitListsStore.setState({ lists: [list] });
    const moved = north(center, 300);

    useHitListsStore.getState().updateList('AREA', { area_center: moved, area_radius_m: 8047 });
    expect(useHitListsStore.getState().lists[0]).toEqual({ ...list, area_center: moved, area_radius_m: 8047 });

    useHitListsStore.getState().updateList('AREA', { area_place: null });
    const cleared = useHitListsStore.getState().lists[0];
    expect(cleared.area_place).toBeUndefined();
    expect('area_place' in cleared).toBe(false);
    expect(cleared.area_radius_m).toBe(8047);
  });
});

describe('shared lists (S8)', () => {
  const ME = 'rider-me';
  const ANA = 'rider-ana';
  const joined = createTestHitList({
    id: 'joined',
    name: 'Downtown',
    owner_id: ANA,
    shared: true,
    members: [
      { user_id: ME, role: 'add', status: 'member' },
      { user_id: 'rider-ben', username: 'ben', role: 'view', status: 'member' },
    ],
  });
  const invitedOnly = createTestHitList({
    id: 'invited',
    name: 'Bridges',
    owner_id: ANA,
    shared: true,
    members: [{ user_id: ME, role: 'add', status: 'invited' }],
  });
  const mineShared = createTestHitList({
    id: 'mine',
    name: 'Crew',
    owner_id: ME,
    shared: true,
    members: [{ user_id: ANA, role: 'add', status: 'member' }],
  });
  const phoneOnly = createTestHitList({ id: 'phone', name: 'Apple' });
  const later = createTestHitList({
    id: 'later',
    name: 'apex',
    owner_id: 'rider-cal',
    shared: true,
    members: [{ user_id: ME, role: 'view', status: 'member' }],
  });

  beforeEach(() => {
    useHitListsStore.setState(initial, true);
  });

  it("selectSharedWithMe: others' lists the rider joined (status 'member'), by name; never their own, an invitation or a phone-only list", () => {
    expect(selectSharedWithMe([joined, invitedOnly, mineShared, phoneOnly, later], ME).map((l) => l.id)).toEqual([
      'later',
      'joined',
    ]);
    expect(selectSharedWithMe([joined], 'rider-ben').map((l) => l.id)).toEqual(['joined']);
    expect(selectSharedWithMe([joined], 'rider-cal')).toEqual([]);
  });

  it('the store keeps each list its members through setLists and an update', () => {
    useHitListsStore.getState().setLists([mineShared]);
    useHitListsStore.getState().updateList('mine', { name: 'Crew 2' });
    expect(useHitListsStore.getState().lists[0].members).toEqual([{ user_id: ANA, role: 'add', status: 'member' }]);
  });

  it('selectInvitations: the Inbox invite items, newest first, nothing else', () => {
    const invite = (id: string, created_at: string): InboxItem => ({
      kind: 'invite',
      id,
      created_at,
      listId: id,
      listName: id,
      listKind: 'manual',
      from: { id: ANA, username: 'ana', display_name: null },
      role: 'add',
      spotCount: 3,
    });
    const request: InboxItem = {
      kind: 'friend_request',
      id: 'r',
      created_at: '2026-10-23T12:00:00.000Z',
      friendshipId: 'r',
      from: { id: 'x', username: 'x', display_name: null },
    };
    const items = [invite('old', '2026-10-21T00:00:00.000Z'), request, invite('new', '2026-10-22T00:00:00.000Z')];

    expect(selectInvitations(items).map((i) => i.id)).toEqual(['new', 'old']);
    expect(items.map((i) => i.id)).toEqual(['old', 'r', 'new']);
  });
});
