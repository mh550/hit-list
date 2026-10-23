# Progress log — run `hit_list-2026-10-22-sharing`

What this is: the running record of this harness run, **newest entry first**. Every session appends
an entry at the top when it finishes (what it built, what it found, what the next session must know).
The work is listed in `feature_list.json` next to this file: the harness gives each fresh session the
first feature whose `passes` is false and whose `after` dependencies pass; array order is priority. A
session changes only its own feature's `passes`. Michael steers the run from the GitHub app by editing
`INBOX.md` on this branch (first line `status: pause` or `status: stop`; answers under `## Answers`);
the harness pulls before every session and every session reads it at startup.

Brief for this run (Michael, 2026-10-22 19:28): build S1–S10 of
`docs/specs/2026-10-22-accounts-and-sharing.md` in order, one PR per milestone, stop only at a
milestone boundary. §1 and §2 are settled. Every feature starts with a failing test (Jest + real
SQLite locally; pgTAP for every RLS policy). Build-only: the backend is the **local** Supabase stack in
Docker via a pinned `supabase` devDependency (`project_id hit-list`); no cloud project, no deploys, no
secrets in files. Stop the stack when a milestone's checks are done. Never touch any container other
than `supabase_*_hit-list`; never `docker system prune`. Dependencies only via `npx expo install`,
lockfile changes in their own `chore:` commit. Every live step goes into
`docs/plans/2026-10-22-live-checklist.md`. Michael is away: a new question gets the simplest reversible
default, recorded as `D<n> *default*` in the spec's §2 (next free number, D52 onward) and asked in §9;
never park. MERGE_POLICY is `pr`: open PRs, merge nothing.

### 2026-10-23 00:45 · S4-02 · passes

- New: `src/sync/client.ts` (`getSupabase`/`isConfigured`, one client, AppState start/stopAutoRefresh), `src/sync/session-storage.ts` (D61 LargeSecureStore on expo-crypto AES-GCM, per-key op queue, read errors never wipe or throw), `src/sync/auth.ts` (`resolveAuthState`), `src/stores/auth-store.ts`, `src/hooks/use-auth-init.ts`, `<AuthInit />` in `app/_layout.tsx` inside DBInitializer; fake `src/__tests__/helpers/fake-supabase.ts` for S4-03..05; jest.setup mocks SecureStore (real key check), AsyncStorage (package mock), expo-crypto AES (Node aes-256-gcm). Tests 924 → 964.
- RED commits 9a51c11 and 1 review-fix RED (5 fail), GREEN after each; `check.sh` green, full non-silent `npx jest --ci` 0 console.error; `npx expo export --platform ios` exit 0, 4.99 MB hbc (was 4.4 MB: supabase-js now bundled). Mutation check: dropping the ticket check fails "keeps the latest event".
- Opus review: 1 Important fixed (offline launch/resume with an expired token showed signed out: `getSession` returns `{session:null, error: AuthRetryableFetchError}` while the session stays stored; now the store is left alone and `TOKEN_REFRESHED` for an unknown user resolves it); Minors fixed: overlapping writes/reads queued, transient read errors, wrong deadlock comment, mock fidelity, missing-row test.
- For S4-08 (not fixed, recorded in the plan): a session ≤ 2048 B sits in the keychain unencrypted and survives delete + reinstall (signed back in), a large one reads as signed out; launch with a valid stored session fetches the profile twice (auth-js emits SIGNED_IN from `_recoverAndRefresh`; the ticket makes it harmless). Offline launch with an expired token shows Profile signed out until the phone is online.
- Next session (S4-03): mock `@/src/sync/client` with `createFakeSupabase()`; `fake.verifyOtp` emits SIGNED_IN and sets the session; `failNext(method, error)`; `queryDelayMs` for races. No new questions for Michael.

### 2026-10-23 · S4-01 · passes

- Deps via `npx expo install`: `@supabase/supabase-js` ^2.118.0, `expo-secure-store` ~57.0.4 (+ its app.json plugin), `@react-native-async-storage/async-storage` 2.2.0; own commit `803a4fa chore:`; no dedupe needed. **No url-polyfill** (README 2.118 doesn't ask; Expo's winter runtime installs a WHATWG URL) and **no aes-js**: expo-crypto 57 has native AES-GCM, which D61 uses.
- `npx expo export --platform ios` exit 0 (4.4 MB); a reverted probe that imports all three packages also bundles (5.0 MB). `.env.example` (empty values), `.gitignore` `.env`/`.env.*`/`!.env.example`; `git ls-files '.env*'` → only `.env.example`.
- Plan `docs/plans/2026-10-22-s4-accounts.md`: client, session storage, auth store + `resolveAuthState`, the three screens' exact copy, Profile states, sign out, account-delete function, fake (cited .d.ts), integration harness, RED test list per feature, review focus. Live checklist gains the S4 phone steps (`.env.local`, 100.88.90.97:54321, Mailpit :54324). Tests 924 → 924, check.sh green.
- Next session (S4-02) must know: never await supabase inside `onAuthStateChange` (defer with setTimeout); a profile fetch error is `signed_in`, never `needs_username`; extend the expo-crypto mock in jest.setup.ts with AES backed by Node aes-256-gcm; `tsconfig`/eslint must exclude `supabase/functions` once S4-05 adds Deno code.
- Questions for Michael (spec §9): Q22 / D61 session in the keychain, large sessions encrypted; Q23 / D62 plain sign out until S5 adds Keep / Remove; Q24 / D63 display name optional.
- Proposed change: S4-05's signed-out copy "Signing in uploads the spots already on this phone…" is only true from S5; keep it (S4 and S5 ship in one run), but S4-07 should say so to Michael.

### 2026-10-23 · verify S3

39 steps re-run; 8 features hold, 0 fail. Build-only policy vs the brief: the brief explicitly allows the local supabase_*_hit-list stack, which the steps need; it was stopped afterwards.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S3-01 | 1 | read package.json, `git show --stat d1d1030` | devDependency "supabase": "2.121.0" (no caret); d1d1030 "chore: pin supabase CLI" touches only package.json + package-lock.json; scripts db:start/db:stop/db:reset/test:db present | yes |
| S3-01 | 2 | read supabase/config.toml, .gitignore, supabase/README.md | project_id "hit-list", ports 54321-54324, [auth.email] enable_signup true, enable_confirmations false, otp_length 6, double_confirm_changes default; .gitignore has supabase/.temp/ and .branches/; README line 29 carries the Docker rule verbatim | yes |
| S3-01 | 3 | read docs/plans/2026-10-22-s3-backend.md (Schema, Functions, Storage, pgTAP harness, Case table), live-checklist.md; checked every backticked test name in the Case table against supabase/tests/*.sql | all sections present; 392 case names checked, all exist in the named files (4 differ only in templating/quoting and the real text was found); checklist exists with S3 live steps; D57 default recorded in spec | yes |
| S3-01 | 4 | `npm run db:start`; `npx supabase status`; `npm run test:db`; `npm run db:stop`; `docker ps` | API_URL http://127.0.0.1:54321; test:db ran 9 files (the empty-run state of that session is history, recorded in the plan); after stop docker ps shows only dj-*/n8n-* containers, no supabase_*; I touched no other container | yes |
| S3-01 | 5 | `npx jest --ci`, `npx tsc --noEmit`, `npx expo lint` | 67 suites / 924 tests pass, 0 console.error lines, tsc clean, lint no output; check.sh green | yes |
| S3-02 | 1 | `npm run db:reset` then `npm run test:db`; read 010-schema.test.sql | 010 ok: has_table x10, RLS on x10 (one ok() per table), postgis+citext, spots.geog geography(Point,4326) stored-generated and st_equals(ST_MakePoint(lng,lat)); the "no policies" check now covers only links (policies came with later features, as the file comments) | yes |
| S3-02 | 2 | read 020-triggers.test.sql; ran it | 020 ok (33): rev strictly bumps, global across tables, stale updated_at skipped with no rev bump and no sequence number, auth.users insert creates profile with NULL username, Ab/a-b/21-char/ABC dup rejected (23514), rider_1.a accepted | yes |
| S3-02 | 3 | read seed.sql, ls supabase/migrations; ran test:db | tests.create_user/authenticate_as/clear_auth exist and 020 uses them; the schema commit a46c5d2 added exactly one migration (7 exist now, later features appended); test:db exits 0 with all files reported | yes |
| S3-02 | 4 | stack started, checks run, `npm run db:stop` | stack stopped, no supabase_* left, no other container touched | yes |
| S3-02 | 5 | jest/tsc/lint | 924 pass, 0 console.error, tsc ok | yes |
| S3-03 | 1 | read 030-spots-rls.test.sql names; own psql probe in a rolled-back txn (members/strangers); `git log` for RED | RED 6b057bc (no policies, 3 fail then dies). Probe: stranger 0 spots/media/lists; friend 0; view member sees owner spot+media (1/1) in shared list; member update/delete = 0 rows; owner insert with other owner_id 42501, own ok; after DELETE of membership member sees 0 spots, 0 media; 030 covers area in/out, other owner, deleted spot, invited status, list B | yes |
| S3-03 | 2 | read spots_rls.sql; `pg_proc` query | can_read_spot is security definer, STABLE, search_path "" ; spots/media policies present (media via can_read_spot) | yes |
| S3-03 | 3 | read Case table rows for 030 | rows marked **done** with test names that exist in 030 | yes |
| S3-03 | 4 | stack started and stopped | no supabase_* container left, others untouched | yes |
| S3-03 | 5 | jest/tsc/lint | 924 pass, 0 console.error, tsc ok | yes |
| S3-04 | 1 | read 040 names, ran it (94 pass); probe for view-member insert, member rename; RED 62c39aa | RED 62c39aa 48/79 fail. Probe: view member add own spot raises 42501 "not a member who can add"; member rename list 0 rows; 040 names exist for add-own/not-others, delete own rows only, owner-only members, Join, Decline/Leave, leave_list/remove_member/stop_sharing and can_read_spot false after | yes |
| S3-04 | 2 | read lists_rls.sql, pg_proc | leave_list, remove_member, stop_sharing are security definer with search_path "" and use auth.uid() | yes |
| S3-04 | 3 | stack started and stopped | no supabase_* left, others untouched | yes |
| S3-04 | 4 | jest/tsc/lint | 924 pass, 0 console.error, tsc ok | yes |
| S3-05 | 1 | read 050 names, ran it (91 pass); probes find_profile/friend request/block; RED 5370167 | RED 5370167. Probe: find_profile(ANA) 1 row; nonexistent 0; send_friend_request gives user_a<user_b, pending, requested_by caller; reverse request ends accepted with 1 row; blocked caller: find_profile 0 rows, request raises "user not found", send raises; block deleted friendship; blocked user sees 0 blocks rows | yes |
| S3-05 | 2 | read friends_rls.sql, pg_proc | find_profile, send_friend_request, respond_friend_request, block_user, unblock_user exist; username NULL-able; find_profile test "anon cannot call" | yes |
| S3-05 | 3 | stack started and stopped | no supabase_* left, others untouched | yes |
| S3-05 | 4 | jest/tsc/lint | 924 pass, 0 console.error, tsc ok | yes |
| S3-06 | 1 | read 060 names, ran it (60 pass); probe sends; RED a3194cd | RED a3194cd (060 dies at test 1). Probe: create_send returns id; to non-friend raises; third user sees 0; recipient sees 1, payload update 0 rows; after withdraw_send recipient sees 0 and sender sees withdrawn_at set; 060 also has saved_at/dismiss/blocked/NULL-recipient cases | yes |
| S3-06 | 2 | read 070-storage-rls.test.sql names, ran it (46 pass); `select public from storage.buckets` | photos bucket public = f; 070 has owner insert, stranger blocked, member select, removed member empty, sender sends/<id>/ path, recipient select, third no, 3-segment parser | yes |
| S3-06 | 3 | read sends_storage.sql | policies, create_send/withdraw_send/mark_send_saved/dismiss_send, bucket insert with on conflict do nothing, split_part-based path check (photo_path_ok) | yes |
| S3-06 | 4 | stack started and stopped | no supabase_* left, others untouched | yes |
| S3-06 | 5 | jest/tsc/lint | 924 pass, 0 console.error, tsc ok | yes |
| S3-07 | 1 | read 080 names, ran it (116 pass); probes: authenticated select/insert on links, preview_link as authenticated/anon, redeem as anon; RED 8ddadb5 | RED 8ddadb5. Probe: links select 0 rows, direct insert 42501, preview_link and redeem_invite permission denied for authenticated/anon; 080 covers create_link by sender/owner, preview of live/expired/revoked/withdrawn/unknown (same empty), redeem makes member with role, used raises, blocked raises, two redeems one row | yes |
| S3-07 | 2 | read links.sql, pg_proc | create_link, revoke_link, preview_link (service_role claim check, invoker), redeem_invite (extensions.digest sha256 hex), list_my_links exist; links has RLS and no policies | yes |
| S3-07 | 3 | plan Case table; `npm run test:db` | all case rows done; test:db lists all nine files passing (8 original + 090) | yes |
| S3-07 | 4 | stack started and stopped | no supabase_* left, others untouched | yes |
| S3-07 | 5 | jest/tsc/lint | 924 pass, 0 console.error, tsc ok | yes |
| S3-08 | 1 | ls reviews/, read plan Review section | s3.diff exists (4936 lines); findings tables with severity, file:line and fix commit for S3-08 (RED cd88475, GREEN 3711528); Important sync finding handled as S5 proposed change, not an access bug | yes |
| S3-08 | 2 | read the six written answers; pg_proc query; read 090 names | all 40+ definer functions search_path ""; client-callable ones use auth.uid(); no recursion tests; can_read_spot STABLE with index-scan EXPLAIN tests; t20_rev on the six tables; anon executes 0 public functions (pg_proc: anon false for all); photo_path_ok test for <3 segments; each answer names tests that exist | yes |
| S3-08 | 3 | `npm run db:reset` then `npm run test:db`; read supabase/README.md | all 9 files ok, Files=9 Tests=569 Result: PASS; counts recorded in the plan (010 38 · 020 33 · 030 60 · 040 94 · 050 91 · 060 60 · 070 46 · 080 116 · 090 31); README lists the four commands and "Stop the stack when you are done" | yes |
| S3-08 | 4 | grep CLAUDE.md | Commands has db:start with "need Docker; not in CI" and the four scripts; Layout has supabase/; Conventions has the Docker bullet with the rule verbatim | yes |
| S3-08 | 5 | `npm run db:start`... `npm run db:stop`; docker ps | stopped cleanly; docker ps shows only dj-*/n8n-*; no other container touched | yes |
| S3-08 | 6 | `npx jest --ci`, tsc, lint | 67 suites / 924 pass, 0 console.error lines, tsc ok, lint clean | yes |


### 2026-10-23 06:20 · S3-08 · passes

- Changed: new `supabase/tests/090-review.test.sql` (31: catalog proofs of the six review answers + the fixes), `supabase/migrations/20261023060000_review_fixes.sql` (`block_user` withdraws pair invitations directly, `t05_block_guard_join` on Join, media `uploaded_by` = the uploader), seed.sql revokes `tests.create_user` from client roles; CLAUDE.md (4 db scripts, `supabase/` in Layout, the Docker rule), README/live checklist (never `--include-seed`/`db reset --linked`). RED `cd88475` (5/31 failed), GREEN `3711528`. Jest 924 → 924; pgTAP 538 → 569.
- Verified: `db:reset` → `test:db`: `Files=9, Tests=569, Result: PASS` → `db:stop`; `docker ps` = the same 7 n8n-*/dj-* containers. Six mutations of the catalog proofs (definer without search_path, dropped indexes, a recursive profiles policy, dropped media rev trigger, a PUBLIC grant) each fail 090. `check.sh` green (924).
- Opus review (whole S3 diff, `reviews/s3.diff`): no Critical. 2 Minor fixed test-first, 3 Nit fixed or accepted, table + six written answers under Review in the S3 plan. EXPLAIN of `can_read_spot`'s own body: `hit_list_spots_spot_idx`, and `hit_list_members_user_idx (user_id, list_id)` rather than the `(list_id, user_id)` PK (same columns, planner's pick), no Seq Scan.
- **One Important left unfixed, on purpose:** it is a sync-protocol gap, not a policy or function bug. A row you gain read on (Join, redeem, area edit, new friend) keeps its old `rev`, so a `rev > cursor` pull misses it. Added under Proposed changes for **S5-04**: fetch readable ids that aren't held locally, whatever their rev. If you'd rather count it against S3, tell me and the server-side bump goes in.
- Next sessions must know: S3 is complete (S3 PR next). S7: don't trust `spots.copied_from_send`. Un-deleting a list brings its members back (accepted; the app never un-deletes).
- Questions for Michael: none new (D57–D60 still open in §9).
- Proposed changes: S3-08's step says the plan uses `hit_list_members(list_id, user_id)`; it uses the `(user_id, list_id)` index (both asserted). S5-04: add the readable-id fetch above to its steps.

### 2026-10-23 05:10 · S3-07 · passes

- Changed: `supabase/migrations/20261023041500_links.sql` (`create_link`, `revoke_link`, `list_my_links`, `preview_link` (service role only, invoker, JWT claim checked), `redeem_invite` (pgcrypto SHA-256 hex, link `for update`, pair lock, block → `'invalid invite'`), trigger `t30_revoke_invite_links`, three links indexes; links keep RLS on with no policies). New `080-links-rls` (116). RED commit `8ddadb5` (died at test 1). Jest 924 → 924; pgTAP 422 → 538.
- Verified: `db:reset` → `test:db`: `Files=8, Tests=538, Result: PASS` → `db:stop`; `docker ps` = the same 7 n8n-*/dj-* containers. 49 hand mutations (`mut7.sh`, scratch): all killed except 5 equivalents, listed in the plan. Two-session races: two redeems of one token → 1 member (2 without `for update`); `create_link` vs `stop_sharing` → 0 live links (1 without `for share`). Local PostgREST: service role previews, anon gets 42501 on both RPCs and `[]` from `links`. `check.sh` green (924).
- Opus review: 1 Important, fixed test-first. `preview_link` now returns `send_id`, so S9 never signs a photo path taken from the payload. Minors fixed: the create-vs-unshare lock, the redeem re-check under the pair lock, indexes, comments, 6 gap tests. Table under Review in the S3 plan. Every §3.3 case in the Case table is done.
- Next session (S3-08) must know: S9's `share-preview` signs only `sends/<send_id>/…` objects that pass `photo_path_ok`. `sends.link_id` is never set (S9: set it or drop it). Keep `t30_revoke_invite_links` sorting before `t30_unshare` (see the comment in `redeem_invite`).
- Questions for Michael: **D60 *default*** (spec §9 Q21): anyone signed in who holds an invite link joins once, no friendship needed; stopping sharing or deleting the list kills its links. OK? The invite preview shows the list name to someone not signed in (the S3-07 step asks for it; D44 says invite links show nothing without an account). Which one is right? A send to a friend can also be turned into a public link. Is that OK?
- Proposed changes: S3-07's step says "a second redeem of the same token raises". It does for anyone else. The rider who used the link gets the list id back on a retry, and so do the owner and existing members, and the link stays as it is.

### 2026-10-23 04:20 · S3-06 · passes

- Changed: `supabase/migrations/20261023031134_sends_storage.sql` (sends policy, `can_read_send`, `create_send` (pair lock, friends only, payload = JSON object ≤ 1 MB), `withdraw_send`, `mark_send_saved`, `dismiss_send`; private `photos` bucket (JPEG, 10 MB); `try_uuid`, `photo_path_ok`, `can_read_photo`, `can_write_photo` + four `storage.objects` policies). New `060-sends-rls` (60) and `070-storage-rls` (46); `010` 39 → 38. RED commit `a3194cd` (060 died at test 1, 070 in setup). Jest 924 → 924; pgTAP 317 → 422.
- Verified: `db:reset` → `test:db`: `Files=7, Tests=422, Result: PASS` → `db:stop`; `docker ps` = the same 7 n8n-*/dj-* containers. 50 hand mutations (`mut.py`, scratch): 48 killed, 2 equivalent. `race.sh`: a send racing `block_user` waited 1.6 s and was refused (0 rows); without the lock it went in after 0.07 s. `check.sh` green (924).
- Opus review: 1 Important, fixed test-first (9 of 12 new assertions failed on the pre-review SQL). A sender could overwrite or delete send photos after Save; send photos are now write-once. Minor: payload bound, bucket `on conflict do update`, positive upsert/move tests. The full table is under Review in the S3 plan.
- Next sessions must know: storage paths are lowercase `<uuid>/<uuid>/<uuid>.jpg` or `sends/<uuid>/<uuid>.jpg`. Members read a photo only while its media row is live. A direct DELETE on `storage.objects` needs `set_config('storage.allow_delete_query','true',true)`. Use `on conflict (bucket_id, name collate "C", version)` for upserts. S4: account deletion must remove `sends/<id>/` objects. S5: upload with `contentType: 'image/jpeg'`. S7: Save = `mark_send_saved` before the photo copy.
- Questions for Michael: **D59 *default*** (spec §9 Q20). Blocking hides the blocked rider's sends to you, but your own pending sends to them stay until you withdraw them. Unblocking brings their pending sends back. OK?
- Proposed changes: S3-06's step 3 says the bucket insert is `on conflict do nothing`. It is `on conflict (id) do update` (private, limits), so a bucket made earlier as public is corrected (review Minor).

### 2026-10-23 03:30 · S3-05 · passes

- Changed: `supabase/migrations/20261023025214_friends_rls.sql` (profiles/friendships/blocks policies; `can_read_profile`, `find_profile`, `send_friend_request`, `respond_friend_request`, `block_user`, `unblock_user`, `lock_user_pair`; triggers `t05_keep_identity` on profiles, `t05_block_guard` on hit_list_members, `t30_withdraw_invitations` on friendships; display_name ≤ 50). `supabase/tests/050-friends-rls.test.sql` has 91 assertions; `010` 42 → 39. RED commit `5370167` (13/16 failed, died at test 17). Jest 924 → 924; pgTAP 229 → 317.
- Verified: `db:start` → `db reset` → `test db`: `Files=5, Tests=317, Result: PASS` → `db:stop`; `docker ps` = the same 7 n8n-*/dj-* containers. 36 hand mutations, each killed by a named test except the two delete-policy ones (the SELECT policy already limits a DELETE). `check.sh` green (924), 0 console.error.
- Opus review: 2 Important, both fixed test-first. (1) The sender of a pending request could read the target's profile by id, following them through a rename. Now only the receiver reads the sender. (2) An invitation racing `block_user` survived. A pair-lock guard trigger fixes it. Two-session `race.sh`: before the fix the invite went in after 0.09 s and was kept; after it the invite waited 1.6 s and was refused, 0 left. Six Minor fixes or notes, all in the S3 plan's Review table.
- Next sessions must know: S3-06 `create_send` should take `lock_user_pair`, and the sends policy must hide sends from a recipient who blocked the sender. S3-07 `redeem_invite` must map the block guard's error to `'invalid invite'`. `find_profile` uses `operator(extensions.=)`: a bare `=` on citext under `search_path ''` compares case-sensitively.
- Questions for Michael: **D58 *default*** (spec §9 Q19). Is a display name of up to 50 characters right? Removing a friend also withdraws pending list invitations. Is that OK? Should we accept that a blocked rider can learn your username exists by trying to take it?

### 2026-10-23 02:50 · S3-04 · passes

- Changed: `supabase/migrations/20261023021848_lists_rls.sql` (hit_lists / hit_list_spots / hit_list_members policies; definer helpers `is_list_owner`, `is_list_member`, `is_list_invitee`, `can_add_to_list`, `can_invite_to_list`, `can_read_list_spots`; `leave_list`, `remove_member`, `stop_sharing`; triggers `t05_keep_identity` (list owner_id/kind fixed), `t10_member_guard`, `t10_lock_membership`, `t30_member_spots_leave`/`_join` (D43), `t30_unshare`). `supabase/tests/040-lists-rls.test.sql` has 94 assertions; `010` 45 → 42. RED commit `62c39aa` (48/79 failed). Jest 924 → 924; pgTAP 138 → 229.
- Verified: `db:start` → `db reset` → `test db`: `Files=4, Tests=229, Result: PASS` → `db:stop`; `docker ps` = the same 7 n8n-*/dj-* containers. 20 hand mutations of the migration each fail a named test. Two of them survived at first, which led to 3 new tests. A two-session race script: before the fix a row outlived `leave_list` (1 left); after it, leave waited ~2.1 s and 0 were left. `check.sh` green (924).
- Opus review: 2 Important, both fixed test-first (8 of 13 new assertions failed on the pre-review SQL). (1) a plain `update set shared=false` kept members, so unsharing now drops them in a trigger. (2) a race between an add and Leave, fixed with a membership `FOR SHARE` lock plus a clean-up on Join. Minor: an invitee also sees an area list's circle. It is kept and recorded in the plan.
- Next sessions must know: S3-05 should make `block_user` delete pending invitations between the two users. S3-07 `redeem_invite` runs as definer, so the member guard doesn't apply. It must refuse unshared or deleted lists and clear leftover rows. Both are under Proposed changes in the S3 plan.
- Questions for Michael: none new.

### 2026-10-22 23:55 · S3-03 · passes

- Changed: `supabase/migrations/20261023020530_spots_rls.sql` (`can_read_spot` security definer/stable/`search_path ''`, `spot_matches_filters`, spots + media policies to `authenticated`, `t05_keep_identity` triggers), `supabase/tests/030-spots-rls.test.sql` (60 assertions), `010` drops spots/media from the no-policy list (47 → 45). RED commit `6b057bc` (3 fail, died at test 4: no `can_read_spot`). Jest 924 → 924; pgTAP 80 → 138.
- Verified: `supabase start` → `db reset` → `test db`: `Files=3, Tests=138, Result: PASS` → `supabase stop` exit 0; `docker ps` = the same 7 n8n-*/dj-* containers. Hand-made mutations of every `can_read_spot` condition, the filters and `media_select` each fail a named test. `check.sh` green (924).
- Opus review: 11 findings, no current leak. Fixed test-first: a manual-list row grants read only if `added_by` = the spot's owner and that owner is still the list owner or a member. The area circle is on the sphere, matching the app's haversine (edge test at 999.5 m). Allow-list probe guard. A 20-case filter table. Area shared/deleted/invited tests. Spot/photo identity fixed. The table is under Review in the S3 plan.
- Next session (S3-04) must know: make `hit_lists.owner_id`/`kind` immutable and test it, because the area branch trusts `owner_id`. Keep `hit_list_spots` insert = `added_by = auth.uid()` and caller owns the spot. S5: index `rev`; upserts must resend the same identity columns, otherwise `t05` raises 42501.
- Questions for Michael: none new.

### 2026-10-22 23:10 · S3-02 · passes

- Changed: `supabase/migrations/20261023015403_schema.sql` (the only migration: 10 tables, RLS on + no policies, postgis/citext in `extensions`, `sync_rev`, `t20_rev` / `t10_stale_guard` / `on_auth_user_created` triggers, username check, privileges), `supabase/seed.sql` (`tests.create_user`, `authenticate_as`, `authenticate_as_service_role`, `clear_auth`), `supabase/tests/010-schema.test.sql` (47) + `020-triggers.test.sql` (33). RED commit `1981ed4` (no migration: all failed). Jest 924 → 924 (SQL only); pgTAP 0 → 80.
- Verified: `npx supabase start` → `db reset` → `npm run test:db` exit 0, `Files=2, Tests=80, Result: PASS` → `supabase stop` exit 0; `docker ps` = the same 7 n8n-*/dj-* containers, no `supabase_*`. `check.sh` green (924). An Opus review found 2 Important + 6 Minor; all fixed test-first except the rev-ordering race (S5's problem, written into the plan). Findings table is under Review in `docs/plans/2026-10-22-s3-backend.md`.
- Next session must know: **a new `public` function has EXECUTE for nobody but `service_role`**. Every S3-03+ migration must `grant execute … to authenticated` for each function a client calls. `bump_rev` is security definer and no client role has any privilege on `sync_rev`, because Supabase's default grants would let `authenticated` `setval` it. To act as service_role after `authenticate_as`, run `reset role` first. pgTAP files carry values with `set_config('t.x', …, true)`, not `\gset`.
- Proposed changes: S5 (sync pull) should add a step for out-of-order rev commits, e.g. "a row whose transaction commits after a later rev was pulled is still pulled next time". The plan's Schema → Triggers section has the details. `hit_lists_area_shape` now also requires a manual list's area columns to be NULL. S1's local rows already satisfy that.

### 2026-10-22 22:05 · S3-01 · passes

- Changed: `supabase` CLI **2.121.0** pinned exact (devDependency, `d1d1030 chore: pin supabase CLI`); scripts `db:start`/`db:stop`/`db:reset`/`test:db`; `supabase/config.toml` (`project_id = "hit-list"`, default ports, email OTP 6 digits), `supabase/README.md` (commands + the Docker rule verbatim), `.gitignore` (`supabase/.temp/`, `.branches/`); `docs/plans/2026-10-22-s3-backend.md` (schema, functions, policies, storage, pgTAP harness, the §3.3 Case table → 8 test files with exact test names); `docs/plans/2026-10-22-live-checklist.md` (spec §10 + S3's staged `db push`). Tests 924 → 924 (docs/config only).
- Verified: `npx supabase start` exit 0; `status` printed `http://127.0.0.1:54321`; `supabase test db` with no files → `Result: NOTESTS`, **exit 1** (recorded in the plan); a throwaway probe test passed 3/3 (pgTAP auto-installed; `set_config('role')` + claims inside a function drive `auth.uid()`); `supabase stop` exit 0, `docker ps` afterwards = the same 7 n8n-*/dj-* containers, no `supabase_*`. `check.sh` green (924), `expo-doctor` 21/21.
- Next session must know: **`supabase/tests/` must exist before `test db`** or Docker creates it owned by root (it is now checked in with `.gitkeep`). `supabase start` leaves `supabase/snippets/` (empty, untracked). PostGIS lives in schema `extensions`, so the generated `geog` column may need `extensions.`-qualified calls.
- Question for Michael: **D57 *default*** (spec §2, §9 Q18): a shared-list invitation is a `hit_list_members` row with `status 'invited'`; Join → `'member'`, Decline deletes it; invitees see name + owner only. OK?
- Proposed changes: S3-03 add a case `area member reads no spot the filters exclude` (the plan applies `area_filters` server-side so members read exactly what the list shows); S3-04 add `owner cannot add a spot they do not own` (otherwise any user could expose another rider's spot by putting its id in their own shared list).

### 2026-10-22 verify S2

Re-ran `check.sh` (green, 924 tests), `npx jest --ci` (67 suites, 924 tests, 0 `console.error` lines) and `npx expo export --platform ios` (exit 0, `entry-*.hbc` 4,357,679 B). Read each named test's assertions.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S2-01 | 1 | `grep '^## '` docs/plans/2026-10-22-s2-area.md | Sections Geometry, Area lists, Picker screen, Mock, Lists tab and list screen, Add-to-list sheet and spot detail, Copy, Test list (per feature), plus Review | yes |
| S2-01 | 2 | Spec §2 rows D53–D56 and §9 Q14–17; plan line 46 | D53 ignores NO_LOCATION, D54 place = typed text or 'my location', D55 filters, D56 radius; all *default*, in §9; plan says 'Send these N spots' is added in S7 | yes |
| S2-01 | 3 | `git show --stat` of 1d59ff6 + `check.sh` | Commit touches only the plan, the spec and harness files; check green | yes |
| S2-02 | 1 | `npx jest src/__tests__/area.test.ts`, read lines 25–138 | Steps arrays equal the stated values; boundary kept, 1 m short dropped; NO_LOCATION never; nearestStep(1700, imperial)=1609; the three areaLabel strings match; circleRegion asserted numerically at 47.6° | yes |
| S2-02 | 2 | hit-lists-store.test.ts lines 119–210 | area list returns inside-circle spots; `types: [rail]` drops the ledge; the store spot appears on the next selectListSpots; selectListCounts counts area lists | yes |
| S2-02 | 3 | db-hit-lists.test.ts lines 52–66 and 211–224 | Area list with centre, radius, place and filters round-trips equal; an area-lists block covers updateHitList (centre/radius 3219/place 'Capitol Hill') | yes |
| S2-02 | 4 | `check.sh`, `npx jest --ci` | Green; 0 console.error | yes |
| S2-03 | 1 | `__mocks__/react-native-maps.tsx` lines 1–43 | Circle renders View testID 'map-circle' with props; MapView spreads props so onRegionChangeComplete is fireable; comment cites `node_modules/react-native-maps/dist/src/*.d.ts` (package has no lib/, so the path in the step differs, same files) | yes |
| S2-03 | 2 | `app/_layout.tsx:51`, area-picker.test.tsx lines 132–260 | Registered fullScreenModal 'Pick an area'; centre = location else initialRegion; chips imperial/metric, 2 mi checked, circle radius 3219; '5 mi' → 8047; region change moves centre and recounts; '23 spots' and '1 spot' | yes |
| S2-03 | 3 | area-picker.test.tsx lines 268–330 and 412–430 | geocodeAsync('Capitol Hill') moves centre; 'No place found' on empty and on reject (no console.error); 'Use my location' disabled with no fix and recentres | yes |
| S2-03 | 4 | area-picker.test.tsx lines 436–470 | Header Filter opens FilterSheet; rail filter drops count 26 → 3 | yes |
| S2-03 | 5 | area-picker.test.tsx lines 490–512 | Only 'Save as hit list', no Send text; chooser shows both options with the exact hints | yes |
| S2-03 | 6 | `npx jest --ci` | Green; 0 console.error | yes |
| S2-04 | 1 | area-picker.test.tsx lines 584–630 | Manual: createList('Weekend', {kind:'manual'}), addSpotsToList with the 23 ids, replace('/list/L-new'), in that order; area: createList with kind 'area', centre, 3219, 'Capitol Hill', filters; addSpotsToList not called | yes |
| S2-04 | 2 | lists-tab.test.tsx lines 253–295 | 'New area list' button pushes '/area'; row 'Weekend, Area · 2 mi, 2 spots'; live count after a spot is added | yes |
| S2-04 | 3 | list-screen.test.tsx lines 357–425; area-picker.test.tsx lines 700–770 | Title 'Area · 2 mi of Capitol Hill'; Edit area pushes `/area?listId=…`; picker prefills; 'Save area' → updateHitList(id, {centre, radius, place, filters}) then back; long press shows no Alert | yes |
| S2-04 | 4 | add-to-list-sheet.test.tsx lines 202–245; spot-detail.test.tsx lines 350–372 | Disabled row with the exact hint, no add/remove call; detail 'In lists' shows the area chip when the circle holds the spot, none when outside | yes |
| S2-04 | 5 | area-list-live.test.tsx lines 72–95 | Real SQLite, radius 1609 at Seattle; spot at 500 m renders with no other action, spot at 2000 m does not; memberships empty | yes |
| S2-04 | 6 | `npx jest --ci` | Green; 0 console.error | yes |
| S2-05 | 1 | docs/plans/2026-10-22-s2-what-michael-will-see.md §1–4; `ls src/__tests__` | Covers picker default (imperial + metric chips, count), chooser, Lists tab with area + manual list, area list screen with 'Edit area'; no leftover temp test file | yes |
| S2-05 | 2 | Same file, 'What to tap' | Steps 1–6 cover + Area list, drag, 1 mi, search Capitol Hill, Keep it updated, Quick Add inside the circle, Edit area to 5 mi | yes |
| S2-05 | 3 | Same file 'Checks recorded'; re-ran `npx expo export --platform ios` | Doc records jest counts (919 then; 924 now), 0 console.error, export exit 0, 4.4 MB; my export exit 0, 4.36 MB | yes |
| S2-05 | 4 | `check.sh` | Green | yes |
| S2-06 | 1 | reviews/s2.diff (3,380 lines, starts at __mocks__), plan '## Review' | Diff exists, base 2488824 (S1 verified) named; findings table has severity, file:line and fix commit; no Critical/Important, Minor fixes list RED tests | yes |
| S2-06 | 2 | Plan Review 'Reviewer's written answers' 1–5, with area.ts, picker and tests read above | All five answered; backed by the tests I read (NO_LOCATION excluded, radius from steps, one selectAreaSpots, reject → 'No place found' with no console.error, region change with `geocodeAsync` not called) | yes |
| S2-06 | 3 | `git log` | 5af129a `refactor:` S2 simplification pass | yes |
| S2-06 | 4 | CLAUDE.md lines 47, 93, 121; README.md line 44 | Layout mentions app/area/, src/utils/area.ts, 'computed, never stored'; README has the 'Area lists (S2)' bullet | yes |
| S2-06 | 5 | `npx jest --ci`, `check.sh` | Green; 0 console.error | yes |

### 2026-10-23 02:50 · S2-06 · passes

- Review: an Opus reviewer read `reviews/s2.diff` (`git diff 2488824..HEAD -- src app __mocks__`, 3,380 lines). It found **no Critical or Important** issues and 5 Minor ones. Three are fixed, each with a RED test first (`5dd05fd`): an empty area list on the Spots tab now uses the area copy; the chooser reads 'Just this 1 spot'; 'Edit area' puts your own filters back on close (Save or Cancel). Two are accepted: place-name drift across edits (needs a migration; noted in D54) and unclustered pins in a big circle (phone check added). The findings and the five written answers (NO_LOCATION, radius steps round-trip, one `selectAreaSpots`, geocode rejection, no geocode on drag) are under 'Review' in `docs/plans/2026-10-22-s2-area.md`.
- `refactor:` (`5af129a`): one `isAreaList` guard in `src/utils/area.ts` (replaces 4 copies), a new `FilterHeaderButton` shared by `SpotsBrowser` and the picker, `areaLabel` computed once, the picker's start region folded into its `start` state.
- Docs: CLAUDE.md Layout (`app/area/`, `src/utils/area.ts`, area lists computed never stored, `selectAreaSpots`, `FilterHeaderButton`); README 'Area lists (S2)'.
- Tests 919 → 924 (+3 area-picker, +1 spots-view-mode, +1 area). Verified: `check.sh` green, 924; `npx jest --ci` 0 console.error.
- Next: S2 is done; the S2 PR / S3 per the feature list. `docs/plans/2026-10-22-live-checklist.md` doesn't exist yet; S2's phone checks are in `2026-10-22-s2-what-michael-will-see.md`.
- Questions for Michael: D55 changed slightly (Edit area no longer leaves the list's filters on the Spots tab), so please confirm it with Q16. D53–D56 are still open in spec §9.

### 2026-10-23 02:10 · S2-05 · passes

- New `docs/plans/2026-10-22-s2-what-michael-will-see.md`: the picker (default imperial and metric, count '1 spot'), the 'Save as hit list' chooser, the Lists tab (one area, one manual list), the area list screen (two-line header, 'Edit area'), 'What to tap', and the checks. Rendered by a temporary test (deleted before the commit); tests stay at 919.
- Verified: `npx jest --silent` 67 suites / 919 passed, `npx jest --ci` 0 `console.error`; `npx expo export --platform ios` exit 0 (entry hbc 4.4 MB); `check.sh` green.
- Next: S2 is complete; the next feature is the S2 PR / S3 per the feature list. Phone checks are listed at the end of the new doc.
- Questions for Michael: none new (D53–D56 still open in spec §9).

### 2026-10-23 01:30 · S2-04 · passes

- Picker (`app/area/index.tsx`): 'Just these N' and 'Keep it updated' now lead to a name card **in the same Modal** (`NameListCard` + `useGuardedSubmit`, split out of `NameListSheet`; iOS won't present a second Modal while the first is closing). Create → `createList(name, { kind: 'manual' })` + `addSpotsToList` (a failed add deletes the new list again), or `createList(name, { kind: 'area', … })`; then the chooser closes and `router.replace('/list/<id>')`. Edit mode `?listId`: pre-fills centre/radius/place, loads `area_filters` into the shared filters (D55), and has one action, 'Save area' → `updateHitList` → `back()`. A missing or manual list shows 'This list is gone' with Cancel.
- Hook: `createList(name, NewHitList)` and a new `updateHitList` (store first, reverts the patched keys; the store gains `replaceList`). Lists tab: '+ Area list' and 'Area · 2 mi' rows. Area list screen: a two-line header title (`SpotsBrowser.headerTitle` is now a ReactNode), 'Edit area' beside 'Delete list', no long-press Remove, area empty copy. `AddToListSheet`: area rows are read-only checkboxes with the hint.
- Tests 879 → 919: area-picker +21, use-hit-list-actions +6, lists-tab +4 (S1's 'no New area list' assertion removed, by design), list-screen +8, add-to-list-sheet +4, spot-detail +2, new area-list-live (1, real SQLite). All RED first, except the detail chip and the live test, which S2-02's selectors already satisfied. Mutation checks show they fail when area lists are dropped.
- Verified: `check.sh` green (919), `npx jest --ci` 0 console.error, `npx expo export --platform ios` exit 0. An Opus review found 2 Important bugs (a duplicate list on a second Create tap; Cancel during 'Save area' popped two screens) and 4 Minor ones (the revert of a key absent before, edit filters' first frame, header a11y, gone headerTitle). All are fixed, each with a RED test where it can be tested.
- Step notes: the picker's edit-mode tests live in `area-picker.test.tsx`, not `list-screen.test.tsx`. "Opens NameListSheet" is the same card (title 'New hit list', 'List name', Create) rendered inside the chooser's Modal.
- **Phone checks for S2-05:** `router.replace` from the fullScreenModal picker to `/list/<id>`; the chooser → name card swap with the keyboard up.
- Questions for Michael: none new (D53–D56 still open in spec §9).

### 2026-10-23 00:40 · S2-03 · passes

- New `app/area/index.tsx` (the 'Pick an area' screen; `app/_layout.tsx` registers it as a `fullScreenModal`). It has a MapView with a fixed centre pin (`area-center-pin`), a `Circle`, a pin per spot inside, `radio` radius chips (`Chip` gains the role), and 'Search a place' (`geocodeAsync` on submit; a request counter drops stale answers; `[]` or a rejection shows 'No place found' silently). It also has 'Use my location' (disabled with no fix), Cancel / Filter in the header (the shared `FilterSheet`), and a live count from `selectAreaSpots`. 'Save as hit list' opens a chooser ('Just these N spots', hidden at 0, and 'Keep it updated', each with its hint, plus Cancel). Every option only closes it.
- The maps mock gains `Circle` (`map-circle`) and `mockMapMethods.animateToRegion`. Its header cites `dist/src/*.d.ts` and says how to fire `onRegionChangeComplete`. `jest.setup.ts` mocks `geocodeAsync`. `spotCountLabel` moved to `src/utils/spot-name.ts`.
- Tests 841 → 879: new `area-picker.test.tsx` (36), +1 in `root-layout`, +1 in `spot-name`. All were RED first (the module was missing). Mutation checks: removing the request counter fails 1 test, and following the live fix fails 3.
- Verified: `check.sh` green with 873 tests, `npx jest --ci` has 0 console.error, and `npx expo export --platform ios` exits 0 (4.2 MB hbc). An Opus review found nothing Critical. Its one Important finding (`initialRegion` was recomputed with the live radius, which could snap the camera back while the map loads) is fixed and has a RED test first. The reviewer's later report had four Minor races, all fixed in a second commit with 6 RED tests first: a late geocode answer now fits the camera to the current radius (`radiusRef`); a drag (`isGesture`), 'Use my location' or a text edit cancels a search in flight; results with null coordinates are skipped; re-tapping the selected chip doesn't call `animateToRegion`. The last one avoids react-native-maps' `ignoreRegionChanges` latch. **Phone check for S2-05:** after 'Use my location' on an unchanged map, does the next short drag still move the circle?
- Next (S2-04): the place state already exists (`place` = `{ name, center }`, 'my location' when opened on a fix, dropped by `keepsPlace` on a drag), so `area_place` is `place?.name`. The chooser's options call `onClose` in `SaveChooser`; wire them to `NameListSheet` there. Edit mode (`?listId`) is not built yet.
- Questions for Michael: none new (D53–D56 still open in spec §9).

### 2026-10-22 23:59 · S2-02 · passes

- New `src/utils/area.ts`: `RADIUS_STEPS_M`, `DEFAULT_AREA_RADIUS_M`, `spotsInCircle`, `nearestStep`, `radiusLabel`, `areaLabel`, `circleRegion`, `keepsPlace`. The store gains `selectAreaSpots`, the one rule for "in the area". `selectListSpots`, `selectListCounts` and `selectSpotLists` compute an area list's spots from its circle and `area_filters`, with no memberships. `selectSpotLists` now takes the spot instead of the id; detail's `InLists` takes `spot`. `updateList`: `area_place: null` clears the place. `HitListUpdate` gains the area fields, and `updateHitList` (DB) writes them.
- Tests 814 → 841: new `area.test.ts` (14), +9 in `hit-lists-store.test.ts`, +4 in `db-hit-lists.test.ts`. All were RED first: the module was missing, and 11 store/DB tests failed.
- Verified: `check.sh` green with 841 tests, `npx jest --ci` has 0 console.error, and tsc is clean.
- Next (S2-03): `spotCountLabel` still lives in `app/(tabs)/lists.tsx`. Move it to `src/utils/spot-name.ts` when the picker needs '23 spots'. The `createList(name, NewHitList)` and `updateHitList` hook work is S2-04's, as the plan says.
- Questions for Michael: none new (D53–D56 still open in spec §9).

### 2026-10-22 23:40 · S2-01 · passes

- New `docs/plans/2026-10-22-s2-area.md`. It covers: Geometry (`src/utils/area.ts`), Area lists (computed, never stored; one `selectAreaSpots` serves the picker count, the store, detail and the sheet), Picker screen (`app/area/index.tsx`, edit mode via `?listId`), Mock (`Circle`, `animateToRegion`, `geocodeAsync`), Lists tab and list screen, Add-to-list sheet and detail, Copy, a Test list per feature, Risks, and the review base `2488824`. It adds no migration and no dependency. Tests stay at 814 (only docs changed).
- Spec §2 gains D53–D56 *default*, and §9 gains Q14–17. 'Send these N spots' joins the picker in S7.
- Verified: `check.sh` green, 814 tests; the plan has every section that step 1 names.
- Next session (S2-02): `selectSpotLists`'s first parameter becomes the spot (detail is the only caller). `HitListUpdate` gains the area fields (`area_place: null` clears it). `spotCountLabel` moves to `src/utils/spot-name.ts`.
- Questions for Michael: D53, are spots with no location left out of area lists? D54, should the place be your search text / 'my location', or a reverse-geocoded town? D55, should the picker share the Spots tab's filters, with Edit area loading the list's filters? D56, default 2 mi / 2 km, and a saved radius never resized on a units switch?
- Proposed changes: S2-03 step 1 cites `node_modules/react-native-maps/lib/index.d.ts`, but the package has no `lib/`. The types are in `dist/src/index.d.ts` (+ `MapCircle.d.ts`, `MapView.d.ts`), so the mock comment will cite those. S2-04's Lists-tab step replaces S1-05's assertion that 'New area list' is absent.

### 2026-10-23 verify S1

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S1-01 | 1 | read docs/plans/2026-10-22-s1-hit-lists.md headings | Types, Migration 4, DB API, Store, Hook, SpotsBrowser, Tab bar (D49), Screens, Copy, Test list all present | yes |
| S1-01 | 2 | read plan lines 18-20 | area columns made in migration 4 for S2; sync_queue left alone until S5 | yes |
| S1-01 | 3 | read plan lines 173-205 | shared store filters scoped by spot set; lists the six tests that must pass unchanged | yes |
| S1-01 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-02 | 1 | `git diff 4aa5326..HEAD src/db/schema.ts`; grep LATEST_SCHEMA_VERSION | 37 additions, 1 deletion (only the MIGRATIONS array line); LATEST = MIGRATIONS.length = 4 | yes |
| S1-02 | 2 | db-migrate.test.ts migration 4 block (7 tests), column list asserts | exact hit_lists/hit_list_spots columns; v2 fixture 2→3→4 intact; v4 re-migrate no change | yes |
| S1-02 | 3 | db-hit-lists.test.ts (20 tests) | round-trip, idempotent add, two lists, remove, soft delete keeps spots, FK cascade, rename bumps updated_at, soft-deleted-spot membership kept | yes |
| S1-02 | 4 | grep src/types, src/db/index.ts, factories.ts | HitList/HitListSpot exported, hit-lists re-exported, createTestHitList present | yes |
| S1-02 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green, 0 console.error | yes |
| S1-03 | 1 | hit-lists-store.test.ts (10 tests); stores/index.ts export | selectors and activeListId default null verified | yes |
| S1-03 | 2 | use-hit-list-actions.test.ts passes | create/rename/delete/add/remove, store-first, revert+reject on DB failure | yes |
| S1-03 | 3 | db-init.test.ts 'loads hit lists…', 'getHitLists throws', 'getListMemberships throws'; separate try/catch in use-db-init.ts | isReady stays true | yes |
| S1-03 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-04 | 1 | read SpotsBrowser props; components/index.ts | props present (plus extras); exported | yes |
| S1-04 | 2 | git diff --stat on the six named tests | only spots-view-mode changed (import lines + new describe); others empty; all pass | yes |
| S1-04 | 3 | spots-browser.test.tsx passes | rows, empty title, search/clear, Map segment | yes |
| S1-04 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-05 | 1 | tabs-layout.test.tsx (2 tests); _layout.tsx | Spots, Lists (list.bullet), Profile in order | yes |
| S1-05 | 2 | lists-tab.test.tsx lines 59-73, 117-121, 130 | empty copy, My hit lists, counts ignore deleted, no Shared with me, push /list/<id> | yes |
| S1-05 | 3 | lists-tab.test.tsx lines 140-150, 230 | New hit list sheet, create pushes /list/L-new, double tap guarded | yes |
| S1-05 | 4 | lists-tab.test.tsx:122 | queryByLabelText('New area list') is null | yes |
| S1-05 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-06 | 1 | list-screen.test.tsx; _layout.tsx:49 | two rows, title, Map scoped, filter applies; Stack.Screen registered | yes |
| S1-06 | 2 | list-screen.test.tsx:153 and rename test | Rename sheet, empty copy exactly as written | yes |
| S1-06 | 3 | list-screen.test.tsx:255-256 | Delete Downtown? / Spots stay in your library.; remove-from-list alert | yes |
| S1-06 | 4 | list-screen.test.tsx:308,327 | 'This list is gone' for unknown and deleted ids | yes |
| S1-06 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-07 | 1 | add-to-list-sheet.test.tsx passes | checked states, add/remove calls, two-id case | yes |
| S1-07 | 2 | spot-detail.test.tsx:43,92,284 block | In lists row, only add chip when no lists, chip push /list/<id> | yes |
| S1-07 | 3 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-08 | 1 | spots-select.test.tsx passes | long press selects, counts, cancel, no navigation | yes |
| S1-08 | 2 | spots-select.test.tsx:183-203, 251-256 | select-bar 'Add to list (2)', sheet with both ids, mode ends; no /Send/ | yes |
| S1-08 | 3 | components.test.tsx:131-142 | checkbox role only when selectable | yes |
| S1-08 | 4 | spots-select.test.tsx:109,176 | Add new spot absent in select mode, back after | yes |
| S1-08 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-09 | 1 | list-picker-chips.test.tsx passes | tab roles, selected state, press calls setActiveListId, null with no lists | yes |
| S1-09 | 2 | spots-view-mode.test.tsx:99,128 | only the list's spots in List and Map; empty copy | yes |
| S1-09 | 3 | hit-lists-store.test.ts removeList test | activeListId reset to null | yes |
| S1-09 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-10 | 1 | read docs/plans/2026-10-22-s1-what-michael-will-see.md; ls src/__tests__ | grep walk; git status | five sections in order; no walkthrough test file; tree clean | yes |
| S1-10 | 2 | read sections What to tap, Known limits | both present with the required steps | yes |
| S1-10 | 3 | read lines 84-86 | jest counts, export exit 0, 4.3 MB bundle recorded | yes |
| S1-10 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-11 | 1 | wc -l reviews/s1.diff; read plan Review section; git show --stat e82e658 e218b59 | 4851-line diff; table with severities; both fixes commit tests with fix | yes |
| S1-11 | 2 | read the six written answers in plan Review | all six answered, backed by named tests (db-migrate IF NOT EXISTS case, inFlight, spots-select) | yes |
| S1-11 | 3 | git log 4aa5326..HEAD | grep refactor: | f6e0e0d refactor: commit with the simplification pass | yes |
| S1-11 | 4 | grep CLAUDE.md, README.md | Layout entries, Hit lists convention bullet, README 'Hit lists (S1)' present | yes |
| S1-11 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |

All 11 S1 features hold; no passes flag changed.

### 2026-10-23 01:45 · S1-11 · passes

- Opus review of `git diff 4aa5326..HEAD -- src app` (`reviews/s1.diff`, 4,851 lines). No Critical findings. Two Important ones, each fixed with a RED test watched failing in the same commit:
  - **I1 `e82e658`:** the open Add-to-list sheet now keeps the ids it opened with. Before, unticking the picker's active list pruned the selection to `[]`, so a re-tick added nothing.
  - **I2 `e218b59`:** `addSpotsToList` is one `INSERT OR IGNORE … SELECT FROM json_each(?)`. Before, a non-exclusive BEGIN/COMMIT on the shared connection meant two adds at once collided. This also covers S1-07's flag.
- The findings, all six answers and the minors not fixed (with reasons) are under 'Review' in `docs/plans/2026-10-22-s1-hit-lists.md`. S1-09's rollback flag (a) is kept as Minor.
- `refactor:` `f6e0e0d`: new `HeaderTextButton` (Filter, Select/Cancel, Rename), `EMPTY_LIST_COPY`, one alert path in `AddToListSheet`, unused React import removed, migration 4 comment corrected.
- Docs: CLAUDE.md Layout and a 'Hit lists' convention bullet; README 'Hit lists (S1)' bullet.
- Tests 807 → 814. `check.sh` green, `npx jest --ci` 64 suites with 0 console.error, `npx expo export --platform ios` exit 0. `spots-sort-search` and `spots-import-action` diffs are empty since `4aa5326`; `spots-view-mode` changed only imports and gained a new describe.
- **Next:** S1 is complete, so the S1 PR is due. Then S2-01. Note for S2: `selectListSpots` goes by membership only (S1-09 note).
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-23 01:05 · S1-10 · passes

- New `docs/plans/2026-10-22-s1-what-michael-will-see.md`: the Lists tab (two lists), the list screen (two spots), the spot detail 'In lists' row (one chip), the Spots tab in select mode (two selected) and the picker row, each with every visible text, role, label, hint and state in rendered order, plus 'What to tap', 'Known limits' and the commands run. Renders came from a temporary `walkthrough-s1.test.tsx`, deleted; `git status` shows no `src/__tests__/walkthrough*`.
- Verified: `npx jest --silent` 64 suites / 807 tests (unchanged), 0 `console.error` under `--ci`; `npx expo export --platform ios` exit 0, 4.3 MB hbc (4,328,700 bytes); `check.sh` green.
- Seen while rendering: the Spots tab keeps the picker row visible in select mode, so a picker tap there prunes the selection (as S1-09 built it). The list screen's empty hint says "select spots on the Spots tab", already noted for S1-11.
- Questions for Michael: none. Proposed changes: none.

### 2026-10-23 00:30 · S1-09 · passes

- New `src/components/ListPickerChips.tsx` (exported). It is connected to the store and takes no props. A horizontal `ScrollView` (`accessibilityRole 'tablist'`) shows 'My spots' then every live list by name (`selectListsByName`). Each chip is a `Chip role="tab"` with `accessibilityState { selected }`. `Chip`'s role union gains `'tab'`, and 'button' and 'tab' report `selected` while 'checkbox' keeps `checked`. With no live lists it renders `null`. The Spots tab (`app/(tabs)/index.tsx`) passes it as `aboveList` and scopes `spots` with `selectListSpots` when `activeListId` names a live list (an unknown id falls back to all spots). Both List and Map are scoped. An empty active list shows 'No spots in this list yet' / "Add from a spot's page or select spots on the Spots tab" with no action. Step 3 (deleting the active list resets `activeListId`) was already covered by `hit-lists-store.test` ('removeList of the active list…').
- Tests 789 → 807. New `list-picker-chips.test.tsx` (8). `spots-view-mode.test.tsx` +7 in a new describe; old cases unchanged, only import lines edited. `spots-select.test.tsx` +3 (picker switch prunes the selection, switching back doesn't re-check, switching to an empty list ends select mode). Watched RED (missing module, then 7 scope cases), then GREEN. `check.sh` green (807), `npx jest --ci` 64 suites with 0 console.error, `npx expo export --platform ios` exit 0 (4.2 MB hbc).
- Opus review: no Critical. Fixed with tests watched failing first: (I) a selection hidden by a picker switch came back checked on switching back. Before, only the shown copy (`chosen`) was filtered; now `selected` itself is pruned to the in-scope ids during render. (Minor) the tablist role. (Minor) the sheet test now asserts `visible`, and the delete test asserts 'My spots' is selected afterwards.
- **For S1-11:** `use-hit-list-actions.ts:88`: if deleting the active list fails, the rollback re-selects it whenever `activeListId === null`, which also overrides a 'My spots' tap made during the delete. That race is now reachable through the picker. Also for S1-11: the empty copy says "select spots on the Spots tab" while you're on the Spots tab (it is the plan's copy, kept).
- **For S2:** `selectListSpots` goes by membership only, so an area list in the picker would show empty until S2 scopes area lists by their centre and radius.
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 23:55 · S1-08 · passes

- Spots tab (`app/(tabs)/index.tsx`) has select mode. A row long press enters it with that row checked; 'Select' (label 'Select spots') enters with nothing checked. While selecting, a tap toggles and never navigates, the header title is '<N> selected' (`headerTitle`, so the tab bar label stays 'Spots'), 'Cancel' (label 'Cancel selection') ends it, the FAB column is hidden, and the bottom bar (testID 'select-bar') has 'Add to list (N)' (disabled at 0), which opens `AddToListSheet spotIds={selection}`. Done or a swipe-down ends select mode, and so do Map and the last spot going. Only live spots count and get filed. `SpotListItem` gains `selectable`/`selected` (role 'checkbox' + `accessibilityState { checked }` + a check circle; unchanged otherwise). `SpotsBrowser` gains `onSpotPress`, `selectedIds`, `headerTitle` and `headerLeft`.
- **Deviation from the plan:** Select/Cancel sit in `headerLeft`, not before Filter in `headerRight`. `spots-sort-search`'s header helper reads the one button in headerRight (`getByRole('button')`), so a second button there would have meant editing a guarded test, which S1-11 wants unmodified. All six guarded files have an empty `git diff`.
- Tests 772 → 789: new `spots-select.test.tsx` (14), `components.test.tsx` +3 (SpotListItem). Watched RED (10 failing, then the 2 review cases), then GREEN. `check.sh` green (789), `npx jest --ci` 63 suites with 0 console.error, `npx expo export --platform ios` exit 0 (4.3 MB hbc).
- Opus review: no Critical. Fixed with tests: (I) the selection held deleted spots, so it is now pruned to live spots and select mode ends at 0 spots. (I) `SpotsBrowser`'s options now always carry `headerTitle`/`headerLeft`, which overwrite a layout's; documented in a comment (a screen sets them through the props). Added a navigation control test and a sheet `onRequestClose` test. Not changed: spots hidden by search/filter while selecting stay selected and are counted (like Photos).
- Next (S1-09): pass `ListPickerChips` as `aboveList`, and scope `spots` by `activeListId` in the same screen. The select mode's pruning already reads `spots`, so a picker switch prunes the selection to the list.
- Questions for Michael: none new. Proposed changes: S1-08 step 1's "header shows 'Select' replaced by 'Cancel'" holds on the header's left side.

### 2026-10-22 23:20 · S1-07 · passes

- New `src/components/AddToListSheet.tsx` (exported): a pageSheet Modal titled 'Add to hit list' with 'Done'. It has one checkbox row per live manual list in name order, checked when **every** given spot is in it (never for `[]`), and a '+ New hit list' row that opens the nested `NameListSheet` → `createList`, then adds the spots. Writes happen at once. A failure alerts "Couldn't update the list" or "Couldn't create the list" / 'Please try again.' (copy not in the plan's table). Detail `app/spot/[id]/index.tsx`: a new `InLists` row (label 'In lists', one `Chip role="button"` per `selectSpotLists` → `/list/<id>`, then '+ Add to hit list', label 'Add to hit list') sits between the tag chips and the speed bar. Added `'checkmark': 'check'` to the icon `MAPPING`.
- Tests 751 → 772: new `add-to-list-sheet.test.tsx` (15), `spot-detail.test.tsx` +6. Watched RED (missing module; 5 detail cases failing), then GREEN. Four old detail assertions pinned the whole screen's texts/buttons, so they now include the new row (`IN_NO_LISTS`; the only button is 'Add to hit list'). Their intent (no old-model sections; tags aren't buttons) is unchanged. `check.sh` green (772), `npx jest --ci` 62 suites with 0 console.error, `npx expo export --platform ios` exit 0 (4.3 MB hbc).
- Opus review: nothing Critical or Important. I fixed four Minor findings, with tests: `[]` spotIds checked every row (watched RED), add-failure and create-then-add-failure alerts, the hit-lists store reset moved to the file-level `beforeEach`, and a deleted list next to a live one. **For S1-11:** two fast toggles can overlap, and `withTransactionAsync` isn't exclusive. If A's add transaction fails and rolls back, B's delete inside it rolls back too, though B already resolved, so the store and DB disagree until relaunch. Fix: queue writes in the hook or use an exclusive transaction.
- Next (S1-08): render `<AddToListSheet visible spotIds={selected} onClose={…} />`. It reads the store itself and `useHitListActions` internally, so mock `@/src/hooks/use-hit-list-actions` as add-to-list-sheet.test does.
- Questions for Michael: none new. Proposed changes: none. (Reviewer note: 'In lists' could go below the speed bar instead. I followed the plan's "under the tag line".)

### 2026-10-22 22:45 · S1-06 · passes

- New `app/list/[id]/index.tsx` (registered in `app/_layout.tsx` as `list/[id]/index`, default title 'Hit list'). It renders `SpotsBrowser` with `selectListSpots` (shared filters, search and sort, D52), titled with the list's name. The header has 'Rename' (label 'Rename list') opening `NameListSheet` 'Rename list'/'Save'. A row long press shows an Alert '<display name>' with 'Remove from list' and Cancel. The bottom bar's 'Delete list' confirms with 'Delete <name>?' / 'Spots stay in your library.', then deletes and goes back, or `replace('/(tabs)/lists')` when there's no history. An unknown or deleted id shows 'This list is gone' / 'It may have been deleted.' and resets the header. Failures alert "Couldn't rename the list", "Couldn't remove the spot" or "Couldn't delete the list". I added these strings because the plan's copy table has none for failures.
- `SpotsBrowser` gains `headerActions` (rendered in headerRight before Filter) and `onSpotLongPress`. `SpotListItem` gains optional `onLongPress`.
- Tests 729 → 751: new `list-screen.test.tsx` (19), `spots-browser.test.tsx` +2, `root-layout.test.tsx` +1. All were watched RED (missing module, missing props or route), then GREEN. `check.sh` is green (751), `npx jest --ci` has 0 console.error, and `npx expo export --platform ios` exits 0 (4.2 MB hbc).
- Opus review: no Critical or Important findings. I fixed both Minor ones with tests watched failing first. (1) The header kept the old title and Rename/Filter after the list vanished. (2) Delete with no back history now goes to the Lists tab. I also added a guard so the screen doesn't flash 'This list is gone' while it pops after Delete.
- Next (S1-07/08): in tests, press header buttons through the element's `onPress` (see `openRename` in list-screen.test). Rendering `headerRight()` as a second `render` root makes RNTL 13 drop every later fireEvent on the screen, because it only treats elements in the latest root as mounted. S1-08 should reuse `onSpotLongPress`/`headerActions`. The plan's `onSpotPress`/`selectedIds` props are not added yet.
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 22:05 · S1-05 · passes

- Tabs are now Spots · Lists · Profile (`app/(tabs)/_layout.tsx`, Lists: `list.bullet`, header 'Hit lists'; `'list.bullet': 'format-list-bulleted'` added to `MAPPING` in `components/ui/icon-symbol.tsx`). New `app/(tabs)/lists.tsx`: a '+ New hit list' row (label 'New hit list'), a `SectionList` with 'My hit lists' (name order, live counts '1 spot' / 'N spots', row label '<name>, N spots', press → `/list/<id>`), or `EmptyState` 'No hit lists yet' (no second action). New `src/components/NameListSheet.tsx` (exported): fade Modal card, input 'Name' (label 'List name'), Cancel + confirm. Confirm is disabled while the trimmed name is empty or a submit is running (a ref also blocks a same-tick Return + tap), Cancel/backdrop do nothing mid-submit, `submitBehavior="submit"`. A failed create shows Alert "Couldn't create the list" / 'Please try again.' and leaves the sheet open (copy not in the plan's table; added so failures aren't silent).
- Tests 712 → 729: new `tabs-layout.test.tsx` (2) and `lists-tab.test.tsx` (15, mocked `useHitListActions`). Watched RED (missing `lists` tab and module), then GREEN. The Opus review found nothing Critical. Fixed with tests watched failing first: cancel during a submit, same-tick double submit, counts that update live, case-insensitive order, all-deleted lists, blank name + Return. `check.sh` green (729 tests). `npx jest --ci`: 60 suites, 0 console.error lines. `npx expo export --platform ios` exit 0 (4.3 MB).
- Next (S1-06): `app/list/[id]` doesn't exist yet, so on the phone a row tap or Create lands on an unmatched route until S1-06. Reuse `NameListSheet` for Rename (`title='Rename list' initialName confirmLabel='Save'`; `onSubmit` must throw on failure to keep the sheet open). Two lists with the same name and count share an accessibility label (minor, left as is).
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 21:35 · S1-04 · passes

- New `src/components/SpotsBrowser.tsx` (exported from `src/components/index.ts`): the Spots tab's whole List | Map body moved over unchanged: SegmentedControl, search, SortChips, SpotMap, both empty states, FlashList, the header Filter button (its own `<Stack.Screen options={{ headerRight }} />`) and FilterSheet. Props `spots, emptyTitle, emptyMessage, emptyActionLabel?, onEmptyAction?, aboveList?` (rendered above the mode bar) and `contentBottomInset?` (default `spacing.md`). `app/(tabs)/index.tsx` is now 90 lines: `<SpotsBrowser spots={all} …/>` + the FAB column, passing `LIST_BOTTOM_PADDING` as the inset.
- Tests 706 → 712: new `spots-browser.test.tsx` (6: two rows, empty title/message/action, searchQuery narrows then 'No matching spots' + 'Clear search', Map hands SpotMap the filtered spots, bottom inset, aboveList). Watched RED (SpotsBrowser undefined, 6 failing), then GREEN. The six guarded files (spots-view-mode, spots-sort-search, spot-list, spot-map, filter-sheet, spots-import-action): `git diff --stat 4aa5326` on them is empty and all pass. `check.sh` green (712 tests), `npx jest --ci` 0 console.error lines. A `diff` of the old screen against SpotsBrowser shows only the props, `aboveList` and the inset.
- Next (S1-05/06): SpotsBrowser has no `headerActions`/`onSpotPress`/`onSpotLongPress`/`selectedIds` yet (S1-06/S1-08 add them per the plan). Every SpotsBrowser sets `headerRight` itself, so a screen that wants its own header buttons must pass them through `headerActions`, not its own Stack.Screen headerRight.
- Questions for Michael: none new.
- Proposed changes: S1-04 step 2 says the Spots tab renders "the Filter header button"; per the S1 plan the Filter button lives in SpotsBrowser (it owns FilterSheet, and every list screen needs it too). The tab still shows it; read the step as "the tab still shows it".

### 2026-10-22 21:10 · S1-03 · passes

- New `src/stores/hit-lists-store.ts` (lists, membershipBySpot, activeListId + the plan's 8 actions; pure selectors `selectListSpots(list, spots, m)`, `selectSpotLists(spotId, lists, m)` (name order), `selectListCounts`, `selectListsByName` (case-insensitive)), exported from `src/stores/index.ts`. New `src/hooks/use-hit-list-actions.ts` (createList/renameList/deleteList/addSpotsToList/removeSpotFromList: store first, DB after, on rejection `console.error('[useHitListActions] <fn> failed:')`, revert, rethrow). `useDbInit` loads `getHitLists` then `getListMemberships` after media, before settings, each in its own try/catch.
- Tests 680 → 706: `hit-lists-store.test.ts` (10), `use-hit-list-actions.test.ts` (13, real node:sqlite via a `useSQLiteContext` override, failures via `jest.spyOn(db, 'runAsync'|'withTransactionAsync').mockRejectedValueOnce`), `db-init.test.ts` +3 (its `@/src/db` mock gained the two getters). Watched RED (missing modules, then 3 db-init failures), then GREEN; `check.sh` green (706 tests, 0 console.error), target suites stable over 3 reruns.
- Opus review: no high-severity bugs. Fixed: a failed deleteList no longer overwrites a list picked while it was pending (test watched failing first). Left for S1's review feature (overlapping writes only): (1) two pending addSpotsToList of the same spot, first fails/second succeeds → store drops a spot the DB has; (2) two overlapping renames that both fail, or share a millisecond stamp, can leave store ≠ DB; (3) a rename during a pending delete that then fails restores the stale name. Fix idea: revert by re-reading the row/memberships from the DB.
- Next (S1-04): store state the screens read is `useHitListsStore((s) => s.lists)` / `s.membershipBySpot` + `useMemo` the selectors; `deleteList` keeps the deleted list's ids in `membershipBySpot` (selectors skip absent lists) so a revert is clean.
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 20:40 · S1-02 · passes

- Migration 4 (`src/db/schema.ts`, `IF NOT EXISTS`): `hit_lists` (13 columns, area + owner reserved) and `hit_list_spots` (PK list_id+spot_id, both FKs `ON DELETE CASCADE`) + `idx_hit_lists_deleted_at`, `idx_hit_list_spots_spot_id`. Only the `MIGRATIONS` array line changed; migrations 1–3 untouched.
- New `src/db/hit-lists.ts` (insertHitList, getHitLists, updateHitList, softDeleteHitList, addSpotsToList, removeSpotFromList, getListMemberships), re-exported from `src/db/index.ts`; `HitList`, `HitListKind`, `HitListSpot`, `HitListUpdate` in `src/types/index.ts`; `createTestHitList` in `factories.ts` (fixed 2026-10-01T12:00Z stamps).
- Tests 656 → 680: new `db-hit-lists.test.ts` (17 cases: round-trip incl. area columns, idempotent add keeps first added_at, two lists, remove, soft delete keeps spots, both cascades, FK rejects unknown spot, rename bumps updated_at, deleted list not updatable, soft-deleted spot keeps its row, bad area_filters_json → warn) + 7 migration-4 cases in `db-migrate.test.ts`. Watched RED (missing factory/migration), then GREEN; `check.sh` green (680 tests, 0 console.error).
- Plan correction: four existing migration-3 cases pinned `toBe(3)` and the fresh-DB table list, so they now use `LATEST_SCHEMA_VERSION` / include the two tables (the plan said none needed editing).
- Next (S1-03): `softDeleteHitList`/`addSpotsToList` take an optional ISO stamp (default now) so the hook can pass the store's stamp; `getListMemberships` ignores deleted lists but not deleted spots.
- Proposed changes: S1-02 step 1 "additions only" can't hold literally (the `MIGRATIONS = [...]` line must change); read it as "migrations 1–3 unchanged".

### 2026-10-22 20:10 · S1-01 · passes

- New `docs/plans/2026-10-22-s1-hit-lists.md`: decisions, Types, Migration 4 (exact SQL, `IF NOT EXISTS`, two indexes `idx_hit_lists_deleted_at`, `idx_hit_list_spots_spot_id`), DB API, Store, Hook (revert table), SpotsBrowser, Tab bar, Screens, Copy, a RED test list per feature S1-02…S1-09, risks. Docs only; tests 656 → 656.
- Spec: **D52 *default*** in §2 (one set of filters/search/sort/List|Map shared by the Spots tab, list screens and the picker) and asked as §9 Q13.
- Verified: every required section/string grepped in the plan; `check.sh` green (656 tests, 13 s).
- Next sessions: SpotsBrowser keeps exactly S1-04's props plus optional `contentBottomInset` (S1-04); `headerActions`, `onSpotPress`, `onSpotLongPress`, `selectedIds` are added by S1-06/S1-08 (Filter stays in SpotsBrowser's `headerRight`, screens set only `title`). `'list.bullet'` must be added to `MAPPING` in `components/ui/icon-symbol.tsx` (typed names). Existing migrate tests use `LATEST_SCHEMA_VERSION`, so none needs editing. Lists tab header title is 'Hit lists' (`headerTitle`), tab label 'Lists'.
- Question for Michael: D52 (§9 Q13): filters shared across the Spots tab and lists (default), or per list?
- Proposed changes: none.

### 2026-10-22 · init (Fable) · feature list written

**Counts.** 76 features in 10 milestones: S1 hit lists 11 · S2 area lists 6 · S3 backend 8 ·
S4 accounts 8 · S5 sync 9 · S6 friends and Inbox 7 · S7 Send 8 · S8 shared lists 9 · S9 links 7 ·
S10 sweep 3. Models: 66 opus, 10 sonnet (checks and docs). Every milestone: plan → builds (pure rules
before wiring, DB before store before screen) → `check` ("what Michael will see", sonnet) → review +
simplify (opus). The first feature of each milestone carries `after`: S1 `[]`, S2 `[S1]`, S3 `[]`
(the SQL side is independent of the app), S4 `[S3]`, S5 `[S2, S4]`, S6 `[S4]`, S7 `[S5, S6]`,
S8 `[S5, S6]`, S9 `[S7, S8]`, S10 `[S9]`. In the last run (hit_list-2026-10-20, 39 features) opus
features took 1–16 min each; these are sized a little larger because the backend ones carry Docker
and pgTAP.

**Baseline.** `main` at `5c7404e` merged into this branch; `4aa5326` is the run's start commit (use it as
the S1 diff base). 54 suites, 656 tests, check green in 40 s. Node 24.21, npm 11.19, Docker 29.1.3
(Pop!_OS 24.04), 651 GB free. `gh` is logged in as mh550, git protocol ssh.

#### Where things live (read CLAUDE.md first; this adds what the spec needs)

- **Local DB**: `src/db/schema.ts` has 3 migrations (`MIGRATIONS`, `PRAGMA user_version`). Append only. The
  plan reserves: migration 4 = `hit_lists` + `hit_list_spots` with the area columns (S1); 5 = `owner_id`
  on spots/media/hit_lists + `sync_outbox` + `sync_state`, and drops the never-used `sync_queue` from
  migration 1 (S5; `SyncQueueItem` in `src/types/index.ts` goes with it); 6 = local `profiles`
  (S6); 7 = `copied_from_send`, `from_username` on spots (S7); 8 = `hit_list_members` (S8). Tests use
  `src/__tests__/helpers/node-sqlite-db.ts` (`createTestDb` / `createMigratedTestDb`); `db-migrate.test.ts`
  checks every version step with `PRAGMA table_info`.
- **DB access pattern**: `src/db/spots.ts` selects explicit `SPOT_COLUMNS`, maps rows in `rowToSpot`
  (`natural_speed` 0 is real; `null` → undefined), and `src/db/index.ts` re-exports everything. Hooks
  (`use-spot-actions.ts`) write the zustand store first, then the DB, and revert on failure. Copy that
  pattern for hit lists (`src/db/hit-lists.ts`, `use-hit-list-actions.ts`).
- **Screens**: `app/(tabs)/_layout.tsx` has two tabs (index = Spots, profile); S1 adds `lists`, S6 adds
  `inbox` (order Spots · Lists · Inbox · Profile, D49). `app/(tabs)/index.tsx` (299 lines) holds the
  List | Map body that S1-04 extracts into `SpotsBrowser` so `app/list/[id]/index.tsx` can reuse it.
  New stack screens register in `app/_layout.tsx`. The detail screen is `app/spot/[id]/index.tsx`
  (the 'In lists' row goes under the tag line). Profile is `app/(tabs)/profile.tsx` (Units + Import
  radius; the Account section goes on top).
- **Mocks**: `jest.setup.ts` mocks expo-router (`useRouter`/`useLocalSearchParams` overridable),
  expo-sqlite (`useSQLiteContext` → `{}`; real queries need the node:sqlite harness), expo-location,
  expo-image, FlashList (renders every row), icons (`testID icon-<name>`), expo-crypto (Node crypto).
  `__mocks__/react-native-maps.tsx` exports `MapView` (default), `Marker`, `mockMapMethods`; S2-03 adds
  `Circle` and `onRegionChangeComplete`. `jest-environment-jsdom` is already in node_modules (via
  jest-expo) for the S9 web page test.
- **Ids** from `newId()` (expo-crypto). Tokens (S9) also from expo-crypto (`getRandomBytes`,
  `digestStringAsync`), never the `uuid` package or Node crypto in app code.

#### Supabase: facts checked at init

- No `supabase` CLI on the box and no Supabase images in Docker yet: S3-01's first `npx supabase start`
  pulls ~2 GB of images; expect several minutes. Ports 54321–54324 are free (only Metro's 8081 is
  listening). Other containers on the box: `dj-*`, `n8n-*`. **Only `supabase_*_hit-list` is ours.**
- Registry at init: `supabase` 2.121.0, `@supabase/supabase-js` 2.118.0 (deps auth-js, postgrest-js,
  storage-js, realtime-js, functions-js, same version), `expo-secure-store` 57.0.4,
  `expo-image-manipulator` 57.0.21. Install with `npx expo install <pkg>` (use `--dev` for the CLI and
  `-- --save-exact` to pin it); `npx expo install` picks the SDK-57-compatible version of Expo packages.
- `npx supabase init` writes `supabase/config.toml`; set `project_id = "hit-list"`. `supabase test db`
  runs `supabase/tests/*.sql` with pg_prove inside the db container (pgTAP is bundled). `supabase/seed.sql`
  runs on `db reset` only and is never pushed by `db push`: that is where the `tests` schema helpers go
  (`tests.create_user`, `tests.authenticate_as(uid)` = `set local role authenticated; set local
  request.jwt.claims = '{"sub": "<uid>", "role": "authenticated"}'`, `tests.clear_auth`).
- Edge Functions are served by `supabase start`'s edge-runtime container at
  `http://127.0.0.1:54321/functions/v1/<name>`; `[functions.<name>] verify_jwt = false` in config.toml
  makes one public (share-preview). Supabase rewrites `text/html` responses from functions, hence the
  static page in `web/share/` (D45).
- Email codes in the local stack land in Mailpit at `http://127.0.0.1:54324`. Integration tests avoid the
  mailbox: `auth.admin.generateLink({ type: 'magiclink', email })` returns `properties.email_otp`, then
  `verifyOtp({ email, token, type: 'email' })`.
- Keys: `npx supabase status -o json` prints the anon and service-role keys. They are the public local
  demo keys, but the brief says no secrets in files: `scripts/supabase-env.mjs` (S4-06) injects them into
  the test process; `.env.example` holds empty values; `.gitignore` today ignores only `.env*.local`, so
  S4-01 adds `.env`, `.env.*`, `!.env.example`.
- Integration tests (`src/__integration__/`, `jest.integration.config.js`, `npm run test:integration`)
  are outside the default Jest config so CI and `npx jest --ci` never need Docker.
- `supabase-js` in Jest: unit tests use a hand-written fake (`src/__tests__/helpers/fake-supabase.ts`)
  whose member names come from `node_modules/@supabase/*/dist/module/*.d.ts` (CLAUDE.md's "fakes mirror
  the real API" rule). Photo upload takes an injectable byte reader so Node integration tests pass a
  Buffer while the app passes expo-file-system `File` bytes.

#### Gotchas for workers

- **RED first, really.** For pgTAP the feature steps ask for the RED commit hash in the plan's Review
  section; the verifier checks `git log`. Commit the `.test.sql` before the migration that makes it pass.
- **Stop the stack** at the end of every feature that started it (`npx supabase stop`), and record it:
  the step "docker ps shows no supabase_* container" is verified.
- **The Spots tab's existing tests must pass unmodified** after the S1-04 extraction (the step says
  `git diff --stat` on those files shows at most import edits).
- **Copy is asserted.** The D34 sentences and the Send/Share word rule are exact strings in the steps;
  put them in `src/constants/copy.ts` (or next to the component) and reuse the constant in the test.
- `console.error` in Jest is a failure. Sync failures log with `console.warn`.
- Lockfile changes go in their own `chore:` commit; `npm dedupe` if `expo-modules-core` nests.
- `after` on a feature means the harness can run it while an earlier feature waits; it does not mean it
  runs on a different branch. Everything is one linear branch; milestones become PRs in order.
- Diff bases for reviews: S1 uses `4aa5326`; later reviews name the last commit of the previous milestone
  in their plan's Review section.

#### Decisions taken here (defaults for Michael, all reversible; the plan sessions record them as D52+ in the spec)

1. **Migration split**: several appended local migrations (4–8), one per milestone, instead of the spec's
   single "new migration". Same end state; each milestone ships alone.
2. **`sync_queue` dropped** in migration 5 (never read by any code; `sync_outbox` replaces it).
3. **`hit_list_members.status`** 'invited' | 'member': §3.5's Join / Decline needs a pending state the
   §3.2 table lacks; RLS grants reads to 'member' only.
4. **Session storage**: Supabase's documented LargeSecureStore (AES key in expo-secure-store, ciphertext in
   AsyncStorage) because an OTP session JSON can exceed SecureStore's 2048-byte value limit.
5. **Sign-out prompt** (D38 Keep / Remove) arrives in S5, not S4: in S4 nothing is backed up yet, so
   "Remove from this phone" would lose data. S4 signs out plainly.
6. **Switching accounts on one phone**: when a different account signs in, the previous account's local
   rows and photo files are removed (its data was pushed), and unowned rows are adopted by the new account.
7. **Send photo copy** is done by the client with `storage.copy` into `sends/<send_id>/` before
   `create_send`; S7-01 decides one-row-per-recipient vs a shared photo set and re-checks the storage policy.
8. **Link token in the URL fragment** (`#t=`), so it never reaches a server log; the page reads it and
   calls the function with `?t=`.
9. **Area list ignores NO_LOCATION spots**; the place label is the search text typed (or "my location").

#### Questions for Michael (defaults above are built unless you answer in INBOX.md)

- §9 Q1–Q12 of the spec stand as written; nothing re-opened.
- Q13 (new): is "hit list" alongside the Lists tab's "List | Map" toggle fine, or should the tab be
  called "Hit lists"? Default: tab title "Lists", screen header "Hit lists".
- Q14 (new): the first `npx supabase start` pulls ~2 GB of Docker images onto the box. Default: go ahead.
- Q15 (new): photos sent by link are visible to anyone holding the link for 30 days (D44 default). If you
  would rather every link needs an account, say so before S9 starts.
