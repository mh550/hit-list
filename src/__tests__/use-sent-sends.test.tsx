// useSentSends (S7-03, S9-03): the Sent screen's data, loaded with listSent and listSentLinks when it mounts and again
// on refresh.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';
import { ME, adoptPhoneFor } from './helpers/outbox';

let mockDb: SQLiteDatabase;
let mockFake: FakeSupabase | null = null;
jest.mock('expo-sqlite', () => ({
  ...jest.requireActual('expo-sqlite'),
  useSQLiteContext: () => mockDb,
}));
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));

import { useSentSends } from '@/src/hooks/use-sent-sends';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import * as sendsModule from '@/src/sync/sends';

const BEN = '00000000-0000-4000-8000-0000000000b1';
const SEND = '00000000-0000-4000-8000-000000000601';
const LINK_SEND = '00000000-0000-4000-8000-000000000602';

const linkRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1',
  kind: 'send',
  send_id: LINK_SEND,
  list_id: null,
  role: null,
  created_at: '2026-10-22T10:00:00+00:00',
  expires_at: null,
  revoked_at: null,
  used_at: null,
  used_by: null,
  used_by_username: null,
  ...overrides,
});

const sentRow = (overrides: Record<string, unknown> = {}) => ({
  id: SEND,
  sender: ME,
  recipient: BEN,
  payload: { v: 1, sender: { username: 'me_me', display_name: null }, spots: [{ id: 's1' }, { id: 's2' }] },
  created_at: '2026-10-22 10:00:00+00',
  saved_at: null,
  dismissed_at: null,
  withdrawn_at: null,
  ...overrides,
});

beforeEach(async () => {
  mockDb = await createMigratedTestDb();
  await adoptPhoneFor(mockDb, ME);
  mockFake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  mockFake.tables.sends = [sentRow()];
  mockFake.profiles.set(BEN, { username: 'ben', display_name: null });
  useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: ME, username: 'me_me' });
});

it('loads what the rider sent when it mounts', async () => {
  const { result } = renderHook(() => useSentSends());
  expect(result.current.sends).toBeNull();

  await waitFor(() => expect(result.current.sends).not.toBeNull());
  expect(result.current.sends?.map((s) => [s.to.username, s.count, s.status])).toEqual([['ben', 2, 'waiting']]);
  expect(result.current.error).toBe(false);
  // one read for the friend sends, one for the link-only sends behind the (here empty) links
  expect(mockFake!.selects.filter((s) => s.table === 'sends')).toHaveLength(2);
  expect(result.current.links).toEqual([]);
});

it("also loads the rider's send links, each with its link-only send's count", async () => {
  mockFake!.tables.sends = [sentRow(), sentRow({ id: LINK_SEND, recipient: null })];
  mockFake!.rpcHandlers.list_my_links = () => ({ data: [linkRow()], error: null });
  const { result } = renderHook(() => useSentSends());
  expect(result.current.links).toBeNull();

  await waitFor(() => expect(result.current.links).not.toBeNull());
  expect(result.current.links?.map((l) => [l.id, l.count, l.status, l.expiresAt])).toEqual([
    ['link-1', 2, 'active', null],
  ]);
  expect(result.current.sends?.map((s) => s.id)).toEqual([SEND]);
  expect(mockFake!.rpcs.filter((r) => r.fn === 'list_my_links')).toEqual([
    { fn: 'list_my_links', args: { p_kind: 'send' } },
  ]);
});

it('refresh reads the links again', async () => {
  mockFake!.tables.sends = [sentRow(), sentRow({ id: LINK_SEND, recipient: null })];
  mockFake!.rpcHandlers.list_my_links = () => ({ data: [linkRow()], error: null });
  const { result } = renderHook(() => useSentSends());
  await waitFor(() => expect(result.current.links).not.toBeNull());
  mockFake!.rpcHandlers.list_my_links = () => ({ data: [linkRow({ revoked_at: '2026-10-22T11:00:00+00:00' })], error: null });

  await act(() => result.current.refresh());

  expect(result.current.links?.map((l) => l.status)).toEqual(['revoked']);
});

it('a failed links read shows as error and still shows the friend sends', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFake!.failNext('rpc', { message: 'offline' }, 'list_my_links');
  const { result } = renderHook(() => useSentSends());

  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.sends?.map((s) => s.id)).toEqual([SEND]);
  expect(result.current.links).toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sends]'), 'offline');
  warn.mockRestore();
});

it('a failed links refresh keeps the links that were there', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFake!.tables.sends = [sentRow(), sentRow({ id: LINK_SEND, recipient: null })];
  mockFake!.rpcHandlers.list_my_links = () => ({ data: [linkRow()], error: null });
  const { result } = renderHook(() => useSentSends());
  await waitFor(() => expect(result.current.links).not.toBeNull());
  mockFake!.failNext('rpc', { message: 'offline' }, 'list_my_links');

  await act(() => result.current.refresh());

  expect(result.current.error).toBe(true);
  expect(result.current.links?.map((l) => l.id)).toEqual(['link-1']);
  warn.mockRestore();
});

it('refresh reads again', async () => {
  const { result } = renderHook(() => useSentSends());
  await waitFor(() => expect(result.current.sends).not.toBeNull());
  mockFake!.tables.sends = [sentRow({ saved_at: '2026-10-22 11:00:00+00' })];

  await act(() => result.current.refresh());

  expect(result.current.sends?.map((s) => s.status)).toEqual(['saved']);
});

it('a server error shows as error and keeps what was there', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // the friend sends' read (the link-only sends' read filters on recipient is null)
  mockFake!.failSelect(
    (s) => s.table === 'sends' && !s.filters.some((f) => f[0] === 'is' && f[1] === 'recipient'),
    { message: 'offline' },
  );
  const { result } = renderHook(() => useSentSends());

  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.sends).toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sends]'), 'offline');
  warn.mockRestore();
});

it('signed out it reads nothing', async () => {
  useAuthStore.setState({ ...SIGNED_OUT });
  const { result } = renderHook(() => useSentSends());
  await act(async () => {});
  expect(result.current.sends).toBeNull();
  expect(result.current.links).toBeNull();
  expect(mockFake!.selects).toEqual([]);
  expect(mockFake!.rpcs).toEqual([]);
});

it('an older read that ends after a newer one never replaces it', async () => {
  const { result } = renderHook(() => useSentSends());
  await waitFor(() => expect(result.current.sends).not.toBeNull());
  const sent = (status: 'waiting' | 'withdrawn') => [
    { id: SEND, to: { id: BEN, username: 'ben', display_name: null }, count: 2, status, created_at: '', photoPaths: [] },
  ];
  let openOld!: (value: ReturnType<typeof sent>) => void;
  const spy = jest
    .spyOn(sendsModule, 'listSent')
    .mockImplementationOnce(() => new Promise((resolve) => (openOld = resolve)))
    .mockResolvedValueOnce(sent('withdrawn'));

  let older!: Promise<void>;
  act(() => {
    older = result.current.refresh();
  });
  await act(() => result.current.refresh());
  expect(result.current.sends?.map((s) => s.status)).toEqual(['withdrawn']);
  await act(async () => {
    openOld(sent('waiting'));
    await older;
  });

  expect(result.current.sends?.map((s) => s.status)).toEqual(['withdrawn']);
  spy.mockRestore();
});
