# S6: what Michael will see (Friends screen, Inbox tab and badge)

Captured by rendering each screen from scratch in temporary Jest tests (fake Supabase client, friends/inbox state set
directly; the tests were deleted before the commit) and walking the tree for visible text, `accessibilityLabel`, role and
state. Reach Friends from Profile → `Friends` (or `Friends · 2` once friends load); the Inbox is its own tab.

## Friends screen (`app/friends`)

| State | Visible text | Controls (label / role) |
|---|---|---|
| Signed out | `Sign in to add friends` | `Sign in` (button, opens the sign-in sheet); nothing else |
| Unconfigured | `Accounts aren't set up in this build` | none |
| Signed in, two friends + one sent request | Field placeholder `Add by exact @username` · `Add` · hint `Friends are added by exact username or by an invite link. There's no search by name.` · header `Friends` · `@ana · Ana B` · `@ben` · header `Requests sent` · `@cal` | `Add` (button); friend rows (button; long press / tap opens Remove friend / Block @name / Cancel); `Cancel request to @cal` (button, text `Cancel`) |

A `Blocked` section (rows with an `Unblock` button, label `Unblock @name`) appears only when you blocked someone.
A sent request whose name this phone never saw reads `A rider you asked` (D73).

### The Add field's result lines (one line under the hint)

| Server answer | Line |
|---|---|
| sent | `Request sent to @dee` |
| accepted (they had asked you) | `You're now friends with @dee` |
| already_friends | `Already friends with @dee` |
| already_sent | `Request already sent to @dee` |
| self | `That's you` |
| blocked_by_me | `You blocked @dee. Unblock them below to add them.` |
| not found (or they blocked you, D50) | `No rider named @dee` |

Block alert: title `Block @name?`, message `They won't be told. They can't send to you or invite you.`, buttons Cancel / Block.

## Inbox tab

| State | Visible text | Controls |
|---|---|---|
| Signed out | `Sign in to get spots from friends` | `Sign in` (button) |
| Empty | `Nothing here yet` · `Spots friends send you, hit list invitations and friend requests show up here.` | none |
| Two requests | header `Friend requests` · `@ana wants to be friends` · `Ana B` · `@ben wants to be friends` | per row `Accept` / `Decline` (labels `Accept friend request from @ana`, `Decline friend request from @ana`, same for @ben); the row itself is a button (long press: Block) |

## Tab bar with two unseen requests

Spots · Lists · **Inbox (badge `2`)** · Profile. The badge is absent with nothing unseen and before the seen mark loads;
it clears once the Inbox has been open and the app active.

## What to tap (phone, two riders)

Setup as in `docs/plans/2026-10-22-live-checklist.md` (S4/S6 sections): `npm run db:start`, `npm run db:reset`,
`.env.local` with the box's URL/anon key, `npm run start:tailscale`, Expo Go. Codes arrive in Mailpit
(`http://100.88.90.97:54324`). Use two emails; switch riders with Profile → Sign out → Sign in.

1. Rider A: sign in, pick `@ana_test`. Sign out (Keep spots). Rider B: sign in with a second email, pick `@ben_test`.
2. As B: Profile → `Friends`. Type `ana_test` (any case) → `Add`. Expect `Request sent to @ana_test`; `@ana_test` under `Requests sent`.
3. Sign out, sign in as A. The Inbox tab shows badge `1`. Open Inbox: `@ben_test wants to be friends`. Badge clears. Tap `Accept`; the row leaves.
4. A: Profile → `Friends · 1` lists `@ben_test`. Sign in as B: `@ana_test` is under Friends too.
5. As A: Friends → long press `@ben_test` → `Block @ben_test` → `Block`. The friend row disappears; `Blocked` shows `@ben_test` with `Unblock`.
6. Sign in as B: type `ana_test` in Add → `No rider named @ana_test` (the name vanished from find).
7. Undo: as A, `Unblock`; `npm run db:stop`; delete `.env.local`.

## Verification record (2026-10-23)

- `npx jest --silent`: 91 suites, **1487 tests passed**; a non-silent run has **0** `console.error` lines.
- `npm run test:integration` (db:start, db:reset first): 3 suites, **35 passed** (accounts 17, sync 12, friends 6); stack stopped after (`db:stop`, 0 `supabase_*` containers).
- `npx expo export --platform ios --output-dir /tmp/hl-export`: **exit 0**, entry bundle 5,202,562 bytes (5.2 MB hbc).
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green (check.sh).
