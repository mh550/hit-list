# supabase/ — the HitList backend (local stack)

The server side of accounts and sharing (spec `docs/specs/2026-10-22-accounts-and-sharing.md` §3; plan
`docs/plans/2026-10-22-s3-backend.md`). Built and tested against the **local** Supabase stack in Docker only; there is
no cloud project in this run (the live steps are in `docs/plans/2026-10-22-live-checklist.md`).

- `config.toml`: `project_id = "hit-list"`, default ports (API 54321, DB 54322, Studio 54323, Mailpit 54324), email
  sign-in with a 6-digit code (D36).
- `migrations/`: SQL, **append-only** like `src/db/schema.ts` (never edit a shipped one).
- `tests/`: pgTAP, run by `npm run test:db`.
- `seed.sql`: only the `tests` schema helpers for pgTAP (`create_user`, `authenticate_as`, `clear_auth`). It runs on
  `db reset` only and is never pushed by a plain `db push` (never use `--include-seed` or `db reset --linked`).

## Commands

The CLI is the pinned `supabase` devDependency (use `npx supabase …`, never a global install).

```bash
npm run db:start    # supabase start (needs Docker)
npm run db:reset    # supabase db reset: migrations + seed.sql on a fresh database
npm run test:db     # supabase test db: every supabase/tests/*.test.sql (pgTAP)
npm run test:integration   # src/__integration__ (Jest, Node) against the running stack: auth, account-delete
npm run db:stop     # supabase stop
```

`test:integration` reads the URL and keys from `npx supabase status -o json` at run time (`scripts/supabase-env.mjs`)
and exits 2 with `Start the stack first: npm run db:start` when the stack is down; no key is written to a file.

`functions/` (Deno Edge Functions, served at `http://127.0.0.1:54321/functions/v1/<name>`): under `supabase start`
the edge runtime does **not** reload a changed function. After editing one, restart its container
(`docker restart supabase_edge_runtime_hit-list`) or `npm run db:stop && npm run db:start` before testing it.

Stop the stack when you are done with it. None of this runs in CI (CI has no Docker stack).

## Docker rule

Only containers named supabase_*_hit-list belong to this project; never touch dj-*, n8n-* or any other container; never docker system prune; never docker compose in another directory.
