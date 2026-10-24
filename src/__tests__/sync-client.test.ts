// getSupabase(): no client without both EXPO_PUBLIC_ values; one cached client with them, whose token
// refresh follows AppState (Supabase's Expo guide; GoTrueClient.d.ts startAutoRefresh/stopAutoRefresh).
import { AppState, type AppStateStatus } from 'react-native';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
  })),
}));

type ClientModule = typeof import('@/src/sync/client');
type SupabaseModule = { createClient: jest.Mock };

const URL_VALUE = 'http://127.0.0.1:54321';
const KEY_VALUE = 'anon-key-for-tests';
const saved = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY };

function setEnv(url: string | undefined, key: string | undefined) {
  if (url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = url;
  if (key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = key;
}

// A fresh module registry per test, so the cached client never leaks between cases.
function load(): { client: ClientModule; supabase: SupabaseModule } {
  let client!: ClientModule;
  let supabase!: SupabaseModule;
  jest.isolateModules(() => {
    client = jest.requireActual('@/src/sync/client');
    supabase = jest.requireMock('@supabase/supabase-js');
  });
  return { client, supabase };
}

let appStateListeners: ((state: AppStateStatus) => void)[];

beforeEach(() => {
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  setEnv(saved.url, saved.key);
  jest.restoreAllMocks();
});

describe('getSupabase', () => {
  it('returns null and isConfigured() is false when the URL is unset', () => {
    setEnv(undefined, KEY_VALUE);
    const { client, supabase } = load();

    expect(client.getSupabase()).toBeNull();
    expect(client.isConfigured()).toBe(false);
    expect(supabase.createClient).not.toHaveBeenCalled();
  });

  it('returns null when only the URL is set', () => {
    setEnv(URL_VALUE, undefined);
    const { client } = load();

    expect(client.getSupabase()).toBeNull();
  });

  it('returns null when a value is only whitespace', () => {
    setEnv(URL_VALUE, '   ');
    const { client } = load();

    expect(client.getSupabase()).toBeNull();
    expect(client.isConfigured()).toBe(false);
  });

  it('builds one client with the URL, the key and the session options, and returns it every call', () => {
    setEnv(URL_VALUE, KEY_VALUE);
    const { client, supabase } = load();

    const first = client.getSupabase();
    const second = client.getSupabase();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(client.isConfigured()).toBe(true);
    expect(supabase.createClient).toHaveBeenCalledTimes(1);
    expect(supabase.createClient).toHaveBeenCalledWith(URL_VALUE, KEY_VALUE, {
      auth: expect.objectContaining({
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // A fixed key, so a sign out that auth-js can't finish (offline, expired token) can clear it itself.
        storageKey: 'hitlist.auth.session',
        storage: expect.objectContaining({
          getItem: expect.any(Function),
          setItem: expect.any(Function),
          removeItem: expect.any(Function),
        }),
      }),
    });
  });

  it('starts token refresh when the app is active and stops it in the background', () => {
    setEnv(URL_VALUE, KEY_VALUE);
    const { client } = load();
    const auth = client.getSupabase()!.auth as unknown as { startAutoRefresh: jest.Mock; stopAutoRefresh: jest.Mock };

    expect(appStateListeners).toHaveLength(1);
    appStateListeners[0]('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();

    appStateListeners[0]('background');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    // A second getSupabase() adds no second listener.
    client.getSupabase();
    expect(appStateListeners).toHaveLength(1);
  });
});
