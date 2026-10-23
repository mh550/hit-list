// useSentSends (S7-03): the Sent screen's data, loaded with listSent when it mounts and again on refresh.
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
  expect(mockFake!.selects.filter((s) => s.table === 'sends')).toHaveLength(1);
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
  mockFake!.failSelect((s) => s.table === 'sends', { message: 'offline' });
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
  expect(mockFake!.selects).toEqual([]);
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
