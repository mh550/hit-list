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
// The link calls are sync-links.test.ts's; here only what the screen asks of them (S9-03).
jest.mock('@/src/sync/links', () => ({
  ...jest.requireActual('@/src/sync/links'),
  createInviteLink: jest.fn(),
  revokeLink: jest.fn(),
  listMyLinks: jest.fn(),
}));
// The sheet is share-list-sheet.test.tsx's; here only that Invite opens it.
const mockShareSheet = jest.fn();
jest.mock('@/src/components/ShareListSheet', () => ({
  ShareListSheet: (props: unknown) => {
    mockShareSheet(props);
    return null;
  },
}));

import * as Clipboard from 'expo-clipboard';

import MembersScreen from '@/app/list/[id]/members';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { clearToast, useToastStore } from '@/src/stores/toast-store';
import { leave, NotAllowedError, removeMember, setRole, stopSharing } from '@/src/sync/lists';
import { createInviteLink, listMyLinks, revokeLink, type MyLink } from '@/src/sync/links';
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

const URL_ADD = 'http://localhost:8080/share/#t=AAAAAAAAAAAAAAAAAAAAAA';

const link = (over: Partial<MyLink> & Pick<MyLink, 'id'>): MyLink => ({
  kind: 'invite',
  sendId: null,
  listId: 'L-downtown',
  role: 'add',
  createdAt: '2026-10-23T12:00:00.000Z',
  expiresAt: '2026-10-30T12:00:00.000Z',
  usedBy: null,
  status: 'active',
  ...over,
});
/** This list's four links (one of each status) and an active one of another list. */
const LINKS: MyLink[] = [
  link({ id: 'k-active' }),
  link({
    id: 'k-used',
    role: 'view',
    status: 'used',
    usedBy: { id: 'u-ben', username: 'ben' },
  }),
  link({
    id: 'k-expired',
    expiresAt: '2026-10-20T12:00:00.000Z',
    status: 'expired',
  }),
  link({ id: 'k-revoked', role: 'view', status: 'revoked' }),
  link({
    id: 'k-other',
    listId: 'L-other',
    expiresAt: '2026-10-29T12:00:00.000Z',
  }),
];

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
  jest.mocked(createInviteLink).mockReset().mockResolvedValue(URL_ADD);
  jest.mocked(revokeLink).mockReset().mockResolvedValue(true);
  jest.mocked(listMyLinks).mockReset().mockResolvedValue([]);
  jest.mocked(Clipboard.setStringAsync).mockClear();
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

  it('a Stop sharing that ends after the screen was left still toasts but goes back nowhere (S8-09 review B#4)', async () => {
    let finish: (v: boolean) => void = () => {};
    jest.mocked(stopSharing).mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Stop sharing' }));
    const button = lastAlert()[2]?.find((b) => b.text === 'Stop sharing');
    let pressed: unknown;
    act(() => {
      pressed = button?.onPress?.();
    });
    screen.unmount();
    await act(async () => {
      finish(true);
      await pressed;
    });
    expect(useToastStore.getState().text).toBe('Stopped sharing Downtown');
    expect(router.back).not.toHaveBeenCalled();
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

describe('Members screen invite links (S9-03)', () => {
  beforeEach(() => signIn());

  it("the owner sees 'Invite link' and this list's links, loaded on mount; another list's are not shown", async () => {
    jest.mocked(listMyLinks).mockResolvedValue(LINKS);
    await renderScreen();
    expect(listMyLinks).toHaveBeenCalledWith(mockFake, ME, 'invite');
    expect(screen.getByRole('button', { name: 'Invite link' })).toBeOnTheScreen();
    expect(screen.getByText('Invite link · Can add spots · Active until Oct 30')).toBeOnTheScreen();
    expect(screen.getByText('Invite link · View only · Used by @ben')).toBeOnTheScreen();
    expect(screen.getByText('Invite link · Can add spots · Expired')).toBeOnTheScreen();
    expect(screen.getByText('Invite link · View only · Revoked')).toBeOnTheScreen();
    expect(screen.queryByText('Invite link · Can add spots · Active until Oct 29')).toBeNull();
  });

  it('only the active link has Revoke (none on used, expired or revoked rows)', async () => {
    jest.mocked(listMyLinks).mockResolvedValue(LINKS);
    await renderScreen();
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
  });

  it("a used link with no username reads 'Used'", async () => {
    jest.mocked(listMyLinks).mockResolvedValue([
      link({
        id: 'k-used',
        status: 'used',
        usedBy: { id: 'u-x', username: null },
      }),
    ]);
    await renderScreen();
    expect(screen.getByText('Invite link · Can add spots · Used')).toBeOnTheScreen();
  });

  it("'Invite link' asks 'What can they do?'; 'Can add spots' makes an 'add' link, copies it, toasts and reloads", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Invite link' }));
    const [title, message, buttons] = lastAlert();
    expect(title).toBe('Invite link');
    expect(message).toBe('What can they do?');
    expect(buttons?.map((b) => b.text)).toEqual(['Can add spots', 'View only', 'Cancel']);
    expect(buttons?.find((b) => b.text === 'Cancel')?.style).toBe('cancel');
    expect(createInviteLink).not.toHaveBeenCalled();

    jest
      .mocked(listMyLinks)
      .mockClear()
      .mockResolvedValue([link({ id: 'k-new' })]);
    await pressAlertButton('Can add spots');
    expect(createInviteLink).toHaveBeenCalledWith(mockFake, ME, 'L-downtown', 'add');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(URL_ADD);
    expect(useToastStore.getState().text).toBe('Link copied · works once, 7 days');
    expect(listMyLinks).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Invite link · Can add spots · Active until Oct 30')).toBeOnTheScreen();
  });

  it("'View only' makes a 'view' link", async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Invite link' }));
    await pressAlertButton('View only');
    expect(createInviteLink).toHaveBeenCalledWith(mockFake, ME, 'L-downtown', 'view');
  });

  it('a failed or refused link alerts "Couldn\'t make the link. Try again." and copies nothing', async () => {
    jest.mocked(createInviteLink).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(null);
    await renderScreen();
    for (let i = 0; i < 2; i++) {
      fireEvent.press(screen.getByRole('button', { name: 'Invite link' }));
      await pressAlertButton('Can add spots');
      expect(lastAlert()[0]).toBe("Couldn't make the link. Try again.");
    }
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(useToastStore.getState().text).toBeNull();
  });

  it('a second role choice while a link is being made does nothing', async () => {
    let finish: (v: string) => void = () => {};
    jest.mocked(createInviteLink).mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Invite link' }));
    const first = lastAlert()[2]?.find((b) => b.text === 'Can add spots');
    let pressed: unknown;
    act(() => {
      pressed = first?.onPress?.();
    });
    fireEvent.press(screen.getByRole('button', { name: 'Invite link' }));
    await pressAlertButton('View only');
    expect(createInviteLink).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(URL_ADD);
      await pressed;
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  });

  it("Revoke confirms 'Revoke this invite link?' / 'Nobody can join with it now.', then revokes and reloads", async () => {
    jest.mocked(listMyLinks).mockResolvedValue(LINKS);
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Revoke' }));
    const [title, message, buttons] = lastAlert();
    expect(title).toBe('Revoke this invite link?');
    expect(message).toBe('Nobody can join with it now.');
    expect(buttons?.map((b) => b.text)).toEqual(['Cancel', 'Revoke']);
    expect(buttons?.find((b) => b.text === 'Revoke')?.style).toBe('destructive');
    expect(revokeLink).not.toHaveBeenCalled();

    jest
      .mocked(listMyLinks)
      .mockClear()
      .mockResolvedValue([link({ id: 'k-active', status: 'revoked' })]);
    await pressAlertButton('Revoke');
    expect(revokeLink).toHaveBeenCalledWith(mockFake, ME, 'k-active');
    expect(listMyLinks).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Invite link · Can add spots · Revoked')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('a failed revoke alerts "Couldn\'t revoke the link. Try again."', async () => {
    jest.mocked(listMyLinks).mockResolvedValue(LINKS);
    jest.mocked(revokeLink).mockRejectedValueOnce(new Error('boom'));
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Revoke' }));
    await pressAlertButton('Revoke');
    expect(lastAlert()[0]).toBe("Couldn't revoke the link. Try again.");
  });

  it('a member sees no invite link row, no links and loads none', async () => {
    setList(anas, spotsOf('u-ana', 6, 'a'));
    jest.mocked(listMyLinks).mockResolvedValue(LINKS);
    await renderScreen();
    expect(screen.queryByRole('button', { name: 'Invite link' })).toBeNull();
    expect(screen.queryByText(/Invite link ·/)).toBeNull();
    expect(listMyLinks).not.toHaveBeenCalled();
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
