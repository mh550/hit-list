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

### 2026-10-23 · verify S10

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S10-01 | 1 | `git cat-file -t 4aa5326`; `wc -l reviews/run*.diff`; read sweep doc 'Final review'; `git log` of the RED/GREEN commits | run.diff 48 118 lines, split run-data 10 068 / run-ui 8 294; table has id, severity, file:line, fix commit for D1,U1,U2,U3 (+ left items); each RED commit precedes its GREEN (45693e3<20431b0 ancestor, 2bc234c→5c9db25, bcb6093→2b118e8, b95bd2c→7acab3a) | yes |
| S10-01 | 2 | Read sweep 'five anti-goals'; `ls supabase/tests`; sum of `select plan(n)`; sweep's Sign in grep list | All five answered with named tests; 12 pgTAP files, plan total 640 = the 640 recorded; 010-schema asserts RLS on the ten tables; Sign in occurrences listed with screens | yes |
| S10-01 | 3 | `npx expo export --platform ios` (scratch dir); `npx expo-doctor`; the stale grep | export exit 0, 5.4 MB; doctor 21/21; grep prints only src/__tests__/db-migrate.test.ts:736-745 (the test proving migration drops sync_queue, D65), no app code: literal 'prints nothing' not met, intent (no stale app use) met, sweep flags it | yes (test-only hit) |
| S10-01 | 4 | Did NOT start the stack (harness policy build-only: no containers). Read sweep Checks table; `docker ps --format '{{.Names}}'`; static pgTAP plan sum | Counts recorded: pgTAP 640, integration 79, jest 2088 (check.sh re-confirmed 2088 green); docker ps shows only dj-*/n8n-*, no supabase_* left. Stack runs themselves not re-executed by me | yes (counts read, not re-run) |
| S10-01 | 5 | `/home/mh550/projects/agent-harness/lib/check.sh` | check: green, 2088 tests (lint+tsc+jest --silent) | yes |
| S10-02 | 1 | Read APP_SPECIFICATIONS.md lines 3-93, 581-583, 655-690 | '## Accounts and sharing (2026-10-22)' at line 45 right after Simplified model; vocabulary table (7 terms), two verbs, ownership, server model with ten tables + RLS rule, sync D48, links D44/D45, spec pointer; three [FUTURE] headings retitled [SUPERSEDED] with pointer, text kept; 'Built as (2026-10-22)' under Sync Strategy | yes |
| S10-02 | 2 | Read README.md Status | Dated 2026-10-22; bullets for hit lists, area lists, accounts (email code), friends/Inbox, Send, Share, links; run needs: local stack, .env.local over Tailscale, nothing deployed | yes |
| S10-02 | 3 | grep of CLAUDE.md for each required term | All present: optional accounts + local Docker stack, supabase-js/2.121.0/secure-store/async-storage/image-manipulator/clipboard, all db:* and test:integration commands + Docker rule, listed screens/dirs, Send/Share rule, owner_id, Paths.cache, .env, append-only, pgTAP/seed.sql/jest.integration/fake-supabase | yes |
| S10-02 | 4 | grep docs/RUNNING-ON-PHONE.md | '## With accounts (local stack over Tailscale)' line 93 with db:start, .env.local, Mailpit :54324, Studio :54323, db:stop; line 21 now 'git switch main', no 'overnight' | yes |
| S10-02 | 5 | check.sh | green, 2088 tests | yes |
| S10-03 | 1 | Read docs/plans/2026-10-22-sharing-what-michael-will-see.md headings + links | Sections 0-8 in required order (hit/area list, sign in+Backed up, friends, send/save, share/join/add/leave, link+revoke, sign-out prompt, Delete account) + 'If something is off' with stack, Mailpit, 'N changes not backed up', pull to refresh; links to all 8 existing per-milestone files (S3 has none) | yes |
| S10-03 | 2 | Read live-checklist.md (317 lines) headings, checkboxes, grep of commands | §10 items as checkboxes; link --project-ref, db push (dry run first), functions deploy share-preview account-delete, EXPO_PUBLIC_* incl. SHARE_BASE_URL, custom SMTP, meta tag hitlist-functions-url hosting; 'Cloud rollout, in order' steps 1-8 each with check and undo; 'Later, with a dev build' item 8 present | yes |
| S10-03 | 3 | Compared spec §2 D52-D96 (rows) with §9 text (loop D52..D96 grep) and progress.md S10-03 entry | No D number 52-96 missing in §9; D97+ none; progress S10-03 entry lists D52-D96, one line each | yes |
| S10-03 | 4 | check.sh | green, 2088 tests | yes |

14 hold, 0 fail. Note: S10-01 step 3's literal grep matches one test file; wording should exclude `src/__tests__`.

### 2026-10-23 · S10-03 · passes
Docs only. New `docs/plans/2026-10-22-sharing-what-michael-will-see.md` (the 8-step two-rider walk, 'If something is off', links to S1/S2/S4–S9 files). `docs/plans/2026-10-22-live-checklist.md` gains 'Cloud rollout, in order' (create project, link, push dry run, functions, auth/SMTP, env values, hosting, each with check and undo; 'Later' items kept). Spec §2/§9 checked: every D52–D96 appears in both. Verified: check.sh green, 2088 tests (unchanged). No questions beyond §9.
Defaults the run added for Michael to overrule (spec §2/§9), one line each:
| D52 | **One set of filters, search, sort and List | Map for every view** *default* | The Spots tab, each hit list's screen and the list picker read and write the same `useSpotsStore` fields; only the set of spots differs. A filter set on a list is still on back on the Spots tab (the Filter count shows it). | S1 plan (`docs/plans/2026-10-22-s1-hit-lists.md`): simplest, no per-list state (§9 Q13) |
- D53 An area list ignores spots with no location
- D54 An area's place name is the rider's search text or 'my location'
- D55 The area picker uses the shared filters (D52)
- D56 Area radius: default 2 mi / 2 km; a saved radius is never resized
- D57 A shared-list invitation is a member row with `status = 'invited'`
- D58 A display name is at most 50 characters
- D59 Blocking hides the blocked rider's sends to you; your own pending sends to them stay
- D60 An invite link lets any signed-in rider who holds it join once; it dies with the list's sharing
- D61 The session is stored in the iOS keychain, large sessions encrypted
- D62 Sign out in S4 is plain; the Keep / Remove prompt (D38) arrives with S5
- D63 A display name is optional
- D64 The username screen has a Sign out
- D65 The unused `sync_queue` table is dropped
- D66 A different account signing in removes the previous account's local rows after its data was pushed
- D67 Keep after Delete account makes the spots phone-only again
- D68 "Older details" stay on the phone
- D69 Sign out backs up first; Remove only when nothing is waiting
- D70 Spots deleted before the first sign-in stay on the phone only
- D71 Delete account keeps the phone's spots first, then asks
- D72 Friends' names are kept on the phone
- D73 A request you sent shows the name only on the phone you sent it from
- D74 Friends has a 'Blocked' section with Unblock
- D75 Opening the Inbox marks everything in it seen
- D76 A send to several friends is one send per friend, each with its own photo copy
- D77 A send's photos are copied before the send exists
- D78 Sending needs the spots backed up
- D79 At most 100 spots per send
- D80 The sender's name on a send is the server's, and "From @name" is frozen
- D81 Saving some of a send's spots finishes it
- D82 A dismissed send reads "Waiting" to its sender
- D83 An invitee sees a shared list's name, owner and spot count, no spots, until Join
- D84 A shared list's member count is its joined members plus the owner
- D85 Sharing a list needs it backed up
- D86 Others' spots leave the phone when you sign out
- D87 Send never sends someone else's spot onward
- D88 One role per Share batch
- D89 Save a copy downloads the photos first; ones that fail are left out
- D90 The first-add confirmation is once per shared list on this phone
- D91 Others' photos download when first shown and live in the phone's cache
- D92 The link base URL defaults to `http://localhost:8080/share/`
- D93 Revoking a send link also takes back its spots
- D94 Each Copy link is its own send
- D95 A pasted send link opens its web page
- D96 A link's page asks for it with a POST

### 2026-10-23 · S10-02 · passes
Docs only. APP_SPECIFICATIONS.md: new '## Accounts and sharing (2026-10-22)' (vocabulary, two verbs, ownership, server model + RLS rule, D48 sync, D44/D45 links, pointer) after the simplified-model section; the three [FUTURE] sharing headings retitled [SUPERSEDED] with a pointer; Sync Strategy 'Built as' note. README Status dated 2026-10-22 with the summary line and what Michael needs. CLAUDE.md: intro, Stack deps, Docker pointer, append-only SQL rule, pgTAP/integration/fake-supabase testing line. RUNNING-ON-PHONE: short 'With accounts' summary, Studio, `git switch main`.
Verified: check.sh green, 2088 tests (unchanged). No questions.

### 2026-10-23 13:00 · S10-01 · passes

Whole-run Opus review of `run.diff` (4aa5326..b9e850a, 48 118 lines) in two passes (data/sync/SQL 10 068, UI 8 294 lines, tests excluded): no Critical; 3 Important + 1 Minor fixed RED-first, 3 Minor left with reasons; table and the five anti-goal answers in `docs/plans/2026-10-22-s10-sweep.md` › Final review.
- D1 (Important): Stop sharing overwrote a list rename/circle still in the outbox with the server's row (edit lost). `stopSharing` now refuses with `ListNotBackedUpError` (D85, like `shareList`); Members syncs first and shows the refusal (45693e3 → 20431b0).
- U1 (Important): the send-link page told riders to Paste a link in the app, which only reopens the page (D95). It now says saving from a link isn't in the app yet; the invite page gets the Paste hint (2bc234c → 5c9db25).
- U2 (Important): 'Add friend' on a non-friend member row (§3.5) was dropped in S8 and is now built (bcb6093 → 2b118e8). U3 (Minor): the Spots picker no longer keeps a list that left through a reload (b95bd2c → 7acab3a).
- Verified: jest 2080 → 2088, 0 console.error; fresh stack: pgTAP 12 files/640, integration 7/79; `supabase stop`, no supabase_* left (dj-*/n8n-* untouched); export exit 0, 5.4 MB; expo-doctor 21/21; check.sh green.
- Proposed change: S10-01 step 3's stale grep prints `src/__tests__/db-migrate.test.ts:736-745`, the test that proves migration drops `sync_queue` (D65); no app code matches. Exclude `src/__tests__` from that grep. Left for later: U4 (select mode counts others' spots), U5 (area editor by URL on another's list), D2 (clock-skew LWW, speculative).
- No new decisions; no questions for Michael.

### 2026-10-23 · verify S9

Re-ran: check.sh (green, 2080 tests); `db:start`, `db:reset`, `test:db` (12 files, 640 tests PASS), `test:integration` (7 suites, 79 tests), `db:stop` (docker ps: only dj-*/n8n-* left; no other container touched); `expo export` exit 0. Three later recorded decisions (D96 POST body, strict 22-char `parseToken`, D60 idempotent re-redeem) supersede the wording of some steps; each is marked "yes (D..)" and I judged the intent met. Result: 7 hold, 0 fail.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S9-01 | 1 | `grep expo-clipboard package.json`; `git log` chore commits; `npx expo export --platform ios --output-dir /tmp/hl-export-v9` | `expo-clipboard ~57.0.2` in own commit e3620d4; export exit 0 | yes |
| S9-01 | 2 | read `docs/plans/2026-10-22-s9-links.md` headings | Tokens, Base URL (D92), share-preview, Client, UI, Page, Tests, Copy table, Test list per feature all present; share-preview later changed GET→POST by D96 (recorded) | yes (D96) |
| S9-01 | 3 | `grep` live checklist | S9 section: host `web/share/`, set meta tag + `EXPO_PUBLIC_SHARE_BASE_URL`, `functions deploy share-preview account-delete` | yes |
| S9-01 | 4 | `check.sh` | green (lint, tsc, jest 2080) | yes |
| S9-02 | 1 | read `supabase/functions/share-preview/index.ts`, `config.toml:393-399` | `verify_jwt` false for share-preview, true for account-delete; `crypto.subtle.digest('SHA-256')`; `preview_link` via admin client; `SIGNED_URL_SECONDS = 600`; `Cache-Control: no-store`; no `spots`/`media` table read | yes |
| S9-02 | 2 | `test:integration` links-function.test.ts verbose | 200 with frozen spots, sender, signed URLs fetching fixture bytes, no auth header; unknown/revoked/withdrawn/expired/used/unshared/deleted all 404 gone, byte-identical test passes; invite → list name+inviter. Uses POST (D96), GET is 405 | yes (D96) |
| S9-02 | 3 | ran `db:start`, `db:reset`, `test:db`, `test:integration`, `db:stop`, `docker ps` | pgTAP 640 PASS; integration 79 PASS; after stop only dj-*/n8n-* containers | yes |
| S9-02 | 4 | `check.sh` + `npx jest --ci` on S9 files | green; no console.error lines | yes |
| S9-03 | 1 | `jest src/__tests__/link-token.test.ts` | newToken 22 base64url chars, differs; tokenHash = Node sha256; linkUrl `#t=`; parseToken accepts URL/`?t=`/bare token, null for other URL. Test uses 22-char tokens, not 'tok' (strict parse, S9-07 B3) | yes (B3) |
| S9-03 | 2 | `jest sync-links.test.ts` | create_link with hash + expiry 1d/7d/30d, never→null, invite 7d, revoke_link, listMyLinks statuses, redeemInvite parses URL and resolves list id | yes |
| S9-03 | 3 | `jest send-sheet, sent-screen, list-members` | expiry chips (30 days selected), D44 line, Copy link order + clipboard + toast; Sent link rows Active/Expired/Revoked, Revoke confirm; members Invite link, role, 'Used by @ben', Revoke: 180 passed with inbox | yes |
| S9-03 | 4 | `jest inbox-tab.test.tsx` Paste a link | row hidden signed out; 'Joined Downtown'; "That link doesn't work any more"; send link opens page URL | yes |
| S9-03 | 5 | `check.sh` | green, zero console.error | yes |
| S9-04 | 1 | read `web/share/index.html`, `share.js`; web-share tests | meta tag, textContent only (share.js-never-writes-HTML test), heading, cards, tags, maps links, Save-to-my-spots text, gone line, expiry | yes |
| S9-04 | 2 | `jest web-share.test.ts` verbose | send/invite/gone/missing-t (no fetch)/hostile-name-as-text cases all pass | yes |
| S9-04 | 3 | `web/share/README.md` | serve with `python3 -m http.server 8080` from `web/`; hosting is live step | yes |
| S9-04 | 4 | `check.sh` | green | yes |
| S9-05 | 1 | `test:integration` links.test.ts verbose | send link 2 spots no auth; revoke→gone; expired→gone; anon redeem refused; ben joins, pull brings spots; repeat gives list id (D60 idempotent, not error); cal refused; listMyLinks 'used' by ben | yes (D60) |
| S9-05 | 2 | same file | "static page renders the live answer: 2 spots from @ana and two photos that load" passes | yes |
| S9-05 | 3 | stack start/reset/test:db/test:integration/stop, `docker ps` | 640 pgTAP, 79 integration; no supabase_* left | yes |
| S9-05 | 4 | `check.sh` | green | yes |
| S9-06 | 1 | read `s9-what-michael-will-see.md` headings | send sheet link mode, Sent rows, members invite rows, Inbox paste + results, web page three states | yes |
| S9-06 | 2 | same file `## What to tap`, `## Where the page must be hosted later` | phone steps and hosting pointer to the live checklist present | yes |
| S9-06 | 3 | same file lines 96-102 | records jest counts, integration 77 (now 79 after S9-07 fixes), export exit 0 5.4 MB; I re-ran export exit 0 | yes |
| S9-06 | 4 | `check.sh` | green | yes |
| S9-07 | 1 | `reviews/s9.diff` exists; plan `## Review (S9-07)` | diff 5143 lines; findings table with severity/file:line/fix; RED df86277 → GREEN d457eb6 | yes |
| S9-07 | 2 | `grep` migrations for token columns; links-function and web-share tests | no plain-token column (only `save_token`, a send-save key, and `token_sha256`); gone byte-identical test, 600 s test, XSS test pass; function never reads spots; redeem concurrency integration test passes | yes |
| S9-07 | 3 | `git log --grep refactor` | ecfe9bf S9 simplification pass | yes |
| S9-07 | 4 | grep CLAUDE.md, README, live checklist | CLAUDE.md lists links.ts, link-token.ts, share-preview, web/share, fragment rule; README 'Links (S9)'; checklist hosting + deploy commands | yes |
| S9-07 | 5 | `check.sh` | green | yes |


### 2026-10-23 · S9-07 · passes

- S9 review (two Opus reviewers, `reviews/s9.diff` 5143 lines): no Critical; **2 Important fixed** (A1: `redeem_invite`'s single use under concurrency had no committed proof → a 10× race in `links-function.test.ts` + a pgTAP lock guard, both shown failing on a lock-less mutation; B1: the Inbox list swallowed the first tap on Open while the keyboard was up). 10 Minor fixed (incl. the deferred clipboard and `?t=` items), 1 left (CSP width). Table + seven written answers under "Review (S9-07)" in the S9 plan. RED `df86277` → GREEN `d457eb6`, `refactor:` `ecfe9bf`.
- **D96 *default***: `share-preview` takes the token as a text/plain POST body; `GET ?t=` answers 405 (request logs kept working links). Page, `previewLink`, README, checklist curls follow.
- Docs: CLAUDE.md (links.ts, link-token.ts, share-preview, web/share/, the fragment-token rule), README 'Links (S9)', live checklist hosting step with staged `wrangler` commands. `chore:` `ec1f4f1` declares jsdom 20.0.3 + @types/jsdom 20.0.1 (devDependencies).
- Mistake caught and fixed: my first checklist edit (466eb4b) cut everything between §10's and S9's host bullets; restored in `7471fcc` (the diff against before is only the hosting block and the curls).
- Verified: jest 2065 → 2080, `check.sh` green, `npx jest --ci` 0 `console.error`; stack `test:db` 640 (639 → 640), `test:integration` 7 suites 79 (77 → 79), `db:stop`, only dj-*/n8n-* left.
- Next: S10-01. The edge runtime needs `docker restart supabase_edge_runtime_hit-list` after `db:start` if the function changed.
- Question for Michael (§9 Q57): POST body for link previews (D96), or keep `GET ?t=`? Proposed change: S9-02 step 1 / S9-04 step 1 said `GET ?t=`; since D96 it is POST.

### 2026-10-23 · S9-06 · passes

- New `docs/plans/2026-10-22-s9-what-michael-will-see.md`: from-scratch renders of the Send sheet link mode (chips, D44 line, failure), Sent `Links` rows (Active/Active until/Expired/Revoked + Revoke alert), members invite-link rows + role alert, Inbox `Paste a link` (closed/open/joined/gone/not a link/error), and the web page's send/invite/gone/error states (jsdom text). Plus "What to tap" (copy, Safari over Tailscale, revoke, invite link, paste as the other rider) and where to host.
- Temporary dump tests (copies of the screen tests + a tree walker) deleted; `git status` showed only the plan and `feature_list.json`.
- Verified: `npx jest --silent` 107 suites / 2065 tests, 0 `console.error`; `test:integration` 7 suites / 77 passed (`db:stop` after, no hit-list container); `npx expo export --platform ios` exit 0, 5.4 MB; `check.sh` green.
- Next: S9-07 (declare `jsdom` + `@types/jsdom` devDependencies; token in `?t=` gateway-log note). No new questions or proposed changes.

### 2026-10-23 · S9-05 · passes

- New `src/__integration__/links.test.ts` (9 cases): send link via `createLinkSend` + `createSendLink '7d'` → no-auth 200 with 2 spots; `web/share/` served by `node:http`, opened with `JSDOM.fromURL` → `2 spots from @ana_…`, two photos fetch 200; `revokeLink` and a forced-past expiry → byte-identical 404 gone; `makeSendLink` → `revokeSentLink` kills the link and its photo URLs; invite link: anon 42501, B joins and pulls Downtown's spots, B again → same id (D60), C → `LinkGoneError`, A sees it `used` by B. Jest stays 2065 (integration-only).
- Found and fixed (RED 813ef86): **`send.test.ts` hadn't loaded since S9-03.** `links.ts` reads `EXPO_PUBLIC_SHARE_BASE_URL`, which babel turns into an ESM `expo/virtual/env` import. `jest.integration.config.js` now transforms that one file.
- Verified: `db:reset` → `test:db` 639 passed → `test:integration` 7 suites, 77 passed (68 → 77), 0 console lines → `db:stop`; `docker ps` shows only dj-*/n8n-*. Two mutations each fail the suite. `check.sh` green (2065), `npx jest --ci` 0 `console.error`. Opus review: 1 Important + 5 Minor, all fixed but the dependency (table under "As built (S9-05)" in the plan).
- Next sessions: integration suites that import `src/sync/links` or `sends` now load; mock `expo-crypto` with `getRandomBytes`/`digestStringAsync`/`CryptoDigestAlgorithm`/`CryptoEncoding` as `links.test.ts` does.
- Proposed changes: S9-05 step 1 "B redeemInvite again → gone" is D60's "same list id" (as the plan's Proposed changes 4). S9-07: declare `jsdom` (+ `@types/jsdom`) as devDependencies (today only hoisted through jest-expo). No new questions.

### 2026-10-23 · S9-04 · passes

- New: `web/share/index.html` (one `hitlist-functions-url` meta = `http://127.0.0.1:54321/functions/v1`, `no-referrer`, CSP meta, `share.js` deferred), `web/share/share.js` (fragment token, `?t=` fallback, `share-preview` fetch; send cards / invite line / gone / error; `textContent` only, http(s) URLs only, no map links at 0,0), `web/share/README.md` (serve with `cd web && python3 -m http.server 8080`; hosting is a live step). Test `src/__tests__/web-share.test.ts` (jsdom, 20 cases). Jest 2045 → 2065.
- Verified: RED c1a08b7 (ENOENT index.html) → GREEN c85b643; Opus review 1 Important + 6 Minor, RED 8080ea5 (6 failing) → fixes; #1 was real: any 404 (a wrong functions URL, the gateway's 'Function not found') said "This link doesn't work any more." for a good link. `check.sh` green (2065), `npx jest --ci` 0 `console.error`. Table under "As built (S9-04)" in the plan.
- Next sessions: S9-05 can load the page in jsdom the same way (`DOMParser` → `document.replaceChild`, `new Function(share.js)`, wait for `document.body.dataset.state`); jsdom 20 has no `fetch`, inject Node's. `share.js` copies the labels from `src/constants/labels.ts`.
- Proposed changes: S9-04 step 1's invite line is `@ana invited you…` (the copy table's `@`); photos load eagerly, not `loading="lazy"` (600 s URLs). Review #7 (token in `?t=` reaches the gateway log) stays with S9-07. No new questions.

### 2026-10-23 · S9-03 · passes

- New: `src/utils/link-token.ts`, `src/sync/links.ts`, `redeemInvite` in `src/sync/join.ts` (in join.ts to avoid an engine import cycle), `sends.ts` `createLinkSend`/`makeSendLink`/`listSentLinks`/`revokeSentLink`. UI: Send sheet 'Copy link instead' (chips, D44 line, clipboard, 'Link copied'), Sent 'Links' rows + Revoke, members 'Invite link' + rows (Used by @ben, Revoke), Inbox 'Paste a link'. Mocks: expo-clipboard, expo-crypto `digestStringAsync`; the fake gains `invokes`/`invokeHandlers`/`functionsHttpError`. `.env.example` gains `EXPO_PUBLIC_SHARE_BASE_URL`. Jest 1937 → 2045.
- Verified: each test file RED first (missing module or element; 10 sync-sends cases), then green; `check.sh` green (2045), `npx jest --ci` 0 `console.error` in 3 runs. Opus review: 1 Important + 8 Minor, all but #2 fixed with RED-first tests (table in the plan under "As built (S9-03)"). #1: expiry was parsed without `toIso` (Hermes).
- Next sessions: S9-05 should call `makeSendLink` (or `createLinkSend` + `createSendLink`) and `redeemInvite` from `src/sync/join`. A 42501 from create/revoke link is now `NotAllowedError`. Review #2 (a clipboard failure after the link was made) is left for S9-07.
- Proposed changes: S9-03 step 2: the rpc args are the shipped `p_*` names, and the calls take `(client, uid, …)`. Step 3: "createSend with recipientIds []" became `makeSendLink` (D94; an empty friend list still fails). Sent revokes through `revokeSentLink` (withdraw, then `revokeLink`, D93). No new questions.

### 2026-10-23 · S9-02 · passes

- New: `supabase/functions/share-preview/index.ts` (GET `?t=`, no JWT, Web Crypto SHA-256 → `preview_link(p_sha)` as service role; send = allow-listed frozen fields + `createSignedUrls(…, 600)` only for objects listed under `sends/<id>/`; invite = list name + inviter; one `{"error":"gone"}` 404; `Cache-Control: no-store`), migration `20261026010000_links_s9.sql` (`list_my_links` + `used_by`/`used_by_username`), pgTAP `120-links-s9` (9), `config.toml` (`verify_jwt` false/true, `[edge_runtime.secrets] PUBLIC_SUPABASE_URL`), `src/__integration__/links-function.test.ts` (14). Jest stays 1937 (server-only work).
- Verified: RED 0455a43 first (pgTAP `column "used_by" does not exist`; function test 9/9 `Function not found`). Then `db:reset` → `test:db` Files=12, 639 passed (630 before) → `test:integration` 6 suites, 68 passed (54 before), 0 console lines → `db:stop`. `docker ps` shows only the 7 dj-*/n8n-* containers. `check.sh` green, and `npx jest --ci` has 0 `console.error`.
- Opus review: 3 Important + 4 Minor; #1–#5 fixed (table under "As built (S9-02)" in the plan). #1 was a real bug: a port-less `PUBLIC_SUPABASE_URL` kept the gateway's `:8000`. A mutation run (sign payload paths as written, read the payload's sender) fails 2 tests. #6 (token in `?t=` reaches gateway logs) is left for S9-07; #7 (0,0 location) is left for the page (S9-04).
- Next sessions: the function edits need `docker restart supabase_edge_runtime_hit-list`; `config.toml` edits need `db:stop && db:start`. For phone tests set `PUBLIC_SUPABASE_URL` to the tailnet address (live checklist S9).
- Proposed change: S9-02 step 1's `rpc('preview_link', { token_sha256 })` → `{ p_sha }` (the shipped arg, S9-01 plan item 1). No new questions.

### 2026-10-23 · S9-01 · passes

- `chore:` e3620d4 adds expo-clipboard ~57.0.2 (`npx expo install`, no nested expo-modules-core); `npx expo export --platform ios` → exit 0, 5.4 MB (to the scratch dir, not /tmp/hl-export). Plan `docs/plans/2026-10-22-s9-links.md` (Tokens, Base URL, Server, share-preview, Client, UI, Page, Tests, Copy table, Test list, Proposed changes); spec §2 D92–D95 *default*, §9 Q53–Q56; live checklist gains an S9 section (local page over Tailscale, functions deploy, hosting in stages, undo). Tests 1937 → 1937 (docs only), check.sh green.
- Opus plan review: 12 findings folded in. Next sessions must know: the local edge runtime's `SUPABASE_URL` is likely `http://kong:8000`, so signed photo URLs need the `PUBLIC_SUPABASE_URL` origin rewrite (S9-02 confirms first); the fake's `functions.invoke` must be extended before `previewLink` tests; a link-only send is a new `createLinkSend` (an empty `recipientIds` must keep failing); `list_my_links` lacks `used_by`, so S9-02 adds migration `20261026010000_links_s9.sql` + pgTAP 120.
- Michael: Q53 which domain for links (meanwhile `http://localhost:8080/share/`)? Q54 Revoke deletes a link's photos, OK? Q55 a new copy per Copy link, OK? Q56 want "Save these N spots" in the app for a pasted send link (today it only opens the page, which says to paste it in the app)?
- Proposed changes: S9-02 rpc arg is `p_sha` and it needs the migration above; S9-03 rpc args are the shipped `p_*` names and the calls take `(client, uid, …)`; S9-03 "createSend with recipientIds []" → `createLinkSend`; S9-05 "B redeemInvite again → gone" contradicts D60 (a member gets the list id back); S9-03/S9-04 send-link save loop (Q56).

### 2026-10-23 · verify S8

Ran check.sh (green, 1937 tests); re-ran the S8 test files (`npx jest --ci --verbose` on 20 files: 275 + 319 passed, 0 failed). Did not start Docker (build-only policy): S8-07 step 1 is judged by reading the test plus the plan's recorded run (test:db 630, integration 54).
Noted deviations that keep the behaviour: `shareList` uses the `share_list` rpc (plan-documented) instead of `update`+`insert`; the dead `getMyMemberships` was removed by the S8 refactor commit.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S8-01 | 1 | Read `docs/plans/2026-10-22-s8-shared-lists.md` headings | Has Migration 8, Data, Pull, Read-only others (D47), Photos, Share screens, Markers, First-add, Shared area lists, Inbox invitations, Copy table, Test list per feature (l.345) | yes |
| S8-01 | 2 | Spec §2 rows D83–D91 | D83 (invitee sees name/count, no spots) and D84 (members + owner) present as *default*, asked as Q44–Q52 | yes |
| S8-01 | 3 | `check.sh` | green, 1937 tests | yes |
| S8-02 | 1 | `db-migrate.test.ts:1063` `MIGRATIONS` length 8; db-hit-lists tests (upsertMembers, getMembers, getHitLists attaches members); `grep getMyMemberships` | length 8, v7→v8 cases pass, members tests pass; `getMyMemberships` absent (removed as dead code in refactor ea65325) | yes |
| S8-02 | 2 | `sync-lists.test.ts` (verbose) | share/invite/setRole/removeMember/leave (cache + rows, one transaction)/stopSharing/join/decline all pass; shareList goes via `share_list` rpc rather than update+insert | yes |
| S8-02 | 3 | `hit-lists-store.test.ts` selectSharedWithMe, selectInvitations; `inbox-store.test.ts` invite kind | pass | yes |
| S8-02 | 4 | check.sh | green, no console.error | yes |
| S8-03 | 1 | `stores.test.ts` selectMySpots; `spots-view-mode.test.tsx:186` ana's spot | selectMySpots drops foreign; foreign absent under My spots, present under shared chip | yes |
| S8-03 | 2 | `spot-detail.test.tsx` foreign cases; `sync-copy` saveCopy tests | '@ana's spot', no Edit/Send, 'Save a copy' → confirm → copy opened; copy keeps fields, photos into document | yes |
| S8-03 | 3 | `use-spot-actions.test.ts` | updateSpot, setTown, removeSpot reject 'not your spot' | yes |
| S8-03 | 4 | `components.test.tsx` owner badge; `spot-map.test.tsx` | badge '@ana'; callout ends ' · @ana' | yes |
| S8-03 | 5 | `sync-photos.test.ts`, `photo-storage.test.ts` | cachedPhotoUri downloads then caches, 403/404 reject, owned media unchanged | yes |
| S8-03 | 6 | check.sh | green | yes |
| S8-04 | 1 | `share-list-sheet.test.tsx` | sign-in line, checkboxes, roles, D34 sentence, count line, Share disabled, shareList(…,'add'), no 'Send', area line: all pass | yes |
| S8-04 | 2 | `list-screen.test.tsx:527-628` | Share list + Send row together, strip with count and '+ Invite', press pushes `/list/<id>/members` | yes |
| S8-04 | 3 | `list-members.test.tsx`; file exists | owner role menu/Remove/Invited/Stop sharing alert; member Leave alert 'Your 5 spots…', none at 0 | yes |
| S8-04 | 4 | `grep -n Send` ShareListSheet.tsx, members.tsx; tests 'source never says Send' | grep prints nothing; tests pass | yes |
| S8-04 | 5 | check.sh | green | yes |
| S8-05 | 1 | `lists-tab.test.tsx` | Shared with me '@ana · 2 spots' with icon+count; private has none | yes |
| S8-05 | 2 | list-picker-chips, spot-detail, add-to-list-sheet tests | `icon-person.2.fill` in shared chip/row, absent in private | yes |
| S8-05 | 3 | `add-to-list-sheet.test.tsx` | enabled owner/add, 'View only' disabled, area disabled, first-add alert + `confirmed_list` flag, other list asks again | yes |
| S8-05 | 4 | `hit-lists-store.test.ts`, `list-screen.test.tsx` | ana's area list holds only her spots; 'Area · 2 mi of Capitol Hill', no Edit area for a member | yes |
| S8-05 | 5 | check.sh | green | yes |
| S8-06 | 1 | `inbox-tab.test.tsx`, `inbox-store.test.ts` | '@ana invited you to Downtown (12 spots)', Join → respondInvite+syncNow, 'Joined Downtown'+Open, Decline, badge counts invites | yes |
| S8-06 | 2 | `lists-tab.test.tsx` | Join chip inline, respondInvite then syncNow | yes |
| S8-06 | 3 | check.sh | green | yes |
| S8-07 | 1 | Read `shared-list.test.ts` (describes at l.150, 350) not run (needs Docker) | Covers share, join, cached photo, 6th spot, B add, C refused, B leave, A/C pulls, stopSharing; plan records 54 passing | yes |
| S8-07 | 2 | `docker ps --format '{{.Names}}'` | no supabase_* container; only dj-*/n8n; plan records test:db 630 / integration 54 | yes |
| S8-07 | 3 | check.sh | green | yes |
| S8-08 | 1 | Read `s8-what-michael-will-see.md` | Sections for Share sheet (exact D34), list screen, members (alert copy), Lists tab, Add-to-list, first-add, foreign spot, Inbox; temporary renders | yes |
| S8-08 | 2 | Same file, 'What to tap' l.124 | Two-rider walk: share, join, roles, leave, stop sharing, pull results | yes |
| S8-08 | 3 | Same file, Verification record l.155 | jest 1924 / 0 console.error, integration 54, expo export exit 0 5.4 MB | yes |
| S8-08 | 4 | check.sh | green | yes |
| S8-09 | 1 | `reviews/s8.diff` (11290 lines) and plan 'Review (S8-09)' + per-feature review tables | Findings with severity and fix; Important ones marked fixed with RED tests | yes |
| S8-09 | 2 | Plan Review (S8-09) answers 1–7 + anti-goal; tests above (not your spot, leave one-transaction, confirmed_list, no-Send tests) | All seven answered with proving tests; those tests pass | yes |
| S8-09 | 3 | `git log --grep refactor` | ea65325 'refactor: S8 simplification pass' | yes |
| S8-09 | 4 | grep CLAUDE.md, README.md, live checklist | Layout names ShareListSheet, members.tsx, lists.ts, copy.ts, cache rule, D47; README 'Shared hit lists (S8)'; checklist 'Two phones (S8-09)' l.227 | yes |
| S8-09 | 5 | check.sh | green | yes |


### 2026-10-23 22:40 · S8-09 · passes

- Two Opus reviewers read `reviews/s8.diff` (11290 lines, `d9c1201..HEAD`). No Critical. One Important was fixed: every sync's cache removal (often of nothing) bumped one global counter, so a friend's photo downloading at that moment went grey and Save a copy dropped it. Downloads are now invalidated per spot. Also fixed RED first: A5 (local failure after Leave/Stop/Remove only warns), A6 (`removeSpotFromList` follows D42), A7 (half-saved copy), B1 (phone account read before the app is ready), B2 (edit route of another rider's spot shows no editor; failed Delete alerts), B3/B4 (no navigation after the screen was left), B6 (strip uses `isShared`). Left A2/A3/A4/B5/B7 with reasons. Table, the seven written answers and the anti-goal answer are under 'Review (S8-09)' in the S8 plan.
- `refactor:` drops the dead `getMyMemberships`; `shared-rows.ts` uses `deleteMembers`/`deleteMember`; Inbox uses `handleOf`. Docs: CLAUDE.md Layout (ShareListSheet, members screen, copy.ts, join.ts, cache and D47 rules, the app-time transaction), README 'Shared hit lists (S8)', live checklist two-phone sharing check.
- Tests 1924 → 1937: RED 3 + 12 failing, then GREEN; one dead test removed. `check.sh` green, `npx jest --ci` 0 console.error. Local stack: `test:db` Files=11 Tests=630 PASS, `test:integration` 5 suites 54 passed. `db:stop`; only the dj-*/n8n-* containers are left.
- Next: S8 is complete; open the S8 PR (harness), then S9. A3 (D86 gap after 'Sign out anyway': others' rows stay until the next sign-in) is a candidate for S10 hardening.
- No new D, no questions. Proposed change: none.

### 2026-10-23 20:10 · S8-08 · passes

- New `docs/plans/2026-10-22-s8-what-michael-will-see.md`: renders from scratch (temporary Jest test, deleted) of the Share sheet (D34 sentence), list screen actions + member strip, members screen as owner/member with the Leave and Stop sharing alerts, Lists tab (shared badge, 'Shared with me'), Add-to-list sheet (shared/view-only/area), first-add alert, a foreign spot's detail, Inbox invitation. 'What to tap' for two riders.
- Verified: `npx jest --ci` 103 suites, 1924 tests (unchanged), 0 console.error; `npx expo export` exit 0, 5,429,837 bytes; check.sh green. Integration count (5 suites, 54) is carried from S8-07: I did not restart the stack this session.
- Surprise: a member's view of another rider's spot reads 'A friend' until the owner's name is mirrored.
- Next: S8 is done; next milestone is S9. No questions. Proposed change: none.

### 2026-10-23 19:10 · S8-07 · passes

- New `src/__integration__/shared-list.test.ts` (10 cases, riders A/B/C, three node:sqlite phones). B and C get invites (5 spots) and join. B sees L in `selectSharedWithMe` with 5 foreign spots, and a cached photo has the fixture's bytes. A's 6th spot, and an old spot filed into L, reach B. B's add pushes. C's view-only add is parked ('not a member who can add to this list', 42501). B leaves: no L, none of A's spots, cache gone, download refused. D43 shows on A and C. Stop sharing clears C. Also covered: removeMember and an unfriended invitation. pgTAP 110 gains the owner-blocks-invitee case (S8-02 review #9).
- Found and fixed a stale S7 expectation: `send.test.ts` case 4 expected 'taken_back'. Since S7-08 (b28ffb5), a save whose every photo is refused returns 'failed' without asking the server. Nobody had re-run the integration suite since then. The case now asserts that, and the server's 42501 directly.
- Verified on the local stack: `test:db` Files=11 Tests=630 PASS. `test:integration` 5 suites, 54 passed (44 → 54), 0 console lines. `db:stop`; `docker ps` lists only the 7 dj-*/n8n-* containers. Jest stays at 1924 and `check.sh` is green.
- Not RED first (S8-02…06 built it). Mutation runs instead (no list reconciliation / no foreign-spot removal / Leave without cache delete) failed 3 and 1 cases; sources restored.
- Opus review: 4 Important and 6 Minor, all about test strength; #1–#9 fixed (table in the plan under 'S8-07 review'), #10 left.
- Next (S8-08): integration counts are 5 suites / 54 tests. Possible S8-09 item: a stale withdrawn send item reads 'failed', not 'taken back', until the next sends load removes it.
- No new D, no questions. Proposed change: step 1's `shareList(L, [B: 'add', C: 'view'])` is `shareList(…, [B], 'add')` + `invite(…, [C], 'view')` (one role per call, D88).

### 2026-10-23 17:30 · S8-06 · passes

- Inbox 'Invitations' rows read '@ana invited you to Downtown (12 spots)' with Join, Decline (confirm) and long-press Block. Join calls `respondInvite` then `syncNow`. It then shows 'Joined Downtown' (announced), plus 'Open' once the list is on the phone. A withdrawn invitation reads 'This invitation was withdrawn.' The tab also loads invitations on focus and on pull-to-refresh.
- The Lists tab's 'Shared with me' lists invitations first ('@ana invited you · 12 spots') with a 'Join' chip. Both tabs use the new `src/sync/join.ts` `joinList`, one join per list at a time. `respondInvite` now only warns when the local mirror write fails after the server answered.
- Tests 1896 → 1924, RED first (15 failed, then 5 for the review). `check.sh` green, `npx jest --ci` shows 0 console.error. The badge test for unseen invitations passes in both inbox-store and inbox-tab.
- Opus review: 1 Important, 6 Minor. Fixed with RED tests: #1, a Block from an invitation now reloads invitations and friends (a stale load had put the row back). Also fixed: #2 (spinner said 'Sending', now 'Answering', D34), #3 (Decline while a Lists-tab Join runs) and #4. #5 (copy) and #6 (subtitle wording, kept, now in the copy table) are left. Table under 'S8-06 review' in the plan.
- Next session (S8-07, integration): `joinList` is the app-level join. In node tests, call `respondInvite` + `pullAll` directly; `syncNow` needs the app's stores.
- No new D and no questions. Proposed change: none.

### 2026-10-23 16:20 · S8-05 · passes

- Every §1 marker. New `SharedBadge` (`person.2.fill` + D84 count, VoiceOver 'Shared with 4') on Lists tab rows, picker chips (`Chip` `accessory`), detail 'In lists' chips and Add-to-list rows. The Lists tab has 'Shared with me' ('@ana · 12 spots'). New in `src/utils/members.ts`: `isShared` and `myRole`.
- AddToListSheet: area lists and others' lists not joined with 'add' are disabled ('View only'). The first add to a shared list asks 'Everyone in Downtown (4) will see this spot.' (Cancel / Add). Add stores `confirmed_list:<id>` and `forgetAccount` clears every such key (D90). `addSpotsToList` in the hook now refuses view-only, unjoined and area lists.
- Shared area lists already held from S8-03/04; this feature adds the store and list-screen cases.
- Tests 1862 → 1896, RED first (20 failed, then 6 more for the review). `check.sh` green, `npx jest --ci` shows 0 console.error, `npx expo export --platform ios` bundles.
- Opus review: no Critical or Important findings. Fixed #1 and #4–#7 with RED tests and filled the #8 test gaps. Left: #2 ('Shared with me' after 'Sign out anyway' shows lists still on the phone), #3 (S8-03 launch window where `useRiderId()` is null, for S8-09) and #9 (wording 'Downtown (1)' while nobody has joined yet). Table under 'S8-05 review' in the plan.
- Next session (S8-06): the Lists tab sections are built in `app/(tabs)/lists.tsx` `sections`. Add the invitation rows and their 'Join' chip there from `selectInvitations`. An invited mirror row shows in neither section today.
- No new D and no questions. Proposed change: none to the steps. Step 3's "sets sync_state" holds only after the add succeeds.

### 2026-10-23 14:10 · S8-04 · passes

- Built the Share screens:
  - `src/components/ShareListSheet.tsx`: friends, a role control (`ROLE_LABELS`), the D34 sentence, the count and area lines, the D85/42501 lines, and an invite mode.
  - List screen: 'Share list' / 'Invite' (owner only) beside 'Send these spots'. The member strip shows initials, the D84 count and '+ Invite', and opens `/list/<id>/members`. A member gets no Rename, Delete, Edit area or Share, and can remove only their own spots (role 'add'). Deleting a shared list states the consequence.
  - New `app/list/[id]/members.tsx`: role menu, Remove confirm, Withdraw invitation, Invite, Stop sharing, Leave (`dismissAll` → Lists tab).
  - Also new: `getHitLists` `owner_username` and `src/utils/members.ts`.
- Tests 1808 → 1862, RED first. `check.sh` green, `npx jest --ci` shows 0 console.error, and `grep -n 'Send'` on the sheet and members.tsx prints nothing.
- Opus review: 2 Important, 3 Minor. Fixed with RED tests: #1, the rider's own row read 'A rider' (the profiles mirror never holds the rider), and #3/#4. Left: #2, 'Add friend' on a member row (plan §3.5), for S8-09; #5, `needs_username` sees the sign-in line, as SendSheet does. Table in the plan, 'S8-04 review'.
- Next session (S8-05): use `memberCount` / `joinedMembers` from `src/utils/members.ts` for the markers. The `person.2.fill` icon is in the MAPPING (testID `icon-person.2.fill`), and a list carries `owner_username` for 'Shared with me'.
- Proposed changes: the step's `shareList(listId, [ana], 'add')` is `shareList(db, client, uid, listId, [ana], 'add')`. Leave also navigates to the Lists tab after `router.dismissAll()`. No new D, no questions.

### 2026-10-23 12:40 · S8-03 · passes

- Others' spots are now read-only on this phone. New: `selectMySpots` (the 'My spots' chip), the area-list owner rule, and `isForeign`/`ownerLabel` (`src/utils/ownership.ts`). New: `riderId()`/`useRiderId` = the signed-in rider, else the phone's account (sync store `phoneUserId`). `assertOwn` guards in the spot, media and hit-list action hooks. Other changes:
  - Detail shows '@ana's spot' with Save a copy (`src/sync/copy.ts`); the viewer offers no options on others' spots. Owner badge on list rows, ' · @ana' in map callouts.
  - Photo cache: a `cache/` branch, `cachedPhotoUri`, `usePhotoUri` and a placeholder tile.
  - Others' spots are never offered by Quick Add, import, the area picker, the select bar, a list's Send (D87) or the town backfill.
  - Sign-out Keep runs `removeForeignRows` (D86). An account switch re-paths cached media (S8-02 #7).
- Tests 1760 → 1808. Every change was RED first. `check.sh` green, `npx jest --ci` shows 0 console.error.
- An Opus review found 2 Important and 4 Minor. #1–#4 and #6 are fixed with RED tests. Most important: offline or signed out, others' spots had been editable. #5 (area owner rule strictness) is left for S8-09. Table in the plan, 'S8-03 review'.
- Next session (S8-04) must know:
  - Use `useRiderId()`, not the auth `userId`, for "mine".
  - A list's action row is now hidden when the rider owns none of its spots (`ownSpots`). S8-04 must restructure it so 'Share list' shows for an owner whose list holds only others' spots.
  - `getSpots` carries `owner_username`.
- Proposed changes: S8-03 step 2's `saveCopy(spotId)` is `saveCopy(db, client, uid, spotId)` → `{ spotId, missingPhotos }`. It refuses until adoption made the phone the rider's. Step 3's "differs from the signed-in user" became "differs from `riderId()`" (signed-in rider, else the phone's account).
- Behaviour to note for Michael (no new D): 'Sign out anyway' (changes waiting) leaves friends' spots on the phone, read-only, because removing them would drop a waiting add to a friend's list. They leave at the next Keep or at another account's sign-in.

### 2026-10-23 09:10 · S8-02 · passes

- Built the shared-list data layer. Migration 8 adds `hit_list_members` and member-aware membership triggers; `hit-lists.ts` gains the members mirror. New: `src/sync/lists.ts` (share, invite, setRole, removeMember, leave, stopSharing, respondInvite, invitations) and `src/sync/shared-rows.ts`. The S8 pull adds a full members read, others' lists only once joined, others' photos at `cache/photos/…`, the per-list fill, and list and photo reconciliation. The engine now loads invitations and deletes cached photos. New in the Inbox: kind `invite`, `selectSharedWithMe` and `selectInvitations`. Server: `20261025010000_shared_lists_s8.sql` (`list_invitations()`, `share_list`) with pgTAP 110. Tests 1684 → 1760.
- Verified: `check.sh` green (1760 tests) and `npx jest --ci` shows 0 console.error. Ran the local stack only for pgTAP, then stopped it (`docker ps` shows no `supabase_*`). Test 110 went RED first ("function public.list_invitations() does not exist"); afterwards `test:db` passed with Files=11, Tests=628. Every Jest file was RED first; the counts are in each commit message.
- An Opus review found 2 Important and 7 Minor issues. Fixed with RED tests: unpaged media reads that past 1000 rows deleted real photos (#1), and a deleted shared list that looped every pull (#2). Also fixed #3, #4 and #6. Left with their owners in the plan's review table: #5 (S8-09), #7 (S8-03), #8 (S8-09), #9 (S8-07).
- Next session (S8-03) must know: a foreign media row's `file_path` is `cache/photos/<spot>/<media>.jpg`, but `resolvePhotoUri` has no `cache/` branch yet (S8-03 step 5). `selectInvitations` reads the Inbox store's items. Until S8-06, the Inbox shows an invitation as a line only. Account switch, Remove and release already empty `hit_list_members` and the cache folders; sign-out Keep removing others' rows is still S8-03.
- Proposed changes: S8-02 step 2's literal `from('hit_lists').update({ shared: true })` + `insert` became the `share_list` rpc + `upsert(…, { ignoreDuplicates: true })`, with `invited_by` (plan review #7/#8; the rows' fields are asserted). The pull cases live in `sync-pull.test.ts`, not `sync-lists.test.ts`. Invitations come from `list_invitations()` after each sync, not from the table pull. No questions for Michael; no new D.

### 2026-10-23 08:40 · S8-01 · passes

- Wrote `docs/plans/2026-10-22-s8-shared-lists.md`: Migration 8 (`hit_list_members` mirror), one server migration (`list_invitations()` for the invitee's '(12 spots)', `share_list(p_list)`), `src/sync/lists.ts` call table, pull changes (members full read, per-list fill for rows whose rev is below the cursor, list reconciliation, foreign photo deletes), Read-only others (D47, Save a copy), the photo cache (`cache/photos/…` file_path, `cachedPhotoUri`, `usePhotoUri`), Share sheet, member strip and members screen, markers, first-add confirmation, shared area lists, Inbox invitations, Copy table, integration design, Test list per feature. Spec §2 gains D83–D91 and §9 gains Q44–Q52. No code changed; check green, 1684 → 1684 tests.
- Verified: every section the step names is a heading or bullet in the plan (`grep '^## '`); D83 (an invitee sees name + count, no spots) and D84 (count = joined members + owner) are in §2/§9; `check.sh` green.
- An Opus plan review found 6 Important and 6 Minor issues, all folded in (table under 'Plan review'). The main ones: pull.ts:360 must set `rev = -1` before deleting a membership; the fill reads must be paged; a parked view-only membership must not stay forever; foreign spots must be kept out of Quick Add/import, the area picker, Add to list and `backfillTowns`.
- Next session (S8-02) must know that migration 8 **also recreates the `hit_list_spots` outbox triggers**. Without that a member's add to someone else's list never queues. `addSpotsToList` writes `added_by`.
- Proposed changes: S8-02 step 1 says "nothing else", but migration 8 also needs the trigger rewrite. S8-02 step 2: member rows carry `invited_by: uid` (RLS requires it), sharing turns on through the `share_list` rpc, `invite` upserts with `ignoreDuplicates`, and the members pull is a full read, not by rev. S8-02 gains the server migration and pgTAP 110. S8-03 step 5: `cachedPhotoUri(client, media)`. S8-03 also gains the plan review #4 guards and the D86/D87 rules. All are listed in the plan.
- Questions for Michael (defaults built): §9 Q44–Q52 (D83–D91). Q47 asks whether friends' spots should leave the phone at sign-out (default: yes). Q48 asks whether Send may pass a friend's spot onward (default: never).

### 2026-10-23 · verify S7

Ran `check.sh` (green, 1684 tests, cached for this tree) and the five S7 test files directly (`npx jest --ci --silent` on send-payload, sync-sends, send-sheet, inbox-tab, sent-screen: 5 suites, 172 tests pass). Build-only policy: I did not start the Supabase stack, so the integration test and pgTAP were not re-run; S7-06 rests on the recorded run plus a read of the test. `docker ps` shows no `supabase_*` container. Where a step's literal call shape differs from the code (`createSend(db, client, uid, …)`, `saveSend(db, client, uid, item, …)`, `loadSends`, day-only `captured_at`), the plan's "Proposed changes to later feature steps" records it and the tests assert the same behaviour, so I counted the step as holding.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S7-01 | 1 | `grep -n '^#'` on docs/plans/2026-10-22-s7-send.md; read Payload, Photo copy, Migration 7 | Sections Payload, Photo copy (copy then create_send, client-side newId, failed copy removes copied paths, server-side copy function rejected), Migration 7, Send sheet, Entry points, Inbox, Sent, Copy table, Test list per feature all present | yes |
| S7-01 | 2 | grep D76–D82 in the spec §2 | D76 (one send per friend, own photo set) with reason; D77–D82 also recorded and asked in §9 Q37–43; no shared set, so no storage re-check needed | yes |
| S7-01 | 3 | `check.sh` | green, 1684 tests (whole-branch suite) | yes |
| S7-02 | 1 | `npx jest send-payload.test.ts`; read freeze/thaw/parse cases | pass; exact-key freeze, 0 stays 0, NO_LOCATION round trip, thaw fresh ids/owner/from_username/primary, rejects `unknown send payload version 2` and `send payload is not an object` | yes |
| S7-02 | 2 | `schema.ts` L438-439; db-migrate.test.ts L939; spot-detail.test.tsx L76-88; types/index.ts L54-55 | `toHaveLength(7)`, v6→v7 cases, getSpots returns from_username, Spot has both fields, detail shows 'From @ana' under the title | yes |
| S7-02 | 3 | `check.sh` | green | yes |
| S7-03 | 1 | `npx jest sync-sends.test.ts`; read createSend/save/dismiss/withdraw/listSent cases | pass; copy per photo then create_send per recipient, copy failure removes copied paths and sends nothing, listSent statuses, loadSends excludes saved/dismissed/withdrawn, saveSend downloads to photos/<new>/, inserts owned rows, newList 'From @…', failedPhotos counted | yes |
| S7-03 | 2 | `engine.ts` L13/L130; use-sent-sends.test.tsx | engine calls loadAndApplySends after each sync; useSentSends calls listSent on mount | yes |
| S7-03 | 3 | `check.sh` | green | yes |
| S7-04 | 1 | `npx jest send-sheet.test.tsx` (25); read L118-352 | pass; signed-out line + Sign in, thumbnails, @ana/@ben checkboxes, exact D34 sentence (many/one), Send disabled until checked, createSend + 'Sent to @ana' toast, 'Add a friend first' + link to /friends; regex /share\|invite/i test | yes |
| S7-04 | 2 | spot-detail L308-360, spots-select L341-371, list-screen L438-498, area-picker L830-886 | 'Send this spot' paperplane, 'Send (2)' beside 'Add to list (2)', 'Send these spots' + 'one-time copy of 2 spots', 'Send these 23 spots' left of Save as hit list; each opens the sheet with the right ids | yes |
| S7-04 | 3 | spot-detail.test.tsx L356 | "another rider's spot has no Send" passes | yes |
| S7-04 | 4 | `check.sh` | green | yes |
| S7-05 | 1 | `npx jest inbox-tab.test.tsx`; read L409-600 | pass; '@ana sent you 3 spots' + thumbnail, Save all / new hit list / Pick spots / Dismiss ('Dismiss these spots?'), 'Saved 3 spots', "· 1 photo couldn't be downloaded" | yes |
| S7-05 | 2 | `npx jest sent-screen.test.tsx`; app/_layout.tsx L69; profile.test.tsx L909 | pass; 'To @ben · 3 spots · Waiting' + Withdraw confirm, 'Saved copies are theirs', Withdrawn row, 'Nothing sent yet'; route 'Sent'; Profile 'Sent' row | yes |
| S7-05 | 3 | spot-detail.test.tsx L345; inbox-store.test.ts L52 | saved copy shows 'From @ana' with Edit present; badge counts unseen sends | yes |
| S7-05 | 4 | `check.sh` | green | yes |
| S7-06 | 1 | read src/__integration__/send.test.ts (8 cases) and the plan's As built; not re-run (build-only) | cases: 3 sent then rename/delete → original names, save → 3 owned copies with files, ana can't read copies, withdraw before save → Inbox empty and download refused, withdraw of saved → 55000 | yes |
| S7-06 | 2 | plan 'As built (S7-06)' run record; `docker ps --format '{{.Names}}' \| grep -c supabase` | test:db 604 and test:integration 44 recorded, stack stopped; 0 supabase containers; only dj-*/n8n-* running. I did not re-run | yes |
| S7-06 | 3 | `check.sh` | green | yes |
| S7-07 | 1 | read docs/plans/2026-10-22-s7-what-michael-will-see.md | lists the sheet signed out/no friends/two friends+three spots (exact D34 sentence), Inbox send + Pick spots, Sent three statuses, saved copy detail; temp tests deleted | yes |
| S7-07 | 2 | same file, 'What to tap' | seven steps with two riders: one spot, multi-select, list, edit then recipient gets original, withdraw before saving | yes |
| S7-07 | 3 | same file, Verification record | jest 1676 passed with 0 console.error, integration 44 passed, expo export exit 0 at 5.3 MB | yes |
| S7-07 | 4 | `check.sh` | green | yes |
| S7-08 | 1 | `wc -l reviews/s7.diff`; plan 'Review (S7-08)'; `git cat-file -t 918b14b` | 7795-line diff from 46ece42 (last S6 commit); findings table with severity/file:line/fix; RED 918b14b before GREEN b28ffb5 | yes |
| S7-08 | 2 | plan written answers 1-7; `grep -in share src/components/SendSheet.tsx` | seven answers each naming an existing test; grep prints nothing; I confirmed the named tests in send-sheet, sync-sends, sent-screen, spot-detail | yes |
| S7-08 | 3 | `git log --oneline \| grep refactor:` | e3e2417 'refactor: S7-08 simplification…' | yes |
| S7-08 | 4 | grep CLAUDE.md, README.md, live-checklist | CLAUDE.md has SendSheet, app/sent, sends.ts, send-payload.ts and the 'Send = copy, Share = live' bullet; README 'Send spots to friends (S7)'; checklist § S7 two-rider send | yes |
| S7-08 | 5 | `check.sh` | green | yes |

### 2026-10-23 23:00 · S7-08 · passes

- Two Opus reviews of `reviews/s7.diff` (7795 lines, `46ece42..HEAD`): 5 Important, 0 Critical, all fixed RED `918b14b` (8 fail) → GREEN `b28ffb5`: an offline Save all could use up a send on copies with no photos (now marks nothing; retries download failed photos again); a sync after a lost save answer dropped the 'Try again' row (kept now); SendSheet tapped silently with no username (line + `refreshProfile`); the sheet couldn't be cancelled during the pre-send backup (now it can, nothing goes); lines announced for VoiceOver. Minor fixes: dedupe ids, stable select-bar keys, D34 regexes any case.
- `refactor:` `e3e2417` (`serverError` → errors.ts, `createTickets()` in new `src/sync/tickets.ts`). Docs: CLAUDE.md D34 Conventions bullet + helpers, README 'Send spots to friends (S7)', live checklist 'Two phones (S7-08)'. Review table + 7 written answers in `docs/plans/2026-10-22-s7-send.md` 'Review (S7-08)'.
- Tests 1676 → 1684. Verified: `check.sh` green 1684; `npx jest --ci` 0 `console.error`; `grep -n Share src/components/SendSheet.tsx` prints nothing. No server change, so pgTAP/integration not re-run.
- Next: S7 done; S8 should filter others' spots at the select/list/area Send entry points (proposed change in the S7 plan).
- Questions for Michael: none new. Proposed changes: none to feature_list.

### 2026-10-23 20:00 · S7-07 · passes

- New `docs/plans/2026-10-22-s7-what-michael-will-see.md`: from-scratch renders (temporary Jest tests, deleted; `git status` clean) of the Send sheet (signed out, unconfigured, no friends, two friends + 3 spots with the exact D34 sentence, 1 spot), the Inbox send row + Pick spots sheet, the Sent screen (three statuses, empty, signed out) and a saved copy's detail ('From @ana'); 'What to tap' with two riders (one spot, multi-select, a list, frozen copy after rename, withdraw before saving).
- Verified: `npx jest --ci` 97 suites, 1676 tests, 0 `console.error`; `db:start` → `db:reset` → `test:integration` 4 suites 44 passed → `db:stop` (0 supabase containers left); `npx expo export --platform ios` exit 0, 5,289,652 bytes hbc; `check.sh` green.
- No code changed. Next: S7 is complete; S8 starts the next milestone (S7 PR is the harness's/Michael's to open).
- Questions for Michael: none. Proposed changes: none.

### 2026-10-23 19:00 · S7-06 · passes

- New `src/__integration__/send.test.ts` (8 cases: D40 frozen copy after rename + delete, Save → owned copies with photos + backup + second phone, ana can't read them, withdraw before save (RLS refuses while the object exists, then removed), 55000 on a saved send, forged sender (D80), staged photo (D77), failed `create_send` leaves no copies). `src/__integration__/phones.ts` = helpers moved out of `sync.test.ts` unchanged. Jest stays at 1676 (integration is separate): `test:integration` 36 → 44.
- Verified: `npm run db:start` → `db:reset` → `test:db` Files=10 Tests=604 PASS → `test:integration` 4 suites 44 passed, 0 `console.error` → `db:stop`; `docker ps` lists only the 7 dj-*/n8n-* containers. `check.sh` green 1676; `npx jest --ci` 0 `console.error`.
- Not RED first: S7-03…05 already built the behaviour, so the test passed on its first run. A mutation run (no photo cleanup after a refused `create_send` or in `withdrawSend`) failed cases 4 and 8; the source was restored.
- Opus review of the test: 1 Important (the withdraw check was passing only because of the delete, not RLS) and 7 Minor, all fixed. Table in the S7 plan under 'As built (S7-06)'.
- Next (S7-07): the integration counts for its file are 4 suites, 44 tests; `npx expo export` still has to be run there.
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-23 16:30 · S7-05 · passes

- Inbox send rows in `app/(tabs)/inbox.tsx` (thumbnail via signed URL, Save all / Save into a new hit list / Pick spots → new `src/components/PickSpotsSheet.tsx` / Dismiss confirm, a save's line at the top, sends load on focus + pull to refresh); new `app/sent/index.tsx` ('Sent', Withdraw); Profile 'Sent' row (`FriendsRow` → `LinkRow`); `sends.ts` gains `hasPendingSave` and a load ticket before `removeItem`; `useSentSends().refresh({ quiet })`.
- Tests 1634 → 1676 (inbox-tab +22, sent-screen 14, sync-sends +3, profile/inbox-store/spot-detail +1 each). RED commits f741d52, 68d2677 first. The badge and saved-copy detail cases passed on first run (earlier features already did it).
- Verified: `check.sh` green 1676; `npx jest --ci` 3 runs × 0 `console.error` (a FlatList 50 ms batch timer made sent-screen warn under load; its afterEach now flushes it in act); `npx expo export --platform ios` exit 0 (5.2 MB).
- Opus review: 2 Important (a retry after a lost mark answer silently ignored a new Pick/new-list choice → only 'Try again' while `hasPendingSave`; the saved line wasn't spoken on iOS → announced) + 9 Minor, all fixed RED first; table in the S7 plan 'As built (S7-05)'. Live checklist gains 'Inbox edges (S7-05)'.
- Next (S7-06): the integration test can call `saveSend(db, client, uid, item, opts, nodeIO)` and `withdrawSend(client, uid, { id, photoPaths })` as the screens do; Inbox button names are 'Save all spots from @ana' etc.
- Proposed changes: S7-05 step 1 writes `saveSend(id)` / `saveSend(id, { newList })`; built to the plan's `saveSend(db, client, uid, item, opts)`. Questions for Michael: none new.

### 2026-10-23 13:30 · S7-04 · passes

- New `src/components/SendSheet.tsx`, `src/components/ToastHost.tsx`, `src/stores/toast-store.ts`; Send on spot detail (paper-plane, hidden on another rider's spot), the select bar 'Send (N)', a list's 'Send these spots · one-time copy of N spots' row (+ empty `ShareListSlot`), the area picker 'Send these N spots'; `ToastHost` in `app/_layout.tsx` and in the area picker.
- Tests 1589 → 1634 (send-sheet 25, toast-store 6, + detail 3, select 1 net, list 5, area 4, root-layout 1). RED commits 6218f0e, 8bda862 first. Two old "no Send yet" tests (S1 select, S2 area) updated.
- Verified: `check.sh` green 1634, `npx jest --ci` 0 `console.error`, `grep -n Share src/components/SendSheet.tsx` prints nothing, `npx expo export --platform ios` exit 0.
- Opus review: 3 Important, 5 Minor, no Critical. Fixed RED-first: the sheet can't close while sending (a late finish closed the next sheet), the area picker gets its own toast (a native modal hides the root one), a friend removed while checked isn't sent to, a failed friends load gets Try again, the toast is announced once. Not changed: 'Sign in' closes the sheet and opens the sign-in modal in one tap; iOS may refuse that, and Jest can't show it, so it's a step on the live checklist. Full table in the S7 plan under 'As built (S7-04)'.
- Next (S7-05): use `showToast` for the Inbox's 'Saved 3 spots' if it's a toast, and draw a `ToastHost` in any new native full-screen modal. The detail rule for "another rider's spot" is `owner_id` set and ≠ the signed-in uid. Signed out, every spot shows Send and the sheet asks the rider to sign in; S8 may tighten this for others' spots kept on the phone.
- Questions for Michael: none new.

### 2026-10-23 10:30 · S7-03 · passes

- Server: append-only migration `20261024010000_sends_s7.sql` (staged send photos D77, `create_send` stamps the sender D80 and refuses another's staged id, `mark_send_saved(p_id, p_token)` saves once with a retry token, `spots.from_username`, `staged_send_objects`); account-delete removes staged leftovers. pgTAP `100-sends-s7` (34) + edits to 060/070.
- Client: `src/sync/sends.ts` (createSend, NotBackedUpError, loadSends/loadAndApplySends in the engine after friends, saveSend, dismissSend, withdrawSend, listSent), `src/hooks/use-sent-sends.ts`, `src/sync/reload.ts`, push/pull carry `copied_from_send`/`from_username`, `PhotoIO.remove`, Inbox `SendItem` (a plain line until S7-05). Fake client: copy/remove/createSignedUrl/`.is()`, rpc in `calls`.
- Tests 1538 → 1589 (new `sync-sends` 42, `use-sent-sends` 5; +1 push, pull, accounts-integration; +2 engine). RED commits c21261f, 4eff9d1, e6d3297 first. Local stack: `test:db` Files=10 Tests=604 PASS, `test:integration` 36/36, stack stopped, `docker ps` shows only the 7 dj-*/n8n-* containers. `check.sh` green 1589, `npx jest --ci` 0 `console.error`.
- Opus review: 2 Important (a lost `mark_send_saved` answer or a failed insert could save twice or lose copies → save token + an in-memory pending save) and 4 Minor, all fixed RED-first; table in the S7 plan, under As built.
- Next session (S7-04): `createSend` takes `sender` (pass `useAuthStore` username/displayName). Catch `NotBackedUpError` for the D78 line. A result with `failed` set means a partial send.
- Step 2 ("listSent is loaded on the Sent screen's mount"): the hook loads on mount. The screen itself is S7-05's.
- Proposed changes:
  - S7-05's Inbox should map `saveSend`'s statuses to the copy table: `already_saved` → 'Already saved', `taken_back` → '@ana took these spots back.', `failed` → "Couldn't save these spots. Try again."
  - S7-06 can use the save-token retry case.
  - Signatures follow the plan, not the feature text: `loadSends`, `saveSend(db, client, uid, item, opts)`, `withdrawSend(client, uid, { id, photoPaths })`.
- Questions for Michael: none new (D76–D82 still open in §9).

### 2026-10-23 07:00 · S7-02 · passes

- New `src/utils/send-payload.ts` (`freezeSend`, `parseSendPayload(json, sendId)`, `thawSend(payload, { sendId, uid, now, newId, spotIds })`, `MAX_SEND_SPOTS` 100, `sendPhotoPath`); local migration 7 (`spots.copied_from_send`, `from_username`; `insertSpot`/`getSpots` carry them, `SpotUpdate` excludes them); detail shows 'From @ana' under the title. `photoRelativePath` now exported from photo-storage.
- Tests 1495 → 1538: new `send-payload.test.ts` (36), migration 7 block in `db-migrate`, +2 `db-spots`, +2 `spot-detail`. RED commit `0f7e1eb` first (module not found + 6 failing). Two migration-5 tests and the `db-foreign-keys` rebuild helper changed because today's readers/columns now include migration 7's.
- Verified: `check.sh` green (1538), `npx jest --ci` 0 `console.error` lines.
- Next (S7-03): pull's spot upsert and push's `sendSpot` (`push.ts:203`) don't map the two columns yet (plan: S7-03 with the server migration); `saveSend` must drop photos whose download failed and reset `primary_photo_id` (thaw sets the first photo's new id).
- Proposed changes: step 1 names `thawSend(payload, uid, now, newId)` positionally and lists the frozen fields without `id`; built to the plan's signature (needs `sendId`) and with the sender's spot `id` (for Pick spots), as the S7-01 plan's "Proposed changes" says.

### 2026-10-23 06:00 · S7-01 · passes

- New `docs/plans/2026-10-22-s7-send.md`: Payload (`src/utils/send-payload.ts` v1, frozen fields only), Photo copy (copy each photo to `sends/<id>/` before `create_send`, client `newId()`, failure removes copies; server-side copy function rejected), Migration 7, Send sheet, Entry points, Inbox save flows, Sent, Copy table, integration design, RED test list per feature, Opus plan review (1 Critical, 6 Important: all folded in).
- Finding: S3's storage policy refuses uploads into a send that doesn't exist yet, so "copy before create_send" needs one append-only server migration in **S7-03**: staged photos (D77), `create_send` stamps the sender's name, `mark_send_saved` refuses a second save, `spots.from_username`. pgTAP `100-sends-s7` + one `070` case changes.
- Spec §2 D76–D82 *default*, §9 Q37–Q43; live checklist gains 'S7 — Send spots to friends' (with deploy order).
- Verified: `check.sh` green, 1495 → 1495 tests (docs only).
- Next session (S7-02): build to the plan's signatures (Proposed changes lists where they differ from the feature texts); `captured_at` freezes as the day only (D46).
- Questions for Michael: §9 Q37–Q43 (one copy per friend; photos copied before the send; sending needs a backup; ≤ 100 spots per send; 'From @name' frozen; picking some spots finishes a send; dismissed reads 'Waiting' to the sender).
- Proposed changes: S7-03 gains the server migration + pgTAP + push/pull mapping; Save order is download → `mark_send_saved` → insert (closes the withdraw race); S7-06 gains staging-cleanup and forged-sender cases.

### 2026-10-23 · verify S6

All 26 steps hold; no live stack run (build-only), integration counts read from the plan.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S6-01 | 1 | read docs/plans/2026-10-22-s6-friends.md headings | Has Data, Local cache (D72 default), Screens (Friends, Inbox), Tab bar (D49), Copy table, Test list per feature | yes |
| S6-01 | 2 | grep live-checklist for S6 | Section 'S6 — friends and Inbox' (line 129): two riders, two emails, sign out/in switch | yes |
| S6-01 | 3 | check.sh | green, 1495 tests (lint+tsc+jest) | yes |
| S6-02 | 1 | read schema.ts MIGRATIONS; ran db-migrate + db-profiles tests | 6 migrations (migration6 creates profiles id/username/display_name); both suites pass; profiles.ts exists | yes |
| S6-02 | 2 | ran sync-friends.test.ts; read case names | passes; covers normalisation (p_username 'ana'), not-found sends nothing, P0002, .in-only profile select, mirror upsert | yes |
| S6-02 | 3 | ran sync-engine.test.ts | passes; 'loads friends after the pull and fills the friends store (S6)' | yes |
| S6-02 | 4 | check.sh; jest on 9 S6 suites | green; 223 tests pass, no console.error lines | yes |
| S6-03 | 1 | read app/friends/index.tsx, _layout.tsx:67, profile.tsx FriendsRow; ran friends-screen.test.tsx | registered 'Friends'; row 'Friends · N' pushes; tests assert signed-out line, sections, Add result lines, long-press Remove/Block, confirm text, single-flight; pass | yes |
| S6-03 | 2 | read HINT constant and test line 169 | Hint text matches exactly; test asserts it | yes |
| S6-03 | 3 | check.sh / jest | green, zero console.error | yes |
| S6-04 | 1 | read tabs layout lines 44-45; ran tabs-layout.test.tsx | order Spots,Lists,Inbox,Profile; tray.fill; badge undefined at 0, '2' at two unseen; pass | yes |
| S6-04 | 2 | ran inbox-tab.test.tsx | signed out, empty, two requests with Accept/Decline, mark-seen on focus all asserted; pass (unconfigured line: covered in same screen copy) | yes |
| S6-04 | 3 | ran inbox-store.test.ts | typed kinds, selectUnseenCount cases (created_at > mark); pass | yes |
| S6-04 | 4 | check.sh | green | yes |
| S6-05 | 1 | read src/__integration__/friends.test.ts cases (6); did not run (build-only: no containers) | BEN case-insens, accept, block, nobody -> found:false, cleanup deleteRider; recorded run 35 pass (friends 6) in plan 'As built' | yes |
| S6-05 | 2 | read plan As built; docker ps --format | recorded db:reset, test:db 569, integration 35 pass, stop; docker ps now has no supabase_* container | yes |
| S6-05 | 3 | check.sh | green | yes |
| S6-06 | 1 | read docs/plans/2026-10-22-s6-what-michael-will-see.md | Friends signed out/with friends, result lines, Inbox empty/two requests, tab bar badge 2 all listed | yes |
| S6-06 | 2 | read 'What to tap' | 7 steps: add, accept, block, name vanishes from find, undo | yes |
| S6-06 | 3 | read Verification record | jest 1487 tests, 0 console.error; integration 35 pass; expo export exit 0, 5.2 MB | yes |
| S6-06 | 4 | check.sh | green | yes |
| S6-07 | 1 | ls reviews/s6.diff; read plan '## Review (S6-07)' | s6.diff 4279 lines, tracked, matches diff a07aec5..HEAD (same 32 files as 986ee98); findings table has severity/file:line/fix; RED/GREEN commits listed | yes |
| S6-07 | 2 | read five written answers; checked tests exist by name in grep | all five answered with named tests (normalise, profiles .in, P0002, incoming only, single-flight); present | yes |
| S6-07 | 3 | git log | refactor commit 526dd6f present | yes |
| S6-07 | 4 | grep CLAUDE.md, README | CLAUDE.md names app/friends, inbox.tsx, friends.ts, stores, profiles.ts; README has 'Friends and Inbox (S6)' | yes |
| S6-07 | 5 | check.sh | green, zero console.error | yes |

### 2026-10-23 12:10 · S6-07 · passes

- Review of S6 (`reviews/s6.diff`, 4279 lines, two Opus reviewers: data path, screens): 1 Important fixed (Friends: Remove / Cancel / Block / Unblock left the row live until the queued friends load, maybe minutes behind a backup; now the friends store's `dropFriendship` / `noteBlocked` / `noteUnblocked` take it off at once, a failed action keeps it), RED `5595ba9` (8 fail) → GREEN `b6a45b9`. 6 Minor left with reasons in the plan's new 'Review (S6-07)' section (with the RED-first table and five written answers, proving tests checked by grep).
- `refactor:` `526dd6f`: one `confirmBlock` for Friends and Inbox; `lastSyncKey`/`inboxSeenKey`/`forgetAccount` in `src/db/sync.ts` replace adopt's three resets. Docs: CLAUDE.md layout (Inbox tab, app/friends/, profiles.ts, the new helpers), README 'Friends and Inbox (S6)'.
- Verified: `check.sh` green, tests 1487 → 1495, `npx jest --ci` 0 `console.error`. No stack run (no server code changed).
- Next session (S7-01): S6 is complete; the S6 PR is the harness's. Minor left open worth a look in S7: an empty Friends/Inbox while the D66 switch confirm is pending (no line says why).
- Questions for Michael: none new (D72–D75, §9 Q33–Q36 still open). Proposed changes: none.

### 2026-10-23 11:00 · S6-06 · passes

- Added `docs/plans/2026-10-22-s6-what-michael-will-see.md`: Friends signed out / unconfigured / two friends + one sent request, all seven Add result lines, Inbox signed out / empty / two requests, tab bar with badge '2', 'What to tap' with two riders (add, accept, block, vanishes from find), verification record. Renders came from temporary Jest tests (deleted; tree walk of text, labels, roles).
- Verified: `npx jest --silent` 91 suites 1487 passed, 0 `console.error` non-silent; `test:integration` 35 passed (3 suites) with db:start/reset, stack stopped, 0 supabase_* containers; `npx expo export --platform ios` exit 0, 5,202,562 byte hbc; `check.sh` green 1487.
- Next session: S6 is complete; S7 begins. No code changed. Questions for Michael: none new. Proposed changes: none.

### 2026-10-23 10:30 · S6-05 · passes

- Added `src/__integration__/friends.test.ts` (6 cases, riders ana/ben/cal, each with a node:sqlite phone whose `sync_state.user_id` is theirs): 'BEN' finds ben + one pending request (and a direct uppercase `find_profile`), ben sees it incoming, ana's mirror and friends store keep ben's name, ben's Inbox gets the item; accept → both list the other; ana+cal friends, cal blocks ana → friendship gone both sides, cal's profile unreadable and absent from ana's `find_profile` (not ben's), `addFriend` → `{ found: false }`, a direct send answers `P0002` like an unknown name; 'nobody_…' → not found, own name → self; remove, unblock, ask again. Plan gains "As built (S6-05)". Jest default suite 1487 → 1487 (integration is separate: 29 → 35).
- Verified: `db:start` → `db:reset` → `test:db` Files=9 Tests=569 PASS → `test:integration` 3 suites 35 passed, twice, `auth.users` 0 after each → `db:stop`; `docker ps` = the same 7 dj-*/n8n-* containers, no `supabase_*`. `check.sh` green 1487.
- No RED commit: the code (S6-02) existed and the first run was green. Instead, mutations: incoming/outgoing swap fails 6/6, no mirror write fails 1, `find_profile` without its block check fails 1, case-sensitive `find_profile` fails 1 (the last two only after I added the direct-rpc assertions). Unmapped `P0002` on send survives (race-only path, unit-tested).
- Next session (S6-06): integration count for the doc is 35 (accounts 17, sync 12, friends 6).
- Questions for Michael: none new (D72–D75, §9 Q33–Q36 still open). Proposed changes: S6-05 step 1's 'cal blocks ana' runs after ana and cal are friends (plan review #5, so the block has something to hide); 'nobody' is `nobody_<8 hex>` so it can't collide with a real rider.

### 2026-10-23 09:40 · S6-04 · passes

- Added `src/stores/inbox-store.ts` (kind-tagged items, `InboxKind` = friend_request | send | invite; `setItems` per kind, `removeItem`, `loadSeen`/`markSeen` on `sync_state` `inbox_seen_at:<uid>` = newest server `created_at` seen, never backwards; `selectUnseenCount`, 0 until the mark loads; emptied on every rider change) and `app/(tabs)/inbox.tsx` (Friend requests with Accept / Decline, single-flight, long press or VoiceOver Block + confirm, empty copy, signed out / unconfigured lines, marks seen while focused **and** AppState active, refresh on focus and pull). Tabs: Spots · Lists · Inbox (`tray.fill` → 'inbox') · Profile, badge from `selectUnseenCount`. `loadAndApplyFriends` fills the Inbox; adopt/Remove/release clear the mark; Friends' 'N friend requests in Inbox' is a link (`router.dismissTo('/inbox')`). Tests 1436 → 1487.
- Verified: RED d14bde9 (4 suites unresolved + 1 case), green; mutation checks: dropping the busy ref turns the double-tap test red, dropping the app-active gate turns the background test red. `check.sh` green 1487, 0 `console.error`; `npx expo export --platform ios` exit 0.
- Opus review: 1 Important (`router.navigate('/inbox')` from Friends would push a second tab navigator; now `dismissTo`) + 3 Minor (answered row tappable again until the reload; a seen-mark read failure showed as a Friends load error and could leave the Inbox behind Friends; mark never cleaned up) + 1 test gap (markSeen across a rider change), all fixed after RED 423af11 (10 failing).
- Next session (S6-05): integration only; nothing in the Inbox needs the stack. S7/S8 add an item interface to the `InboxItem` union, a `case` in the tab's `renderItem` (the `never` check makes a missing one a type error), and call `setItems(uid, 'send' | 'invite', …)`; the badge needs no change.
- Proposed changes: S6-04 step 2's `setSyncState('inbox_seen_at', now)` is per rider and stores the newest server time (plan); step 3's items type has the `friend_request` variant only, `InboxKind` lists all three (S7/S8 add their variants); Accept/Decline accessibility labels are 'Accept friend request from @ana'.
- Questions for Michael: none new (D72–D75, §9 Q33–Q36 still open).

### 2026-10-23 08:10 · S6-03 · passes

- Added `app/friends/index.tsx` (Add by exact @username + hint + result lines per the plan's copy table, sections Friends / Requests sent (Cancel) / Blocked (Unblock, D74), long press or VoiceOver actions → Remove friend / Block @ana → confirm, single-flight per row via a ref, pull to refresh, 'N friend requests in Inbox' line), registered as 'Friends' in `app/_layout.tsx`; Profile (signed in) gains a 'Friends · N' row → `/friends`. Tests: 1399 → 1436 (`friends-screen.test.tsx` 33, profile +3, root-layout +1).
- Verified: RED commit 77f09bf (suite unresolved + 3 cases), green; mutation checks: removing either single-flight ref turns both double-tap tests red; the old grouped-row markup turns the VoiceOver test red. `check.sh` green, 1436 tests, 0 `console.error` in the touched suites.
- Opus review: 3 Important (VoiceOver couldn't reach Cancel/Unblock inside a grouped Pressable; Remove/Block long-press only; row spinner waited for the whole sync queue) + Minor (Add with a lost session showed nothing, test gaps) — all fixed with RED tests first (commit 9b8d0e8).
- Next session (S6-04): make the '1 friend request in Inbox' line on Friends a link to the Inbox tab (plain Text now, no route yet). A `needs_username` rider sees 'Sign in to add friends' (the tabs redirect them anyway; S6-07 may route to `/auth/username`). Screens call `refreshFriends` without awaiting it after a mutation.
- Proposed changes: S6-03 step 1's 'Already friends' is 'Already friends with @dee' (plan copy); the sent row's Cancel has the accessibility label 'Cancel request to @cal'.
- Questions for Michael: none new (D72–D75, §9 Q33–Q36 still open).

### 2026-10-23 06:40 · S6-02 · passes

- Added migration 6 (local `profiles` mirror, D72) and `src/db/profiles.ts`. Added `src/sync/friends.ts` (`loadFriends`/`addFriend`/`respond`/`removeFriend`/`block`/`unblock`/`refreshFriends`/`loadAndApplyFriends`), `src/stores/friends-store.ts` (emptied on every auth `userId` change) and `src/sync/queue.ts` (`runExclusive` moved here, so engine ↔ friends has no import cycle). The engine loads friends after each sync. adopt/Remove/release empty the mirror. The fake client gains `rpc`/`rpcs`/`rpcHandlers`/`readableProfiles`, and profiles selects are now logged and filtered. Tests: 1332 → 1399.
- Verified: RED commit 03349dd (5 migrate cases + 6 suites unresolved), then green. Mutation checks: the ticket, `maySync` and apply-time `signedInAs` guards each turn a test red when removed. `check.sh` green, 1399 tests, 0 `console.error`.
- Opus review: 0 Critical, 0 Important. Minor fixes applied: a rider blocked between the two reads shows as blocked only; blocked sorted by name; the friends load runs after the backup bookkeeping; two more guard tests. Left open: `addFriend` reports 'accepted'/'sent' from a select made before the send (a race with the other rider can mislabel it; S6-07 may re-read by the returned id).
- Next session (S6-03/04): the mutations only call the server and take `(client, uid, …)`. The screen must call `refreshFriends(db, client, uid)` afterwards (never from inside a `runExclusive` task). `addFriend` returns `null` when not signed in as `uid`. `applyFriends` does **not** fill the inbox store yet: S6-04 adds that, plus `loadSeen`, in the friends store or in `loadAndApplyFriends`.
- Proposed changes: S6-02 step 2's rpc args are `{ p_username }`, `{ p_id, p_action }`, `{ p_user }` (as S6-01 noted); the mutations take `uid`, and the caller runs the refresh (plan said each ends with `refreshFriends`).
- Questions for Michael: none new (D72–D75, §9 Q33–Q36 still open).

### 2026-10-23 05:10 · S6-01 · passes

- Wrote `docs/plans/2026-10-22-s6-friends.md`: Data (`src/sync/friends.ts` loadFriends/addFriend/respond/removeFriend/block/unblock/refreshFriends + friends store), Local cache (migration 6 `profiles` mirror, D72), Screens (Friends, Inbox tab with a kind-tagged item model for S7/S8, badge = unseen after `inbox_seen_at:<uid>`), Copy table, Tab bar (D49), integration design, Test list per feature. No server migration needed: S3's functions and RLS cover S6.
- Spec §2 gains D72–D75 *default*, §9 Q33–Q36; live checklist gains "S6 — friends and Inbox" (two emails, switch by sign out/in, Studio checks).
- Opus plan review: 0 Critical, 5 Important, 5 Minor, all folded into the plan (session guard via `signedInAs` so the 3-client integration test works, `maySync` re-check + `runExclusive` for the mirror write, newest-load-wins ticket, `seenAt` undefined = badge 0 until loaded, a non-vacuous block test).
- Verified: plan headings present; `check.sh` green, 1332 → 1332 tests (docs only).
- Next session (S6-02): the fake's `profiles` branch must be rewritten (it skips `selects` and ignores `.in`); rpc args are `p_username`/`p_id`/`p_action`/`p_user`.
- Questions for Michael: §9 Q33 (friend names kept on the phone), Q34 (a sent request shows 'A rider you asked' on another phone), Q35 (Blocked section with Unblock), Q36 (opening Inbox clears the badge, no per-row unread).
- Proposed changes: S6-02 step 2 should name rpc args `{ p_username }`, `{ p_id, p_action }`; S6-04 step 2's `setSyncState('inbox_seen_at', now)` → per-rider key storing the newest server `created_at`; S6-03's 'Already friends' copy reads 'Already friends with @dee', and a target *you* blocked reads 'You blocked @dee…' (one who blocked you reads 'No rider named @dee').

### 2026-10-23 · verify S5

All 9 features hold (43 steps). The local stack was not started (build-only policy), so the two-device integration test was read, not re-run; the recorded run is in the plan.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S5-01 | 1 | `git show 5cc9e8f`; `npx expo export --platform ios --output-dir /tmp/harness/hit_list/hl-export` | chore commit touches only package.json/package-lock.json (expo-image-manipulator ~57.0.21); export exit 0 | yes |
| S5-01 | 2 | Read headings of docs/plans/2026-10-22-s5-sync.md | Has Migration 5, Outbox, Push (+photos), Pull, Engine, Adoption, Sign out, Integration test design, Test list per feature | yes |
| S5-01 | 3 | grep D65–D71 in spec §2/§9 | D65 (sync_queue drop) and D66 (other account's rows removed after push) *default* present, plus D67–D71, §9 Q26–Q32 | yes |
| S5-01 | 4 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-02 | 1 | `git diff` of src/db/schema.ts since S5-01; jest db-migrate.test.ts (verbose) | Only the MIGRATIONS array line changed in migrations 1–4 (+99 added lines); 'migration 5' cases: owner_id/rev columns, sync_outbox+sync_state, sync_queue dropped, v2 fixture 2→5 intact, re-run no-op | yes |
| S5-02 | 2 | jest db-sync.test.ts verbose | enqueue/peekOutbox id order, markDone, markFailed, skipFailed attempts≥3, countFailed ≥10, getCursor 0 default/setCursor, get/setSyncState user_id all pass | yes |
| S5-02 | 3 | jest db-spots/db-media/db-hit-lists 'outbox (migration 5 triggers)' cases | Insert/update/soft-delete append upsert/delete; 'list/spot' membership ids; NULL owner appends nothing; failing statement leaves no outbox row; updateSpot on owned spot appends upsert | yes |
| S5-02 | 4 | grep owner_id in src/types/index.ts; grep SyncQueueItem src | owner_id?: string on Spot, Media, HitList; SyncQueueItem gone; readers return owner_id (tests pass) | yes |
| S5-02 | 5 | `check.sh` (lint + tsc + jest, 1332 tests): green | green, 0 console.error in the S5 suites | yes |
| S5-03 | 1 | jest sync-photos.test.ts verbose | preparePhoto resizes to 2048 long edge, JPEG 0.85, 'never writes the original file'; uploadPhoto puts <owner>/<spot>/<media>.jpg image/jpeg overwriting | yes |
| S5-03 | 2 | jest sync-push.test.ts verbose, read ordering/failure/missing/no-session cases | Order spot→photo+media→list→membership→delete pushed; failing upsert keeps attempts 1+last_error and holds later rows, retries next push; missing photo gets last_error 'photo missing' but is parked (set aside), not attempt-counted — intent holds; no session does nothing | yes |
| S5-03 | 3 | jest 'pushes natural_speed 0 (None) as 0 and an unrated spot as null' | passes | yes |
| S5-03 | 4 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-04 | 1 | jest sync-pull.test.ts verbose | Asks rev>0 order rev limit 500 per table; inserts with owner; cursor reused (with 200 overlap); LWW older/newer; server delete soft-deletes and keeps memberships; text[]→json; null speed→unset; 500-row page asks next page | yes |
| S5-04 | 2 | jest 'readable-id reconciliation' cases | Removes foreign spots no longer readable with media; own rows excluded (SQL filters owner_id <> uid); error removes nothing | yes |
| S5-04 | 3 | jest 'appends no outbox row for 3 pulled rows' | passes | yes |
| S5-04 | 4 | read pull return type / engine test 'leaves the stores alone when the pull changed nothing' | pull returns { changed, failed }; engine reloads only on changed | yes |
| S5-04 | 5 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-05 | 1 | jest sync-engine.test.ts verbose | single-flight, stores reloaded on changed, lastSyncAt/syncing/failedCount/lastError, no-session no calls, push exception → console.warn and pull still runs | yes |
| S5-05 | 2 | jest use-sync.test.tsx verbose; app/_layout.tsx mounts it | Sync after ready, on AppState active only, every 300 000 ms, sign-out and unmount clear interval/listener (10 cases pass) | yes |
| S5-05 | 3 | jest spots-view-mode.test.tsx 'Spots tab pull-to-refresh' | RefreshControl present signed in, syncs, spinner tied to the rider's pull; background sync shows none | yes |
| S5-05 | 4 | jest profile.test.tsx + relative-time.test.ts | 'Backed up · just now' / '3 min ago'; '3 changes not backed up' + Retry resets then syncs; relativeTime cases pass | yes |
| S5-05 | 5 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-06 | 1 | jest sync-adopt.test.ts 'adopt: the first sign-in' | 3 spots/4 media/2 lists → owners set, 9 upserts + 3 membership upserts, one transaction (failure leaves NULL/empty), idempotent | yes |
| S5-06 | 2 | jest 'adopt: another account signs in' | A's spots/media/files/lists/memberships removed, cursors reset, then B adopts; fake-fs files gone | yes |
| S5-06 | 3 | jest use-adoption.test.tsx | Adopt then syncNow when status becomes signed_in and when signed in at launch (hook is useAdoption in AuthInit, not useAuthInit; behaviour matches) | yes |
| S5-06 | 4 | grep app/(tabs)/profile.tsx alerts; jest profile.test.tsx | Texts 'Keep spots on this phone?' / "They're backed up in your account either way." Keep / Remove from this phone; waiting: "N changes aren't backed up yet" Sign out anyway/Cancel, no Remove; all three paths tested | yes |
| S5-06 | 5 | profile.tsx:200; profile.test.tsx:811 | 'Your account is deleted. Keep the spots on this phone?' with Keep/Remove; test asserts it | yes |
| S5-06 | 6 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-07 | 1 | Read src/__integration__/sync.test.ts cases A→B (not run: build-only policy forbids starting containers) | Assertions match: spot+owner_id, getMediaForSpot, storage download bytes == fixture, rename, delete, offline-notes converge to B's, membership add/remove. Run record in plan: 2 suites 29 passed (not re-run by me) | yes |
| S5-07 | 2 | Read 'one phone, two riders' cases; fixture photo-2kb.jpg (2086 B) | X adopted+pushed, Keep, Y removes X rows+files and pulls own spot, X back gets spots+photos byte-equal; same assertions as step | yes |
| S5-07 | 3 | Read plan 'As built (S5-07)' Cleanup | deleteRiderAndPhotos in afterAll; ran twice in a row, 0 rows left (recorded, not re-run) | yes |
| S5-07 | 4 | Plan as-built Run record; `docker ps --format '{{.Names}}'` | Recorded db:start/reset, test:db 569 pass, integration 29 pass ×2, db:stop; docker ps now lists only dj-*/n8n-* containers, no supabase_* | yes |
| S5-07 | 5 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-08 | 1 | Read docs/plans/2026-10-22-s5-what-michael-will-see.md lines 1–27 | Profile states 'Backed up · just now', '3 changes not backed up'+Retry, Sign out alerts (Keep/Remove, aren't backed up yet, Delete account variant) with texts | yes |
| S5-08 | 2 | Read lines 28–48 | What to tap: sign in, Backed up, Studio http://100.88.90.97:54323 + photos bucket, Airplane add + count + Retry/pull-to-refresh, sign out Keep, second rider empty tab, back as first; 'How to undo' present | yes |
| S5-08 | 3 | Read 'Checks recorded' lines 50–56 | jest 1324 tests 0 console.error, integration 29 passed, expo export exit 0 5.1 MB; I re-ran export (exit 0) | yes |
| S5-08 | 4 | `check.sh` (lint + tsc + jest, 1332 tests): green | green | yes |
| S5-09 | 1 | ls reviews/s5.diff (8135 lines); read plan '## Review (S5-09)' table | Diff written; findings with severity, file:line, fix commits; RED-first table with RED commits before GREEN for each fix | yes |
| S5-09 | 2 | Read written answers 1–10 and the named tests in the verbose run | Each of the eight claims has a named existing, passing test (markDone, pull LWW, Remove blocked while pending, adopt one transaction, use-sync timer cleanup, 'never writes the original file', foreign-only reconciliation, console.warn); caveat: parked rows not counted as pending, recorded as Minor | yes |
| S5-09 | 3 | git log 265d76f | 'refactor: S5 simplification pass' commit exists | yes |
| S5-09 | 4 | grep CLAUDE.md, README.md, live-checklist | CLAUDE.md has src/sync/ + src/db/sync.ts layout and Sync (S5)/owner_id convention; README line 58 'Backup and sync (S5)'; live-checklist 'S5' section with Studio checks | yes |
| S5-09 | 5 | `check.sh` (lint + tsc + jest, 1332 tests): green | green; grep console.error in src/sync and src/db/sync.ts = 0 | yes |

### 2026-10-23 14:30 · S5-09 · passes

- **What changed:** two Opus reviewers covered the S5 diff (`reviews/s5.diff`, 8135 lines). Three Important findings and two Minor ones were fixed RED → GREEN (`74add1c`/`0a768bd` → `fbf3810`/`6b2e622`):
  - Delete account now runs on the sync queue (`deleteAccountAndRelease`). Before, a sync running at the same time could pull the empty account and wipe the rider's list memberships.
  - Push marks a row done only while the session lasts. Before, a membership delete answered 204 after a sign-out was lost.
  - Media `addMany` skips ids it already has. Before, a sync reload in the middle of saving photos duplicated one.
  - Minor: an `updated_at` tie keeps a waiting local change (the town after a push).
  - Minor: the pull-to-refresh spinner shows only for a pull.
- **Refactor and docs:** `refactor:` `265d76f` (`errorMessage`, `reloadStoresQuietly`). Updated CLAUDE.md (src/sync layout, Sync/owner_id conventions), README "Backup and sync (S5)", the live checklist (S5 Studio checks), and the plan's "Review (S5-09)" (8 findings with file:line and commits, ten written answers with proving tests). Tests 1324 → 1332.
- **Verified:**
  - check.sh green, 1332 tests, `npx jest --ci` prints 0 `console.error`.
  - `expo export` exit 0, 5.1 MB.
  - Local stack: `test:db` Files=9 Tests=569 PASS, `test:integration` 29/29, then `db:stop`. `docker ps` matches the list from before the run (7 dj-*/n8n-*), no supabase_*.
- **Left (Minor, in the plan):** parked rows don't count as pending, so Remove deletes them. A release failure after Delete account still signs out.
- **Next:** S5 is complete; the milestone PR is the harness's. S6-01 is next.
- **Questions for Michael:** none. **Proposed changes:** none.

### 2026-10-23 13:10 · S5-08 · passes

- **What changed:** new `docs/plans/2026-10-22-s5-what-michael-will-see.md` (Profile states, four alerts with every text, phone walkthrough + undo, recorded checks). No code changed.
- **Verified:** text dumped from a scratch render of Profile (test file deleted). jest 85 suites / 1324 tests, 0 console.error; integration 29/29 against the local stack (stopped after, no supabase_* containers); `expo export` exit 0, 5.1 MB; check.sh green.
- **Next:** S5 is complete; S6 is next.
- **Questions for Michael:** none.

### 2026-10-23 12:40 · S5-07 · passes

- **What changed:**
  - New: `src/__integration__/sync.test.ts` (12 cases) and a 2086-byte JPEG fixture, `src/__tests__/fixtures/photo-2kb.jpg`.
  - `helpers.ts` gained `deleteRiderAndPhotos`: a fresh sign-in, then `account-delete`, falling back to the admin API for the photos and the user.
  - Docs: plan "As built (S5-07)", one CLAUDE.md line.
  - No app code changed. Jest stays at 1324; integration went from 17 to 29.
- **Verified:**
  - Stack: `db:start` → `db:reset` → `test:db` (`Files=9, Tests=569, PASS`) → `test:integration` 29/29, twice in a row → `db:stop`.
  - After every run, `auth.users`, `storage.objects` and `spots` all counted 0.
  - Cleanup also left 0 behind with a forced failure while X was signed out, and with the edge runtime stopped.
  - `docker ps`: the same 7 dj-*/n8n-* containers, no `supabase_*`. check.sh green.
- **Mutations:** the test passed on its first run, because it checks code built in S5-02…06. Instead, 5 of 6 hand mutations were killed: both LWW guards off, switch keeps files, switch keeps cursors, membership delete not sent, no download write. The survivor, pull's SQL LWW guard alone, is backed up by the JS `isOlder` check.
- **Opus review:** 1 Important, 4 Minor, all fixed. The Important one: cleanup with X signed out left X's photos in storage.
- **Next (S5-08) must know:**
  - The integration pass count is 29.
  - Byte-for-byte equality proves the transport only: the Node PhotoIO doesn't re-encode.
- **Questions for Michael:** none.
- **Proposed changes:** none.

### 2026-10-23 11:40 · S5-06 · passes

- **What changed:**
  - New: `src/sync/adopt.ts` (`adopt`, `removeLocalAccountData`, `releaseAccountData`, `removeReleasedRows`), `src/sync/owner.ts` (`currentOwnerId`) and `src/hooks/use-adoption.ts` (mounted in `AuthInit`).
  - `deleteSpotPhotos` was added. The fs fake gained `Directory.delete`.
  - Profile's Sign out now does one last backup (up to 10 s), then shows the Keep / Remove / Cancel alert, or "3 changes aren't backed up yet".
  - Delete account now makes the spots phone-only first, then asks Keep / Remove.
  - New spots and lists get the rider as owner. A town keeps the spot's `updated_at`.
  - Tests 1266 → 1324.
  - Commits: RED `294992f`, GREEN `81768cc`, review RED/GREEN `813b409`/`4b80604`.
- **Verified:** check.sh green, 1324 tests, 0 `console.error`; `npx expo export --platform ios` exit 0. The steps by name:
  - `sync-adopt` (23 cases): 3 spots + 4 photos + 2 lists queue 9 upserts plus 3 memberships. An injected trigger failure leaves every owner NULL and an empty outbox. Running adopt again adds 0 rows. Switching A→B removes A's rows and files and resets the cursors.
  - `use-adoption` (13): adopt, then sync, and the D66 alert.
  - `profile` (69): all three alert variants, plus the Delete-account variant.
- **Opus review:** 0 Critical, 2 Important, 6 Minor; everything fixed RED first except 3 accepted Minors (details under "As built (S5-06)" in the plan).
  - Delete account with the alert never answered: the next sign-in would have wiped the spots. Fixed by D71: release first, then ask.
  - Adoption uploaded photos of spots deleted before sign-in. Fixed by D70: live rows only.
- **Next (S5-07) must know:**
  - `adopt(db, uid)` sets `sync_state.user_id`; the integration test needs it before `push`.
  - Sign-out Keep = `signOutOfAccount` only.
  - The switch keeps rows owned by the new rider.
- **Questions for Michael:** Q31 (D70: spots deleted before sign-in are never uploaded) and Q32 (D71: closing the app on "Account deleted" means Keep).
- **Proposed changes:**
  - S5-06 step 3: adoption lives in `useAdoption` next to `useAuthInit`, tested in `use-adoption.test.tsx`.
  - Step 4: the Keep / Remove alert has a third button, Cancel. The waiting alert keys on `countPending` (D69), not `failedCount`.
  - S5-09: count parked rows before Remove and before the account switch.

### 2026-10-23 09:20 · S5-05 · passes

- **What changed:**
  - New: `src/sync/engine.ts` (`syncNow`, `runExclusive`, `SYNC_INTERVAL_MS`), `src/stores/sync-store.ts`, `src/hooks/use-sync.ts` (mounted in `AuthInit` in `app/_layout.tsx`) and `src/utils/relative-time.ts`.
  - The Spots tab has pull-to-refresh: `SpotsBrowser` gained a `refreshControl` prop, wired only when signed in.
  - Profile shows `Backed up · 3 min ago` / `Not backed up yet`, and `N changes not backed up` + Retry.
  - `pull` now reports `failed`; `db/sync.ts` gained `lastOutboxId` and `countPending(db, upToId)`.
  - Tests 1209 → 1266. New: `sync-engine`, `use-sync`, `relative-time`. Added to: profile, spots-view-mode, root-layout, sync-pull, db-sync.
  - Commits: RED `1bf68fa`/`4db7f3b`, GREEN `2986ed2`, review RED/GREEN `3e82aa5`/`22cfd30`.
- **Verified:** check.sh green, 1266 tests, 0 `console.error`; `npx expo export --platform ios` exit 0. Each step has a test:
  - Two concurrent `syncNow` → push called once.
  - Fake timers: a sync at 300 000 ms, none in the background, 0 timers after sign-out and after unmount.
  - `UNSAFE_getByType(RefreshControl)` is there signed in and absent signed out.
  - Retry calls `resetFailed` before `syncNow`.
- **Opus review:** 0 Critical, 3 Important, 3 Minor. All 3 Important and 1 Minor fixed, RED first.
  - 'Backed up' showed after a sync that sent nothing (offline, or the session lost mid-sync).
  - A store reload could overwrite an edit made during the sync.
  - Retry could join a sync already past its push.
  - Retry had no busy state or error handling (the Minor).
  - Details are in the plan under "As built (S5-05)".
- **Next session (S5-06) must know:**
  - Run adopt and Remove inside `runExclusive`, and **never `await syncNow` inside it** (deadlock). Use `void syncNow(db)` there, or await it after the call resolves.
  - Adopt must reload the stores itself.
  - `last_sync_at:<uid>` is per rider, so the account switch needs no extra clear.
- **Questions for Michael:** none new.
- **Proposed changes:**
  - S5-09 should surface parked rows on Profile. Today a parked change counts nowhere once parked.
  - The plan's "reload when push changed ownership" clause is dropped (push writes no local row).

### 2026-10-23 07:10 · S5-04 · passes

- **What changed:** new `src/sync/pull.ts` (`pull` → `{ changed }`, `PULL_PAGE` 500, `REV_OVERLAP` 200) and `src/sync/account.ts` (`maySync`/`signedInAs`, now shared with push). `photos.ts` gained `downloadMissingPhotos` and `PhotoIO.write`. The fake client now answers selects from `fake.tables` (gt/in/order/limit), logs them in `fake.selects`, has `failSelect(match)` and per-table `failNext`, and serves storage `download` from `fake.objects`. Tests went 1179 → 1209 (new `sync-pull.test.ts`, 30 cases). Commits: RED `5886e88`, GREEN `015140c`, then the review RED/GREEN pair `b1d6201`/`5407c17`.
- **Verified:** check.sh green, 1209 tests, 0 `console.error`. Step by step:
  - The first pull asks `select('*').gt('rev', 0).order('rev').limit(500)` for spots → media → hit_lists → hit_list_spots, exactly.
  - A 502-row table asks for a second page, `gt('rev', 500)`.
  - Two foreign spots, one no longer readable: that one is gone with its media and membership rows; the rider's own and phone-only spots stay.
  - Pulling 3 rows leaves `sync_outbox` at 0, and a later local edit of one of them queues 1.
- **Opus review:** 0 Critical, 2 Important, 3 Minor, 1 Nit.
  - **Fixed, RED first:** an edit saved while a pull was running could be overwritten. The updated_at guard is now inside the UPDATE itself.
  - **Also fixed:** photo downloads skip deleted spots, and the readable-id test is stronger.
  - **Left for S8 (Important, only once sharing is live):** a row that can never be written stops its table for good. Details are in the plan under "As built (S5-04)".
- **Next session (S5-05) must know:**
  - The engine runs push → pull → `downloadMissingPhotos(db, client, uid)`, and reloads the stores when `changed`.
  - Pull, like push, does nothing unless `sync_state.user_id` = the session uid.
- **Questions for Michael:** none new.
- **Proposed changes:**
  - S5-04 step 1 says "a second pull uses the stored cursor". It asks from the cursor minus `REV_OVERLAP` (late commits, as the plan says), and the test asserts that.
  - Step 2 "soft-deletes" is built as removing the rows (already proposed in S5-01).
  - Step 2's `select('id')` carries `.in('id', <local foreign ids>)` instead of reading every readable id.
  - S8 should add: skip a permanently failing row after N tries, fetch readable rows that aren't held locally whatever their rev (S3-08), and filter invitee-only lists out of pull.

### 2026-10-23 05:00 · S5-03 · passes

- **What changed:** new `src/sync/push.ts`, `src/sync/photos.ts` (`preparePhoto`, `defaultPhotoIO`, `uploadPhoto`) and `src/sync/time.ts` (`toIso`). `peekOutbox` gained `afterId`. The fake client gained `upsert`, `delete`, storage `upload` and an ordered `fake.calls` log. The fake fs gained `bytes`, `write`, `delete`, `Paths.cache` and `__writes()`. Tests went 1122 → 1179 (new `sync-push`, `sync-photos`, `sync-time`, plus 1 db-sync case). Commits: RED `f1c7c33`, GREEN `cc248ad`, then the review RED/GREEN pair `f9a70c7`/`8fc3b8c`.
- **Verified:** check.sh green, 1179 tests, 0 `console.error`. The step 2 outbox of 5 rows produces spots → upload → media → hit_lists → hit_list_spots → spots(deleted_at) in that order, and the outbox ends empty. natural_speed 0 goes up as 0. The image-manipulator mock cites `build/*.d.ts` and the original photo is never in `__writes()`.
- **Opus review:** 1 Critical, 3 Important, 2 Minor. Five are fixed, each RED first.
  - **Critical:** a photo or membership whose spot or list was still waiting got 42501 from the server (RLS runs before the FK check) and was parked for good. It now waits, untouched, behind that earlier row.
  - A 42501 after the session ended mid-push now stops the push and leaves the rows as they were.
  - `shared` is never pushed: a stale false would fire `t30_unshare` and drop every member.
  - EXIF `captured_at` is read as phone-local time.
  - The upload copy is deleted if reading its bytes fails.
  - Left open: storage `statusCode` is dropped (#6, for S5-09). Details are in the plan under "As built (S5-03)".
- **Next session (S5-04) must know:**
  - Every timestamp from the server goes through `toIso`.
  - `PhotoIO` still needs `write`/`remove` for `downloadMissingPhotos`.
  - Pull must write the server's `rev` so its writes queue nothing.
  - Parked rows are excluded from `countPending`. Membership reconciliation must not drop a local row that has a parked outbox row.
- **Questions for Michael:** none new.
- **Proposed changes:** in S5-03 step 2, "marked failed with last_error 'photo missing'" is built as `parkRow` (parked=1, last_error 'photo missing'), as the plan says. S5-09 should check `shared` stays out of every sync payload.

### 2026-10-23 03:10 · S5-02 · passes

- **What changed:** migration 5 is appended to `src/db/schema.ts`. It adds `owner_id`/`rev` to the tables, `updated_at`/`deleted_at` to media, `sync_outbox` and `sync_state`, drops `sync_queue` (D65), adds owner indexes and 8 outbox triggers. New `src/db/sync.ts` holds the outbox, cursor and state helpers. `Spot`/`Media` carry `owner_id`, `deleteMedia` is now a soft delete, `SyncQueueItem` is deleted. Tests went 1069 → 1122; new `db-sync.test.ts` and `helpers/outbox.ts`, plus cases in db-migrate/spots/media/hit-lists. Commits: RED `4346111`, GREEN `10448c7`, then the review RED/GREEN pair.
- **Verified:** check.sh green, 1122 tests, 0 `console.error`. `git diff` of schema.ts removes only the `MIGRATIONS` array line, so migrations 1–4 are untouched. An Opus review found 0 Critical. Fixed: a second soft delete of a spot or list re-stamped `deleted_at` and queued an upsert (now guarded by `deleted_at IS NULL`, RED first); a test that never asserted the pull-insert half; `SpotUpdate` no longer takes `owner_id`; the v4/v5 re-run tests now check something real; a cascade-delete case was added.
- **Next session must know:**
  - Below v5, `getSpots` **and** `getAllMedia` throw. A failed upgrade now loads only settings and lists, and the app stays blocked (D28). The failed-upgrade test was updated to match.
  - A future rebuild of `spots`/`hit_lists` must drop and recreate `hit_list_spots_outbox_*` (recorded in CLAUDE.md).
  - Pull (S5-04) must write a strictly newer `rev` and must never `INSERT OR REPLACE` (comment on the trigger).
  - `Media.updated_at` is not on the type; push reads the row itself.
- **Left open:**
  - Review #5: `savePhotos` puts the `Media` in the store without the spot's `owner_id` until the next reload. The engine (S5-05) reloads.
  - Review #7: `enqueueMemberships` skips an id when an older upsert waits even if a delete follows it. No path reaches this today.
  - New spots and lists don't get an owner yet, and the town backfill doesn't keep `updated_at` yet; both are for S5-05/06 (`currentOwnerId`).
- **Questions for Michael:** none new.
- **Proposed changes:** none.

### 2026-10-23 02:00 · S5-01 · passes

- **What changed:** `expo-image-manipulator` ~57.0.21 installed with `npx expo install`, in its own chore commit `5cc9e8f`. `npx expo export --platform ios` exits 0 (5.0 MB, scratch dir) and expo-doctor passes 21/21. Wrote `docs/plans/2026-10-22-s5-sync.md`, which covers Migration 5, Outbox, Push and photos, Pull, Engine, Adoption and switch, Sign out, the integration test design and a test list per feature. Added D65–D69 *default* to spec §2 and asked them as §9 Q26–Q30. No code changed: 1069 → 1069 tests, check.sh green.
- **Design the next sessions must know:** the outbox row comes from **SQLite triggers** in migration 5, not an app transaction. CLAUDE.md forbids `withTransactionAsync` for app writes. A trigger fires only for rows owned by `sync_state.user_id`, and only when `rev` is unchanged. Pull always writes the server's `rev`, so pull writes never queue anything, which prevents an echo loop with the server's equal-`updated_at`-applies guard. Local media becomes a soft delete with `updated_at`/`deleted_at`.
- **Plan review:** an Opus subagent reviewed the plan before any code: 1 Critical, 7 Important, 4 Minor. All 12 were folded into the plan; they are tabled under "Plan review". The Critical one: `syncNow` must not run until `sync_state.user_id` equals the session uid.
- **Questions for Michael:** Q26 (D65) is it fine to drop the never-used `sync_queue` table? Q27 (D66) another account signing in removes the last account's rows and asks first if some never backed up; OK? Q28 (D67) Keep after Delete account makes the spots phone-only again; OK? Q29 (D68) the archived Older details stay on the phone and are not backed up; want them backed up too? Q30 (D69) Sign out syncs first and offers no Remove while anything is waiting; OK?
- **Proposed changes:**
  - S5-02 step 1: hit_lists already has `owner_id` from migration 4, so migration 5 adds it to spots and media only; the test checks all three.
  - S5-04 step 2: reconciliation removes others' unreadable spots instead of soft-deleting them. A soft delete would queue an upsert this rider can't write.
  - S5-06 step 4: the not-backed-up sign-out variant keys on pending rows (`countPending`, failed ones included), not `failedCount > 0`.
  - S5-06: add the D66 switch confirm, "Changes not backed up" · Cancel / Remove and continue.

### 2026-10-23 · verify S4

All 8 features hold (37 steps). Limit: the build-only policy forbids containers, so the integration suite was not re-run, only read.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S4-01 | 1 | `package.json deps, `git log` chore commit 803a4fa, `npx expo export --platform ios` to scratch dir; plan line 42 on url-polyfill` | supabase-js, secure-store, async-storage present; own chore commit; export exit 0; polyfill not installed and the plan says why | yes |
| S4-01 | 2 | `cat .env.example, .gitignore, `git ls-files '.env*'`` | both EXPO_PUBLIC_ keys empty plus status comment; .env, .env.*, !.env.example; only .env.example tracked | yes |
| S4-01 | 3 | `headings of docs/plans/2026-10-22-s4-accounts.md; spec §2 D61-D63` | Client, Session storage (D61), Auth store, Screens, Profile, Sign out (D62), Delete account, Fake, Integration harness, Test list all present | yes |
| S4-01 | 4 | `grep live-checklist for 100.88.90.97, .env.local, 54324` | lines 59-66 give the .env.local step with the Tailscale URL, start:tailscale and the Mailpit :54324 code | yes |
| S4-01 | 5 | `check.sh: lint + tsc + jest` | green, 1069 tests | yes |
| S4-02 | 1 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) sync-client.test.ts` | 5/5; null when unset, one createClient with the options, AppState start/stop | yes |
| S4-02 | 2 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) session-storage.test.ts` | 15/15; 100-byte SecureStore only, 5000-byte encrypted into AsyncStorage, removeItem clears both, missing key null | yes |
| S4-02 | 3 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) auth-store.test.ts` | 18/18; unconfigured, signed_out, needs_username, signed_in, SIGNED_OUT, unsubscribe on unmount | yes |
| S4-02 | 4 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) root-layout.test.tsx` | 9/9; useAuthInit starts only once the DB is ready | yes |
| S4-02 | 5 | `check.sh` | green | yes |
| S4-03 | 1 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) auth-sign-in.test.tsx; grep copy in app/auth/sign-in.tsx` | 13/13; heading, body copy, '@' gating, signInWithOtp with shouldCreateUser, in-place alert error | yes |
| S4-03 | 2 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) auth-code.test.tsx; grep code.tsx for number-pad, maxLength` | 15/15; copy, auto-verify, error copy, resend 'Sent', username route vs dismiss | yes |
| S4-03 | 3 | `tests 'shows only Accounts aren't set up' in both files` | pass in both | yes |
| S4-03 | 4 | `check.sh` | green | yes |
| S4-04 | 1 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) username.test.ts` | 15/15; normalize and all four error strings as written | yes |
| S4-04 | 2 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) auth-username.test.tsx; app/_layout.tsx:66` | 24/24 incl. 23505 'That username is taken'; headerBackVisible false and gestureEnabled false | yes |
| S4-04 | 3 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) tabs-layout.test.tsx` | 6/6; redirect on needs_username, none for signed_in | yes |
| S4-04 | 4 | `check.sh` | green | yes |
| S4-05 | 1 | `npx jest --ci <the S4 suites> (157 tests, 10 suites) profile.test.tsx (S4-05 block); grep copy in profile.tsx` | all states and copy strings found in source and asserted; Units and Import radius tests still pass | yes |
| S4-05 | 2 | `profile.test 'Sign out signs out ... no Keep/Remove prompt'` | passes | yes |
| S4-05 | 3 | `profile.test delete cases; grep alert copy in profile.tsx` | alert copy exact; Delete invokes account-delete then signs out; error copy shown and no sign out | yes |
| S4-05 | 4 | `read supabase/functions/account-delete and integration 401 cases; ls _shared/cors.ts` | function and cors exist; 401 without JWT, uid from getUser only (plan records the deno check) | yes |
| S4-05 | 5 | `check.sh` | green | yes |
| S4-06 | 1 | `ls config/script; scripts/supabase-env.mjs; package.json testPathIgnorePatterns` | files exist; exit(2) with 'Start the stack first: npm run db:start'; script matches; __integration__ ignored by default jest | yes |
| S4-06 | 2 | `read src/__integration__/helpers.ts` | createRider/deleteRider; generateLink magiclink -> email_otp -> verifyOtp; types.d.ts cited | yes |
| S4-06 | 3 | `read accounts.test.ts (not run: build-only policy forbids starting containers); record says 17 passed` | cases cover distinct ids, session, signOut+new OTP, 23505, account-delete ok:true, getUserById, find_profile; live run not repeated | yes |
| S4-06 | 4 | ``docker ps -a` supabase_ count; record in what-michael-will-see` | 0 supabase_ containers left; the db:reset/test:db/integration pass is from the record, not rerun | yes |
| S4-06 | 5 | `check.sh` | green | yes |
| S4-07 | 1 | `read docs/plans/2026-10-22-s4-what-michael-will-see.md` | covers Profile three states, sign-in, code, username screens | yes |
| S4-07 | 2 | `same file lines 51-61` | What to tap, Mailpit :54324, Delete account behaviour | yes |
| S4-07 | 3 | `same file lines 64-68` | jest counts, integration 17 passed, export exit 0 5.0 MB (my own export also exit 0) | yes |
| S4-07 | 4 | `check.sh` | green | yes |
| S4-08 | 1 | `ls reviews/s4.diff (3918 lines); Review (S4-08) section of the plan` | diff exists; findings with severity, file:line, RED/GREEN commits | yes |
| S4-08 | 2 | ``git grep eyJ` and `git ls-files '.env*'`; plan answers 1-6; sync tests` | grep hits only the harness feature_list copy of the command (self-referential, noted in progress); only .env.example tracked; six answers backed by tests | yes |
| S4-08 | 3 | `git log for refactor:` | f47c502 refactor: S4 simplification pass | yes |
| S4-08 | 4 | `grep CLAUDE.md, README.md, docs/RUNNING-ON-PHONE.md` | Layout, test:integration, Accounts-optional and .env rules present; README Accounts (S4) bullet; RUNNING-ON-PHONE section | yes |
| S4-08 | 5 | `check.sh` | green | yes |

### 2026-10-23 07:40 · S4-08 · passes

- Opus review of the whole S4 diff (`reviews/s4.diff`, 3918 lines): 0 Critical, 1 Important fixed: the username screen had no way out (no back, no swipe, tabs redirect back) → ghost `Sign out` (D64 *default*). Minors fixed: signed out on a launch-redirected username screen left a stack with no tabs (→ `Back to Profile`, dismissTo/replace); JSON/parse-error/empty `signInWithOtp` messages → fixed copy. RED `f42b395` (8 fail) → GREEN `df32e18`. Left (in the plan): delete that timed out but worked gets 401 on retry, offline-expired launch shows signed out until refresh, two tiny races.
- `refactor:` `f47c502`: `signOutOfAccount` drops the dead `scope: 'local'` retry (auth-js 2.118 `_signOut` already removes the session); `ACCOUNTS_NOT_SET_UP` shared. Jest 1062 → 1069.
- Docs: CLAUDE.md (accounts layout, `test:integration`, accounts-optional and .env conventions), README `Accounts (S4)`, RUNNING-ON-PHONE "With accounts", plan `## Review` (RED-first table, findings + commits, six written answers), what-Michael-will-see + live checklist (Sign out on the username screen).
- Verified: check.sh green 1069; `npx jest --ci` 0 console.error; 3 extra full runs green (the S4-06 flake didn't recur); `npx expo export --platform ios` exit 0; `git ls-files '.env*'` = `.env.example`; the secrets grep hits only feature_list.json's own copy of the command (unavoidable).
- Next (S5) must know: a `signed_in` rider can have no username (offline launch, deep links skip onboarding).
- Question for Michael (spec §9 Q25, D64): keep the 'Sign out' on the username screen, or make picking a username the only way on?
- Proposed change: S4-08 step 2's "git grep 'eyJ' prints nothing" can never hold, since feature_list.json contains the command; exclude `.harness`.

### 2026-10-23 06:40 · S4-07 · passes

- New: `docs/plans/2026-10-22-s4-what-michael-will-see.md` (docs only): Profile unconfigured / signed out / signed in (with and without display name), sign-in, code, username (empty, `ab`, `Ana Rider!`, `ana_rides`) from a temporary from-scratch render test (deleted, not committed), every text/label/role/placeholder; "What to tap" (.env.local, Mailpit 54324, Delete account); verification record.
- Verified: `npx jest --silent` 75 suites, 1062 passed; `npm run test:integration` 17 passed (db:start, db:reset, db:stop; no supabase_* container left); `npx expo export --platform ios` exit 0, 5,021,702-byte hbc; check.sh green.
- Nothing for Michael; no proposed changes. S4 is complete: the milestone PR is the harness's.

### 2026-10-23 05:40 · S4-06 · passes

- New: `scripts/supabase-env.mjs` (status JSON → `SUPABASE_URL`/`_ANON_KEY`/`_SERVICE_ROLE_KEY` for the command only; exit 2 `Start the stack first: npm run db:start` when status fails, times out at 60 s, isn't JSON or lacks a key), `jest.integration.config.js`, `npm run test:integration`, default Jest ignores `/src/__integration__/`; `src/__integration__/helpers.ts` (`createRider` = admin `createUser` + `generateLink` `email_otp` + `verifyOtp` + username, cleans up a half-made rider) and `accounts.test.ts` (17 cases); `src/__tests__/supabase-env.test.ts` (9, fake `npx` on PATH, no Docker). Jest 1053 → 1062.
- RED 2da7ea4 (9 fail), then GREEN. Stack: `db:start` → `db:reset` → `test:db` `Files=9, Tests=569, PASS` → `test:integration` `17 passed` → `db:stop`; `test:integration` with the stack down exits 2 with the message; `docker ps` = the same 7 dj-*/n8n-* containers, no supabase_* left, no other container touched. check.sh green (1062), full `npx jest --ci` 0 console.error.
- **The local edge runtime doesn't reload an edited function** (a 418 mutant still answered `{ ok: true }`) until `docker restart supabase_edge_runtime_hit-list`; in `supabase/README.md`, the plan and the live checklist. With restarts, mutants of the function (skip `remove`, trust `body.user_id`, skip `deleteUser`, 200 without a JWT) each fail a case. The runtime does inject the three env values. The local gateway lets a request with no `Authorization` reach the function, which answers its own 401.
- Opus review: 0 Critical/Important; 5 Minor fixed (half-made rider cleanup, 404 asserted after delete, the no-JWT body checked, the test photo removed on failure, status timeout).
- One full-suite run (the first check.sh) had 2 failing tests in one suite; its output was overwritten by the next run, and 7 later full runs passed. Treat it as an existing flake; S4-08 should watch for it.
- Not covered yet: `sends/<id>/` files in account-delete (no send flow until S7; S7's integration test should add one). No new questions for Michael.

### 2026-10-23 03:40 · S4-05 · passes

- New: Profile `Account` section (`app/(tabs)/profile.tsx` `AccountSection`, keyed on `userId`): unconfigured line, signed-out copy + `Sign in` → `/auth/sign-in`, signed in `@username` / display name / email + `Sign out` / `Delete account` (alert copy per the feature, `Deleting…`, error in place); `signOutOfAccount` + `deleteAccount` in `src/sync/auth.ts`; `supabase/functions/account-delete/index.ts` (uid only from `auth.getUser(jwt)`, storage under `<uid>/` and `sends/<id>/` of sends from **or to** the rider, then `admin.deleteUser`; 200/401/405/500 JSON) + `_shared/cors.ts`; tsconfig `exclude` and eslint `ignores` `supabase/functions`. Tests 1034 → 1053.
- RED e395734 (16 fail), GREEN 4de19ca; review-fix RED (3 fail), GREEN. check.sh green, full `npx jest --ci` 0 console.error/warn; `npx expo export --platform ios` exit 0, 4.8 MB. Mutations: dropping the in-flight ref or the session-clear step each fails a test. No Deno on the box: a stand-in strict `tsc` of the function (Deno declared, `npm:` mapped to node_modules) exits 0 and catches a misspelt `deleteUserX`.
- Opus review: 1 Important fixed (offline sign out with an expired token left the session stored, auth-js 2.118 returns before `_removeSession` in either scope, so the rider came back signed in: the client now has a fixed `storageKey: 'hitlist.auth.session'` and the sign out clears it itself); Minors fixed: recipient sends' files orphaned, serial folder listing, old error after re-sign-in, a retry test that passed trivially. Left (plan): a photo uploaded mid-delete stays in Storage.
- Next session (S4-06) must know: the function is first run there; check the runtime injects `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (500 `delete failed` + log line if not). The fake's `failNext('signOut')` keeps the session (real auth-js removes it on most server errors).
- Proposed change (step 4 wording): the function deletes `sends/<id>/` of sends to the rider too, not only "their send ids".
- No new questions for Michael.

### 2026-10-23 02:45 · S4-04 · passes

- New: `src/utils/username.ts` (`normalizeUsername`, `validateUsername`, first failing rule wins), `app/auth/username.tsx` ('Pick your @username', live message once typed, `@` typed in front dropped, Display name ≤ 50 optional, `Saving…`, 23505 → 'That username is taken', 23514 → the format rule, else "Couldn't save. Try again."), `saveProfile` in `src/sync/auth.ts`, tabs `<Redirect href="/auth/username">` while `needs_username`, root Stack `auth/username` (no back, `gestureEnabled: false`), `Redirect` in the global expo-router mock. Tests 990 → 1034.
- RED 75ac073 (2 suites + 2 tests fail), GREEN; review-fix RED 7d81536 (8 fail), GREEN. check.sh green, full `npx jest --ci` 0 console.error/warn; `npx expo export --platform ios` exit 0, 5 MB hbc. Mutation: dropping the hook's stale-snapshot guard fails its test.
- Opus review: 1 Critical fixed (success `replace('/(tabs)/profile')` opened a second tabs as a sheet over Sign in → `dismissTo` when `canDismiss()`, else `replace`); 1 Important fixed (an update RLS filtered to 0 rows counted as saved → `.select('id')`, no row = failed); Minors fixed: 23514 mapped, tabs stay mounted under the Redirect, username return key goes to Display name, a stale profile fetch can't undo a saved username. Left (in the plan): only the tabs are guarded (deep links/Android back, for S6/S8 `Stack.Protected`), emoji display names get < 50.
- Live checklist gains the username phone check. Next session (S4-05): Profile reuses `AccountsNotSetUp`; the fake's `functions.invoke`/`signOut` exist with `failNext('invoke'|'signOut')`.
- Proposed change (feature step 2 wording): "replaces the route to the Profile tab" is `dismissTo('/(tabs)/profile')` from the code screen (replace only when it's the only screen); the test asserts both.
- No new questions for Michael.

### 2026-10-23 01:40 · S4-03 · passes

- New: `app/auth/sign-in.tsx` (email → `signInWithOtp` trimmed + lowercased, `Sending…`, `error.message` in place) and `app/auth/code.tsx` (digits only, six auto-verify once via an in-flight ref, `Checking…`, resend → `Sent` 3 s, `needs_username` → `replace('/auth/username')`, else `dismissAll()`); `sendSignInCode`/`verifySignInCode` in `src/sync/auth.ts`; `src/components/AuthScreen.tsx` (`AuthScreen`, `AccountsNotSetUp`, `AuthError`); root Stack registers `auth/sign-in` (modal) + `auth/code`. Tests 964 → 990.
- RED e6b9b44 (3 suites fail), GREEN aa4cc4d; review-fix RED 53f9af4 (5 fail) then GREEN. check.sh green, full `npx jest --ci` 0 console.error; `npx expo export --platform ios` exit 0, 4.8 MB hbc. Mutation checks: dropping either in-flight ref or the mounted ref fails a test.
- Opus review: 1 Important fixed (closing sign-in mid-send still pushed the code screen); Minors fixed: offline send shows fixed copy, errors announced to VoiceOver, code field stays editable after a wrong code, no `email` param → `Back to Sign in`, two tests that didn't exercise their guards.
- Next session (S4-04) must know: `/auth/username` doesn't exist yet, so a new account hits Unmatched Route until S4-04 registers it (add its Stack.Screen to `app/_layout.tsx` + root-layout test). `expo-router`'s jest mock has no `Redirect`; add it for the tabs redirect. On iOS `auth/code` shows as a second sheet over sign-in (live checklist item added); S6 should consider `dismissTo` instead of `dismissAll`.
- No new questions for Michael.

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
