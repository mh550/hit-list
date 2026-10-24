# S7: what Michael will see (Send sheet, Inbox sends and Pick spots, Sent screen, a saved copy)

Captured by rendering each screen from scratch in temporary Jest tests (fake Supabase client, stores set directly; the
tests were deleted before the commit, `git status` clean) and walking the tree for visible text, `accessibilityLabel`,
role and state. The full live path (two riders, local stack) is `docs/plans/2026-10-22-live-checklist.md` § S7.

## Send sheet (`SendSheet`, from the paper-plane, the select bar, a list's row or the area picker)

The title reads `Send this spot` for one spot and `Send N spots` for more; a `Cancel` button sits next to it.

| State | Visible text | Controls (label / role / state) |
|---|---|---|
| Signed out | `Sign in to send spots to friends` | `Sign in` (button; closes the sheet and opens `/auth/sign-in`), `Cancel` |
| Unconfigured | `Accounts aren't set up in this build` | `Cancel` only |
| Signed in, no friends (1 spot) | `1 spot` · header `Friends` · `Add a friend first` · `Find friends` · `They get a copy of this spot as it is now. Changes you make later won't reach them.` | `Find friends` (link to Friends), no Send button |
| Two friends, three spots | `3 spots` · `Friends` · `@ana` `Ana B` · `@ben` · `They get a copy of these 3 spots as they are now. Changes you make later won't reach them.` | checkboxes `@ana`, `@ben` (unchecked); `Send` (button, **disabled**) |
| …after ticking `@ana` | same | `@ana` checked; `Send` enabled |
| Two friends, one spot | same with `1 spot` and `They get a copy of this spot as it is now. Changes you make later won't reach them.` | `Send` disabled until someone is ticked |

The sentence is the exact D34 wording, and the sheet never uses the word Share (a test reads the source file).
After a send: toast `Sent to @ana`; a failure reads `Couldn't send. Try again.`; spots not yet backed up read
`Some of these spots aren't backed up yet. Try again when you're online.`

## Inbox with one send (`app/(tabs)/inbox.tsx`)

| State | Visible text | Controls |
|---|---|---|
| One send from @ana (3 spots) | header `Spots sent to you` · `@ana sent you 3 spots` · `Pier 57 · Capitol Hill` (the first spot, with its photo as a thumbnail) | `Save all spots from @ana` (`Save all`), `Save the spots from @ana into a new hit list` (`Save into a new hit list`), `Pick spots from @ana` (`Pick spots`), `Dismiss the spots from @ana` (`Dismiss`) |
| A send and a friend request | `Friend requests` section first (`@ana wants to be friends`, `Accept` / `Decline`), then `Spots sent to you` as above | all of the above |

### Pick spots sheet (opened by `Pick spots`)

Header `Pick spots`, `Cancel`, then one checkbox per frozen spot, **all checked**, labelled `Pier 57, Capitol Hill` ·
`Untitled, Fremont` (a nameless spot reads Untitled) · `Red ledge`, and `Save (3)`. Unticking `Untitled, Fremont`
changes the button to `Save (2)`; pressing it saves spots 1 and 3.

## Sent screen (Profile → `Sent`)

| State | Visible text | Controls |
|---|---|---|
| Signed out | `Sign in to see what you sent` | `Sign in` |
| Nothing sent | `Nothing sent yet` | none |
| Three statuses | `To @ben · 3 spots · Waiting` · `To @ana · 1 spot · Saved` + `Saved copies are theirs` · `To @cal · 2 spots · Withdrawn` | `Withdraw the spots sent to @ben` (`Withdraw`) on the Waiting row only; confirm alert "They won't get these spots." |

A friend whose name this phone can't read shows as `To a rider`. A failed first load reads
`Couldn't reach the server. Pull to try again.`

## A saved copy's detail

Under the title, a `From @ana` line. Same screen as any owned spot otherwise: photo area (`Add photos` tile when it has
none), `In lists` + `+ Add to hit list`, `Notes` / `low`. A spot of the rider's own has no such line (rendered
alongside for contrast). The copy is the rider's own: Edit and Send are there (S7-05).

## What to tap (phone, two riders)

Setup as in the live checklist (S4/S6/S7 sections): `npm run db:start`, `npm run db:reset`, `.env.local` with the
box's URL/anon key, `npm run start:tailscale`, Expo Go, Mailpit at `http://100.88.90.97:54324` for codes. Riders A
(`@ana_test`) and B (`@ben_test`) already friends (see the S6 plan). Switch riders with Profile → Sign out → Keep spots
→ Sign in. Wait for 'Backed up' on Profile before sending (spots not yet backed up refuse to send).

1. **One spot from its page (A):** open a spot with a photo → paper-plane top right → `Send this spot`; read the
   sentence; tick `@ben_test` → `Send`. Expect the toast `Sent to @ben_test`.
2. **Three from multi-select (A):** Spots tab → `Select` → tick three spots → `Send (3)` → `Send 3 spots` → tick
   `@ben_test` → `Send`.
3. **A list's spots (A):** Lists → a hit list → `Send these spots` → `@ben_test` → `Send`.
4. **The copy is frozen (A, then B):** as A, rename the spot you sent in step 1 and wait for 'Backed up'. Sign in as B:
   Inbox badge; the row still shows the **original** name; `Save all`. Expect `Saved N spots`, the spots on B's Spots
   tab with `From @ana_test` on detail and their photos. A's rename never reaches B.
5. **Pick and new list (B):** on the list send, `Pick spots`, untick one, `Save (2)`; on another send `Save into a new
   hit list`.
6. **Withdraw before saving (A, then B):** as A send one more spot to B; Profile → `Sent` → `To @ben_test · 1 spot ·
   Waiting` → `Withdraw` → confirm. Row reads `Withdrawn`. Sign in as B: it is gone from the Inbox. Earlier saved sends
   read `Saved` with `Saved copies are theirs` and no Withdraw.
7. **Undo:** delete B's copies like any spot; `npm run db:stop`; delete `.env.local`.

## Verification record (2026-10-23)

- `npx jest --ci`: 97 suites, **1676 tests passed**; the full output has **0** `console.error` lines.
- `npm run test:integration` (`db:start`, `db:reset` first): 4 suites, **44 passed** (accounts, sync, friends, send); stack stopped after (`db:stop`, 0 `supabase_*` containers).
- `npx expo export --platform ios --output-dir /tmp/hl-export-7809`: **exit 0**, entry bundle 5,289,652 bytes (5.3 MB hbc).
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green (check.sh).
