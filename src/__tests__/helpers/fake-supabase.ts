// A hand-written stand-in for the supabase-js client: only the members the app uses, with the names
// and { data, error } shapes copied from
//   node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts (getSession, onAuthStateChange →
//     { data: { subscription: { unsubscribe } } }, signInWithOtp, verifyOtp → { data: { user, session } },
//     signOut(options?), startAutoRefresh, stopAutoRefresh; Session/User in lib/types.d.ts)
//   node_modules/@supabase/postgrest-js/dist/index.d.mts (from(t).select(cols).eq(c, v).maybeSingle(),
//     from(t).update(v).eq(c, v), optionally .select(cols) to get the updated rows back (else data null); a
//     thenable { data, error }, PostgrestError has message/details/hint/code)
//     from(t).upsert(values, { onConflict?, ignoreDuplicates? }), from(t).delete().eq(c, v),
//     from(t).select(cols).gt(c, v).in(c, values).order(c).limit(n), .range(from, to) (both inclusive))
//   node_modules/@supabase/storage-js/dist/index.d.mts (storage.from(bucket).upload(path, fileBody, fileOptions?) →
//     { data: { id, path, fullPath }, error: null } | { data: null, error: StorageError };
//     storage.from(bucket).download(path) → { data: Blob, error: null } | { data: null, error: StorageError };
//     copy(fromPath, toPath) → { data: { path } }; remove(paths) → { data: FileObject[] } (only the objects it
//     found: 0 rows is not an error); createSignedUrl(path, expiresIn) → { data: { signedUrl } })
//   node_modules/@supabase/functions-js/dist/module/FunctionsClient.d.ts (functions.invoke(name, options?))
//   node_modules/@supabase/supabase-js/dist/index.d.mts (rpc(fn, args?) → a thenable { data, error }; a set-returning
//     function such as find_profile answers an array)
// Every member is a jest.fn. Screens get it with
//   jest.mock('@/src/sync/client', () => ({ getSupabase: () => mockFake, isConfigured: () => true }))
// The fake keeps one session and a `profiles` table; `failNext(method, error, table?)` makes the next call of
// that method (on that table, or rpc function) answer { data: null, error }; `queryDelayMs` slows every query down.
// Every upsert, update, delete, upload, copy, remove and rpc is logged in `calls`, in the order the app awaited them (the push
// and send tests read the order there). Selects answer from `tables`, `profiles` from the `profiles` map (filters, order and limit applied;
// each select logged in `selects`); `readableProfiles` (a set of ids, null = all) mimics the profiles RLS. rpc calls
// are logged in `rpcs` and answered by `rpcHandlers[fn]` (no handler: { data: null, error: null }); storage downloads
// answer from `objects`. An update on a table other than `profiles` changes the matching rows of `tables[table]`
// (`.select(cols)` answers them; `updateAnswers[table]` overrides what it answers, e.g. [] for RLS hiding the row).
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
  | 'download'
  | 'invoke'
  | 'rpc'
  | 'copy'
  | 'remove'
  | 'createSignedUrl';
export type FakeCall =
  // an array upsert logs its rows in `rows` (and the first one as `values`)
  | { kind: 'upsert'; table: string; values: Record<string, unknown>; rows?: Record<string, unknown>[]; options?: UpsertOptions }
  | { kind: 'update'; table: string; values: Record<string, unknown>; filters: [string, unknown][] }
  | { kind: 'delete'; table: string; filters: [string, unknown][] }
  | { kind: 'upload'; bucket: string; path: string; body: unknown; options?: UploadOptions }
  | { kind: 'copy'; bucket: string; from: string; to: string }
  | { kind: 'remove'; bucket: string; paths: string[] }
  | { kind: 'rpc'; fn: string; args: Record<string, unknown> | undefined };
type UpsertOptions = { onConflict?: string; ignoreDuplicates?: boolean };
type UploadOptions = { contentType?: string; upsert?: boolean };
type Row = Record<string, unknown>;
type Filter = ['eq' | 'gt' | 'is', string, unknown] | ['in', string, unknown[]];
/** One awaited select: what the app asked the server. */
export interface FakeSelect {
  table: string;
  columns?: string;
  filters: Filter[];
  order: string[];
  limit?: number;
  range?: [number, number];
}
export interface FakeProfile {
  username: string | null;
  display_name: string | null;
}
type RpcResult = { data: unknown; error: FakeError | null };
/** One awaited rpc call. */
export interface FakeRpc {
  fn: string;
  args: Record<string, unknown> | undefined;
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
  const failures = new Map<string, FakeError>();
  const profiles = new Map<string, FakeProfile>();
  const calls: FakeCall[] = [];
  const selects: FakeSelect[] = [];
  const rpcs: FakeRpc[] = [];
  const rpcHandlers: Record<string, (args: Record<string, unknown> | undefined) => RpcResult> = {};
  /** The server's rows per table (not `profiles`), as PostgREST returns them. */
  const tables: Record<string, Row[]> = {};
  /** Storage objects by `<bucket>/<path>`. */
  const objects = new Map<string, Uint8Array>();
  /** What an update on a table answers instead of the rows it changed (RLS hiding them: []). */
  const updateAnswers: Record<string, Row[]> = {};
  /** One-shot select failures picked by what the select asked for (see failSelect). */
  const selectFailures: { match: (select: FakeSelect) => boolean; error: FakeError }[] = [];

  /** A failure set for this table first, then one for any table. */
  const takeFailure = (method: FailMethod, table?: string) => {
    for (const key of [`${method}:${table}`, method] as const) {
      const error = failures.get(key);
      if (error) {
        failures.delete(key);
        return error;
      }
    }
    return undefined;
  };
  const emit = (event: AuthChangeEvent, next: Session | null) => {
    for (const listener of [...listeners]) listener(event, next);
  };

  type QueryResult = { data: unknown; error: FakeError | null };
  interface FakeQuery extends PromiseLike<QueryResult> {
    select: jest.Mock<FakeQuery, [columns?: string]>;
    update: jest.Mock<FakeQuery, [values: Record<string, unknown>]>;
    upsert: jest.Mock<FakeQuery, [values: Record<string, unknown> | Record<string, unknown>[], options?: UpsertOptions]>;
    delete: jest.Mock<FakeQuery, [options?: { count?: string }]>;
    eq: jest.Mock<FakeQuery, [column: string, value: unknown]>;
    gt: jest.Mock<FakeQuery, [column: string, value: unknown]>;
    in: jest.Mock<FakeQuery, [column: string, values: readonly unknown[]]>;
    is: jest.Mock<FakeQuery, [column: string, value: null | boolean]>;
    order: jest.Mock<FakeQuery, [column: string, options?: { ascending?: boolean }]>;
    limit: jest.Mock<FakeQuery, [count: number]>;
    range: jest.Mock<FakeQuery, [from: number, to: number]>;
    maybeSingle: jest.Mock<FakeQuery, []>;
  }

  const compare = (a: unknown, b: unknown) => ((a as number | string) < (b as number | string) ? -1 : a === b ? 0 : 1);

  /** The `profiles` map as rows, only those `readableProfiles` lets this session read. */
  const profileRows = (): Row[] =>
    [...profiles.entries()]
      .filter(([id]) => fake.readableProfiles === null || fake.readableProfiles.has(id))
      .map(([id, row]) => ({ id, ...row }));

  /** A select on `tables[table]` (or the profiles): filters, then order, then limit, columns picked from `columns`. */
  function selectRows(
    table: string,
    columns: string | undefined,
    filters: Filter[],
    order: string[],
    limit?: number,
    range?: [number, number],
  ) {
    let rows = (table === 'profiles' ? profileRows() : (tables[table] ?? [])).filter((row) =>
      filters.every(([op, column, value]) => {
        if (op === 'eq') return row[column] === value;
        // SQL: NULL > x is not true
        if (op === 'gt') return row[column] != null && compare(row[column], value) > 0;
        if (op === 'is') return (row[column] ?? null) === value;
        return (value as unknown[]).includes(row[column]);
      }),
    );
    rows = [...rows].sort((a, b) => {
      for (const column of order) {
        const c = compare(a[column], b[column]);
        if (c !== 0) return c;
      }
      return 0;
    });
    if (range !== undefined) rows = rows.slice(range[0], range[1] + 1);
    if (limit !== undefined) rows = rows.slice(0, limit);
    if (!columns || columns === '*') return rows.map((row) => ({ ...row }));
    const picked = columns.split(',').map((c) => c.trim());
    return rows.map((row) => Object.fromEntries(picked.map((c) => [c, row[c]])));
  }

  // A PostgREST builder: chainable, and awaiting it runs the query against `profiles`.
  function query(table: string): FakeQuery {
    let op: 'select' | 'update' | 'upsert' | 'delete' = 'select';
    let values: Record<string, unknown> = {};
    let upserted: Record<string, unknown> | Record<string, unknown>[] = {};
    let upsertOptions: UpsertOptions | undefined;
    let one = false;
    // update(…).select(): answer the updated rows (only `id`: the app asks for nothing else).
    let returning = false;
    let columns: string | undefined;
    const filters: [string, unknown][] = [];
    const selectFilters: Filter[] = [];
    const order: string[] = [];
    let limit: number | undefined;
    let range: [number, number] | undefined;
    let returnColumns: string | undefined;

    const run = (): QueryResult => {
      if (op === 'upsert') {
        calls.push(
          Array.isArray(upserted)
            ? { kind: 'upsert', table, values: upserted[0] ?? {}, rows: upserted, options: upsertOptions }
            : { kind: 'upsert', table, values: upserted, options: upsertOptions },
        );
      }
      if (op === 'delete') calls.push({ kind: 'delete', table, filters: [...filters] });
      if (op === 'update' && table !== 'profiles') calls.push({ kind: 'update', table, values, filters: [...filters] });
      if (op === 'select') {
        const select: FakeSelect = { table, columns, filters: [...selectFilters], order: [...order], limit };
        if (range) select.range = range;
        selects.push(select);
        const failure = selectFailures.findIndex(({ match }) => match(select));
        if (failure >= 0) return { data: null, error: selectFailures.splice(failure, 1)[0].error };
      }
      const error = takeFailure(op, table);
      if (error) return { data: null, error };
      if (op === 'upsert' || op === 'delete') return { data: null, error: null };
      if (op === 'update' && table !== 'profiles') {
        const rows = (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
        for (const row of rows) Object.assign(row, values);
        if (!returning) return { data: null, error: null };
        const answer = updateAnswers[table] ?? rows;
        if (!returnColumns || returnColumns === '*') return { data: answer.map((row) => ({ ...row })), error: null };
        const picked = returnColumns.split(',').map((c) => c.trim());
        return { data: answer.map((row) => Object.fromEntries(picked.map((c) => [c, row[c]]))), error: null };
      }
      if (op === 'update') {
        const rows = profileRows().filter((row) => filters.every(([column, value]) => row[column] === value));
        for (const row of rows) {
          profiles.set(row.id as string, { ...profiles.get(row.id as string)!, ...(values as Partial<FakeProfile>) });
        }
        return { data: returning ? rows.map(({ id }) => ({ id })) : null, error: null };
      }
      const rows = selectRows(table, columns, selectFilters, order, limit, range);
      return { data: one ? (rows[0] ?? null) : rows, error: null };
    };

    const builder: FakeQuery = {
      select: jest.fn((cols?: string) => {
        if (op === 'update') {
          returning = true;
          returnColumns = cols;
        } else {
          op = 'select';
          columns = cols;
        }
        return builder;
      }),
      update: jest.fn((next: Record<string, unknown>) => {
        op = 'update';
        values = next;
        return builder;
      }),
      upsert: jest.fn((next: Record<string, unknown> | Record<string, unknown>[], options?: UpsertOptions) => {
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
        selectFilters.push(['eq', column, value]);
        return builder;
      }),
      gt: jest.fn((column: string, value: unknown) => {
        selectFilters.push(['gt', column, value]);
        return builder;
      }),
      in: jest.fn((column: string, values: readonly unknown[]) => {
        selectFilters.push(['in', column, [...values]]);
        return builder;
      }),
      is: jest.fn((column: string, value: null | boolean) => {
        selectFilters.push(['is', column, value]);
        return builder;
      }),
      order: jest.fn((column: string, _options?: { ascending?: boolean }) => {
        order.push(column);
        return builder;
      }),
      limit: jest.fn((count: number) => {
        limit = count;
        return builder;
      }),
      range: jest.fn((from: number, to: number) => {
        range = [from, to];
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
    rpc: jest.fn((fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult> => ({
      then(resolve, reject) {
        const wait = fake.queryDelayMs > 0 ? new Promise((done) => setTimeout(done, fake.queryDelayMs)) : Promise.resolve();
        return wait
          .then((): RpcResult => {
            rpcs.push({ fn, args });
            calls.push({ kind: 'rpc', fn, args });
            const error = takeFailure('rpc', fn);
            if (error) return { data: null, error };
            return rpcHandlers[fn]?.(args) ?? { data: null, error: null };
          })
          .then(resolve, reject);
      },
    })),
    storage: {
      from: jest.fn((bucket: string) => ({
        upload: jest.fn(async (path: string, body: unknown, options?: UploadOptions) => {
          calls.push({ kind: 'upload', bucket, path, body, options });
          const error = takeFailure('upload');
          if (error) return { data: null, error };
          objects.set(`${bucket}/${path}`, body as Uint8Array);
          return { data: { id: `object-${path}`, path, fullPath: `${bucket}/${path}` }, error: null };
        }),
        download: jest.fn(async (path: string) => {
          const error = takeFailure('download');
          if (error) return { data: null, error };
          const bytes = objects.get(`${bucket}/${path}`);
          if (!bytes) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
          return { data: new Blob([bytes as BlobPart], { type: 'image/jpeg' }), error: null };
        }),
        copy: jest.fn(async (from: string, to: string) => {
          calls.push({ kind: 'copy', bucket, from, to });
          const error = takeFailure('copy');
          if (error) return { data: null, error };
          const bytes = objects.get(`${bucket}/${from}`);
          if (!bytes) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
          objects.set(`${bucket}/${to}`, bytes);
          return { data: { path: to }, error: null };
        }),
        remove: jest.fn(async (paths: string[]) => {
          calls.push({ kind: 'remove', bucket, paths: [...paths] });
          const error = takeFailure('remove');
          if (error) return { data: null, error };
          const found = paths.filter((path) => objects.delete(`${bucket}/${path}`));
          return { data: found.map((name) => ({ name, bucket_id: bucket })), error: null };
        }),
        createSignedUrl: jest.fn(async (path: string, expiresIn: number) => {
          const error = takeFailure('createSignedUrl');
          if (error) return { data: null, error };
          return { data: { signedUrl: `https://storage.test/${bucket}/${path}?expires=${expiresIn}` }, error: null };
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
    selects,
    rpcs,
    rpcHandlers,
    tables,
    updateAnswers,
    /** The profile ids this session may read (the profiles RLS); null = every profile. */
    readableProfiles: null as Set<string> | null,
    objects,
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
    /** The next `method` call answers `error`; with `table`, only the next one on that table (rpc: that function). */
    failNext(method: FailMethod, error: FakeError, table?: string) {
      failures.set(table ? `${method}:${table}` : method, error);
    },
    /** The next select that `match` picks answers `error`. */
    failSelect(match: (select: FakeSelect) => boolean, error: FakeError) {
      selectFailures.push({ match, error });
    },
  };
  return fake;
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
