// A hand-written stand-in for the supabase-js client: only the members the app uses, with the names
// and { data, error } shapes copied from
//   node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts (getSession, onAuthStateChange →
//     { data: { subscription: { unsubscribe } } }, signInWithOtp, verifyOtp → { data: { user, session } },
//     signOut(options?), startAutoRefresh, stopAutoRefresh; Session/User in lib/types.d.ts)
//   node_modules/@supabase/postgrest-js/dist/index.d.mts (from(t).select(cols).eq(c, v).maybeSingle(),
//     from(t).update(v).eq(c, v), optionally .select(cols) to get the updated rows back (else data null); a
//     thenable { data, error }, PostgrestError has message/details/hint/code)
//     from(t).upsert(values, { onConflict?, ignoreDuplicates? }), from(t).delete().eq(c, v)
//   node_modules/@supabase/storage-js/dist/index.d.mts (storage.from(bucket).upload(path, fileBody, fileOptions?) →
//     { data: { id, path, fullPath }, error: null } | { data: null, error: StorageError })
//   node_modules/@supabase/functions-js/dist/module/FunctionsClient.d.ts (functions.invoke(name, options?))
// Every member is a jest.fn. Screens get it with
//   jest.mock('@/src/sync/client', () => ({ getSupabase: () => mockFake, isConfigured: () => true }))
// The fake keeps one session and a `profiles` table; `failNext(method, error)` makes the next call of
// that method answer { data: null, error }; `queryDelayMs` slows every query down. Every upsert, delete and upload
// is logged in `calls`, in the order the app awaited them (the push tests read the order there).
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type FakeError = { message: string; code?: string; status?: number };
type Listener = (event: AuthChangeEvent, session: Session | null) => void;
type FailMethod =
  | 'getSession'
  | 'signInWithOtp'
  | 'verifyOtp'
  | 'signOut'
  | 'select'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'upload'
  | 'invoke';
export type FakeCall =
  | { kind: 'upsert'; table: string; values: Record<string, unknown>; options?: UpsertOptions }
  | { kind: 'delete'; table: string; filters: [string, unknown][] }
  | { kind: 'upload'; bucket: string; path: string; body: unknown; options?: UploadOptions };
type UpsertOptions = { onConflict?: string; ignoreDuplicates?: boolean };
type UploadOptions = { contentType?: string; upsert?: boolean };
export interface FakeProfile {
  username: string | null;
  display_name: string | null;
}

export function fakeSession({ userId = 'user-ana', email = 'ana@example.com' } = {}): Session {
  return {
    access_token: `access-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    expires_at: 4102444800,
    token_type: 'bearer',
    user: {
      id: userId,
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-23T00:00:00.000Z',
    },
  };
}

export function createFakeSupabase(opts: { session?: Session | null; userId?: string } = {}) {
  let session: Session | null = opts.session ?? null;
  const listeners = new Set<Listener>();
  const failures = new Map<FailMethod, FakeError>();
  const profiles = new Map<string, FakeProfile>();
  const calls: FakeCall[] = [];

  const takeFailure = (method: FailMethod) => {
    const error = failures.get(method);
    failures.delete(method);
    return error;
  };
  const emit = (event: AuthChangeEvent, next: Session | null) => {
    for (const listener of [...listeners]) listener(event, next);
  };

  type QueryResult = { data: unknown; error: FakeError | null };
  interface FakeQuery extends PromiseLike<QueryResult> {
    select: jest.Mock<FakeQuery, [columns?: string]>;
    update: jest.Mock<FakeQuery, [values: Partial<FakeProfile>]>;
    upsert: jest.Mock<FakeQuery, [values: Record<string, unknown>, options?: UpsertOptions]>;
    delete: jest.Mock<FakeQuery, [options?: { count?: string }]>;
    eq: jest.Mock<FakeQuery, [column: string, value: unknown]>;
    maybeSingle: jest.Mock<FakeQuery, []>;
  }

  // A PostgREST builder: chainable, and awaiting it runs the query against `profiles`.
  function query(table: string): FakeQuery {
    let op: 'select' | 'update' | 'upsert' | 'delete' = 'select';
    let values: Partial<FakeProfile> = {};
    let upserted: Record<string, unknown> = {};
    let upsertOptions: UpsertOptions | undefined;
    let one = false;
    // update(…).select(): answer the updated rows (only `id`: the app asks for nothing else).
    let returning = false;
    const filters: [string, unknown][] = [];

    const run = (): QueryResult => {
      if (op === 'upsert') calls.push({ kind: 'upsert', table, values: upserted, options: upsertOptions });
      if (op === 'delete') calls.push({ kind: 'delete', table, filters: [...filters] });
      const error = takeFailure(op);
      if (error) return { data: null, error };
      if (op === 'upsert' || op === 'delete') return { data: null, error: null };
      if (table !== 'profiles') return { data: one ? null : [], error: null };
      const rows = [...profiles.entries()]
        .map(([id, row]) => ({ id, ...row }))
        .filter((row) => filters.every(([column, value]) => row[column as keyof typeof row] === value));
      if (op === 'update') {
        for (const row of rows) profiles.set(row.id, { ...profiles.get(row.id)!, ...values });
        return { data: returning ? rows.map(({ id }) => ({ id })) : null, error: null };
      }
      return { data: one ? (rows[0] ?? null) : rows, error: null };
    };

    const builder: FakeQuery = {
      select: jest.fn((_columns?: string) => {
        if (op === 'update') returning = true;
        else op = 'select';
        return builder;
      }),
      update: jest.fn((next: Partial<FakeProfile>) => {
        op = 'update';
        values = next;
        return builder;
      }),
      upsert: jest.fn((next: Record<string, unknown>, options?: UpsertOptions) => {
        op = 'upsert';
        upserted = next;
        upsertOptions = options;
        return builder;
      }),
      delete: jest.fn((_options?: { count?: string }) => {
        op = 'delete';
        return builder;
      }),
      eq: jest.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      }),
      maybeSingle: jest.fn(() => {
        one = true;
        return builder;
      }),
      then(resolve, reject) {
        const wait = fake.queryDelayMs > 0 ? new Promise((done) => setTimeout(done, fake.queryDelayMs)) : Promise.resolve();
        return wait.then(run).then(resolve, reject);
      },
    };
    return builder;
  }

  const fake = {
    auth: {
      getSession: jest.fn(async () => {
        const error = takeFailure('getSession');
        if (error) return { data: { session: null }, error };
        return { data: { session }, error: null };
      }),
      onAuthStateChange: jest.fn((callback: Listener) => {
        listeners.add(callback);
        return { data: { subscription: { id: 'fake', callback, unsubscribe: jest.fn(() => listeners.delete(callback)) } } };
      }),
      signInWithOtp: jest.fn(async (_credentials: { email: string; options?: { shouldCreateUser?: boolean } }) => {
        const error = takeFailure('signInWithOtp');
        if (error) return { data: { user: null, session: null }, error };
        return { data: { user: null, session: null }, error: null };
      }),
      verifyOtp: jest.fn(async ({ email }: { email: string; token: string; type: 'email' }) => {
        const error = takeFailure('verifyOtp');
        if (error) return { data: { user: null, session: null }, error };
        session = fakeSession({ userId: opts.userId ?? 'user-ana', email });
        emit('SIGNED_IN', session);
        return { data: { user: session.user, session }, error: null };
      }),
      signOut: jest.fn(async (_options?: { scope?: 'global' | 'local' | 'others' }) => {
        const error = takeFailure('signOut');
        if (error) return { error };
        session = null;
        emit('SIGNED_OUT', null);
        return { error: null };
      }),
      startAutoRefresh: jest.fn(async () => {}),
      stopAutoRefresh: jest.fn(async () => {}),
    },
    from: jest.fn((table: string) => query(table)),
    storage: {
      from: jest.fn((bucket: string) => ({
        upload: jest.fn(async (path: string, body: unknown, options?: UploadOptions) => {
          calls.push({ kind: 'upload', bucket, path, body, options });
          const error = takeFailure('upload');
          if (error) return { data: null, error };
          return { data: { id: `object-${path}`, path, fullPath: `${bucket}/${path}` }, error: null };
        }),
      })),
    },
    functions: {
      invoke: jest.fn(async (_name: string, _options?: { body?: unknown }) => {
        const error = takeFailure('invoke');
        if (error) return { data: null, error };
        return { data: { ok: true }, error: null };
      }),
    },

    // Test hooks.
    profiles,
    calls,
    /** Makes every query answer after this many ms (an in-flight fetch racing an auth event). */
    queryDelayMs: 0,
    listenerCount: () => listeners.size,
    setSession(next: Session | null) {
      session = next;
    },
    emit(event: AuthChangeEvent, next: Session | null) {
      session = next;
      emit(event, next);
    },
    failNext(method: FailMethod, error: FakeError) {
      failures.set(method, error);
    },
  };
  return fake;
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
