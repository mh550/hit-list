import { readFileSync } from 'fs';
import { join } from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext as sharedDb } from 'expo-sqlite';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
// The calls themselves are src/sync/lists.ts's (sync-lists.test.ts); here only what the screen asks of them.
jest.mock('@/src/sync/lists', () => ({
  ...jest.requireActual('@/src/sync/lists'),
  setRole: jest.fn(),
  removeMember: jest.fn(),
  stopSharing: jest.fn(),
  leave: jest.fn(),
}));
// The sheet is share-list-sheet.test.tsx's; here only that Invite opens it.
const mockShareSheet = jest.fn();
jest.mock('@/src/components/ShareListSheet', () => ({
  ShareListSheet: (props: unknown) => {
    mockShareSheet(props);
    return null;
  },
}));

import MembersScreen from '@/app/list/[id]/members';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { clearToast, useToastStore } from '@/src/stores/toast-store';
import { leave, NotAllowedError, removeMember, setRole, stopSharing } from '@/src/sync/lists';
import type { HitList, HitListMember } from '@/src/types';
import { createTestHitList, createTestSpot } from './factories';

const ME = 'u-me';
const rider = (userId: string, username: string): AuthSnapshot => ({
  status: 'signed_in',
  userId,
  email: `${username}@example.com`,
  username,
  displayName: null,
});

const member = (user_id: string, username: string | undefined, role: HitListMember['role'], status: HitListMember['status']) => ({
  user_id,
  role,
  status,
  ...(username ? { username } : {}),
});

const db = sharedDb();
let router: { push: jest.Mock; back: jest.Mock; dismissAll: jest.Mock; navigate: jest.Mock; canGoBack: jest.Mock };
let alertSpy: jest.SpyInstance;
let warn: jest.SpyInstance;

/** My list 'Downtown', shared: ben (add) and dee (view) joined, cal invited; 12 spots: 7 mine, 5 ben's. */
const mine: HitList = createTestHitList({
  id: 'L-downtown',
  name: 'Downtown',
  owner_id: ME,
  shared: true,
  members: [
    member('u-ben', 'ben', 'add', 'member'),
    member('u-dee', 'dee', 'view', 'member'),
    member('u-cal', 'cal', 'view', 'invited'),
  ],
});
/** Ana's list 'Downtown' I joined with 'add': 5 of its spots are mine. */
const anas: HitList = createTestHitList({
  id: 'L-downtown',
  name: 'Downtown',
  owner_id: 'u-ana',
  owner_username: 'ana',
  shared: true,
  members: [member(ME, undefined, 'add', 'member'), member('u-ben', 'ben', 'add', 'member'), member('u-cal', undefined, 'add', 'invited')],
});

const spotsOf = (owner: string, n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => createTestSpot({ id: `${prefix}${i}`, owner_id: owner }));

function setList(list: HitList, spots = [...spotsOf(ME, 7, 'm'), ...spotsOf('u-ben', 5, 'b')]) {
  useSpotsStore.setState({ spots });
  useHitListsStore.setState({
    lists: [list],
    membershipBySpot: Object.fromEntries(spots.map((s) => [s.id, [list.id]])),
    activeListId: null,
  });
}

function signIn(userId = ME, username = 'me') {
  mockFake?.setSession(fakeSession({ userId }));
  useAuthStore.setState(rider(userId, username));
}

async function renderScreen() {
  render(<MembersScreen />);
  await act(async () => {});
}

const lastAlert = () => alertSpy.mock.calls.at(-1) as [string, string | undefined, AlertButton[] | undefined];
async function pressAlertButton(text: string) {
  const button = lastAlert()[2]?.find((b) => b.text === text);
  if (!button) throw new Error(`no '${text}' in the last alert: ${JSON.stringify(lastAlert())}`);
  await act(async () => {
    await button.onPress?.();
  });
}

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
  clearToast();
  router = { push: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
  jest.mocked(useRouter).mockReturnValue(router as never);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'L-downtown' });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockShareSheet.mockClear();
  for (const fn of [setRole, removeMember, stopSharing, leave]) jest.mocked(fn).mockReset().mockResolvedValue(true);
  setList(mine);
});

afterEach(() => {
  clearToast();
  alertSpy.mockRestore();
  warn.mockRestore();
});

describe('Members screen signed out', () => {
  it('shows the sign-in line and Sign in opens sign-in', async () => {
    await renderScreen();
    expect(screen.getByText("Sign in to see who's in this list")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
  });
});

describe('Members screen as the owner', () => {
  beforeEach(() => signIn());

  it("lists '@me (owner)', each member with their role and the invitation tagged 'Invited'", async () => {
    await renderScreen();
    expect(screen.getByText('@me (owner)')).toBeOnTheScreen();
    expect(screen.getByText('@ben · Can add spots')).toBeOnTheScreen();
    expect(screen.getByText('@dee · View only')).toBeOnTheScreen();
    expect(screen.getByText('@cal · View only')).toBeOnTheScreen();
    expect(screen.getAllByText('Invited')).toHaveLength(1);
  });

  it("tapping a member opens the role menu; 'View only' calls setRole", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: '@ben · Can add spots' }));

    const [title, message, buttons] = lastAlert();
    expect(title).toBe('@ben');
    expect(message).toBeUndefined();
    expect(buttons?.map((b) => b.text)).toEqual(['Can add spots', 'View only', 'Remove from list', 'Cancel']);
    expect(buttons?.find((b) => b.text === 'Remove from list')?.style).toBe('destructive');

    await pressAlertButton('View only');
    expect(setRole).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown', 'u-ben', 'view');
  });

  it("choosing the role a member already has calls nothing", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: '@ben · Can add spots' }));
    await pressAlertButton('Can add spots');
    expect(setRole).not.toHaveBeenCalled();
  });

  it("'Remove from list' confirms 'Remove @ben?' with their spot count, then calls removeMember", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: '@ben · Can add spots' }));
    await pressAlertButton('Remove from list');

    const [title, message, buttons] = lastAlert();
    expect(title).toBe('Remove @ben?');
    expect(message).toBe('Their 5 spots in Downtown will leave it too.');
    expect(buttons?.map((b) => b.text)).toEqual(['Cancel', 'Remove']);
    expect(removeMember).not.toHaveBeenCalled();

    await pressAlertButton('Remove');
    expect(removeMember).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown', 'u-ben');
  });

  it('removing a member with no spots in the list asks with no message', async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: '@dee · View only' }));
    await pressAlertButton('Remove from list');
    expect(lastAlert()[0]).toBe('Remove @dee?');
    expect(lastAlert()[1]).toBeUndefined();
  });

  it("an invited row offers 'Withdraw invitation', which calls removeMember", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: '@cal · View only, Invited' }));
    const [title, , buttons] = lastAlert();
    expect(title).toBe('@cal');
    expect(buttons?.map((b) => b.text)).toEqual(['Withdraw invitation', 'Cancel']);

    await pressAlertButton('Withdraw invitation');
    expect(removeMember).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown', 'u-cal');
  });

  it("'Stop sharing' alerts 'Stop sharing Downtown?' / 'Members lose access to all 12 spots now.', then stops and goes back", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Stop sharing' }));

    const [title, message, buttons] = lastAlert();
    expect(title).toBe('Stop sharing Downtown?');
    expect(message).toBe('Members lose access to all 12 spots now.');
    expect(buttons?.map((b) => b.text)).toEqual(['Cancel', 'Stop sharing']);
    expect(stopSharing).not.toHaveBeenCalled();

    await pressAlertButton('Stop sharing');
    expect(stopSharing).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown');
    expect(useToastStore.getState().text).toBe('Stopped sharing Downtown');
    expect(router.back).toHaveBeenCalled();
  });

  it("has no 'Leave list'", async () => {
    await renderScreen();
    expect(screen.queryByRole('button', { name: 'Leave list' })).toBeNull();
  });

  it("'Invite' opens the Share sheet in invite mode", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Invite' }));
    expect(mockShareSheet).toHaveBeenLastCalledWith(expect.objectContaining({ listId: 'L-downtown', mode: 'invite' }));
  });

  it("a failed role change alerts \"Couldn't change the role\"; a 42501 alerts the not-allowed copy", async () => {
    jest.mocked(setRole).mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new NotAllowedError());
    await renderScreen();

    fireEvent.press(screen.getByRole('button', { name: '@ben · Can add spots' }));
    await pressAlertButton('View only');
    expect(lastAlert()[0]).toBe("Couldn't change the role. Try again.");
    expect(warn).toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: '@ben · Can add spots' }));
    await pressAlertButton('View only');
    expect(lastAlert()[0]).toBe("You can't do that in this list any more.");
  });

  it("a failed stop sharing alerts and stays", async () => {
    jest.mocked(stopSharing).mockResolvedValue(false);
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Stop sharing' }));
    await pressAlertButton('Stop sharing');
    expect(lastAlert()[0]).toBe("Couldn't stop sharing. Try again.");
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('Members screen as a member', () => {
  beforeEach(() => {
    signIn();
    setList(anas, [...spotsOf(ME, 5, 'm'), ...spotsOf('u-ana', 6, 'a')]);
  });

  it("lists the owner and members with no role menus; an invitation reads 'Invited rider'", async () => {
    await renderScreen();
    expect(screen.getByText('@ana (owner)')).toBeOnTheScreen();
    expect(screen.getByText('@me · Can add spots')).toBeOnTheScreen();
    expect(screen.getByText('@ben · Can add spots')).toBeOnTheScreen();
    expect(screen.getByText('Invited rider')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '@ben · Can add spots' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
  });

  it("'Leave list' alerts 'Leave Downtown?' / 'Your 5 spots in Downtown will leave it too.', then leaves and dismisses", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Leave list' }));

    const [title, message, buttons] = lastAlert();
    expect(title).toBe('Leave Downtown?');
    expect(message).toBe('Your 5 spots in Downtown will leave it too.');
    expect(buttons?.map((b) => b.text)).toEqual(['Cancel', 'Leave']);
    expect(leave).not.toHaveBeenCalled();

    await pressAlertButton('Leave');
    expect(leave).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown');
    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/lists');
    expect(useToastStore.getState().text).toBe('Left Downtown');
  });

  it("with none of my spots in it the Leave alert has no message", async () => {
    setList(anas, spotsOf('u-ana', 6, 'a'));
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Leave list' }));
    expect(lastAlert()[0]).toBe('Leave Downtown?');
    expect(lastAlert()[1]).toBeUndefined();
  });

  it('a failed leave alerts and stays', async () => {
    jest.mocked(leave).mockRejectedValue(new Error('boom'));
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Leave list' }));
    await pressAlertButton('Leave');
    expect(lastAlert()[0]).toBe("Couldn't leave the list. Try again.");
    expect(router.dismissAll).not.toHaveBeenCalled();
  });
});

describe('Members screen edge cases', () => {
  it("a list that is gone says 'This list is gone'", async () => {
    signIn();
    useHitListsStore.setState({ lists: [], membershipBySpot: {}, activeListId: null });
    await renderScreen();
    expect(screen.getByText('This list is gone')).toBeOnTheScreen();
  });

  it("the source never says 'Send', comments included", () => {
    const source = readFileSync(join(__dirname, '../../app/list/[id]/members.tsx'), 'utf8');
    expect(source).not.toMatch(/\bsend/i);
  });
});
