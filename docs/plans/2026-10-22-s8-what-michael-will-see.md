# S8: what Michael will see (Share sheet, list screen and member strip, Members screen, Lists tab, Add to hit list, a rider's spot, Inbox invitations)

Captured by rendering each screen from scratch in temporary Jest tests (fake Supabase client, stores set directly; the
tests were deleted before the commit, `git status` clean) and walking the tree for visible text, `accessibilityLabel`,
role and state. The full live path (two riders, local stack) is `docs/plans/2026-10-22-live-checklist.md` § S8.

Words: **Share** and **Invite** are live access (D34); **Send** is a one-time copy. The Share sheet never says Send.

## Share sheet (`ShareListSheet`, from a private list's `Share list` row)

Title `Share Downtown` (a header), `Cancel` (button) next to it.

| State | Visible text | Controls (label / role / state) |
|---|---|---|
| Unconfigured | `Accounts aren't set up in this build` | `Cancel` only |
| Signed out | `Sign in to share hit lists` | `Sign in` (button; closes the sheet, opens `/auth/sign-in`), `Cancel` |
| Signed in, no friends | `Friends` · `Add a friend first` · the D34 sentence · `12 spots will become visible to them` | `Find friends` (link to Friends); no Share button, no role tabs |
| Two friends, nobody ticked | `Friends` · `@ana` `Ana B` · `@ben` · `Can add spots` / `View only` · the D34 sentence · `12 spots will become visible to them` | checkboxes `@ana`, `@ben` (unchecked); tabs `Can add spots` (selected) / `View only`; `Share` (button, **disabled**) |
| …after ticking `@ana` | same | `@ana` checked; `Share` enabled |

The D34 sentence, verbatim: `Everyone here sees every spot in Downtown — including spots added later — until you remove them or stop sharing.`

The count line reads `One spot will become visible to them` for one spot and is absent for an empty list. An area list
adds `They'll see your spots inside this area, now and later`.
After sharing: toast `Shared Downtown with @ana` (`… with 2 friends` for more). Failures: `Couldn't share. Try again.`;
a list not backed up yet `This list isn't backed up yet. Try again when you're online.`; friends that won't load
`Couldn't load your friends.`. The button reads `Sharing…` while it runs and the sheet can't be closed then.

### Invite mode (`Invite`, on a list already shared)

Same sheet, title `Invite to Downtown`, button `Invite` (`Inviting…`), **no count line**. A friend already in the list is
not a checkbox: a plain row `@ben` + tag `Invited` (label `@ben, Invited`) or `In the list` (joined). Toast
`Invited @ana` (`Invited 2 friends`).

## List screen (`app/list/[id]`)

| State | Visible text | Controls |
|---|---|---|
| Private list of mine (12 spots) | two rows side by side above the search: `Send these spots` + `one-time copy of 12 spots`, and `Share list` + `live: they'll see new spots too` (two-people icon); then List \| Map, search, sort, the spots; `Delete list` at the bottom | `Send these spots, one-time copy of 12 spots` (button), `Share list, live: they'll see new spots too` (button, opens the Share sheet); no member strip; header title `Downtown` with Rename |
| Shared list of mine (ana, ben, dee joined, cal invited) | member strip on top: circles `M` `A` `B` `D` and the count `4` (D84: joined members plus me; the invited `C` is not counted or drawn), a `+ Invite` button; the row now reads `Invite` + `live: they'll see new spots too`, no `Share list` | strip = `4 in this list. Show members` (button, opens Members); `+ Invite` (button, invite mode); `Invite, live: they'll see new spots too` (button, invite mode); `Send these spots, one-time copy of N spots` |
| Shared list of ana's that I joined | strip `A` `M` `B` and `3`; `Send these spots` + `one-time copy of 1 spot` (only my own spots count, D87); her spot row reads `Her ledge` + `A friend` (label `Her ledge, A friend`) while her name isn't mirrored yet, `@ana` when it is | `3 in this list. Show members`; **no** `+ Invite`, no `Share list`, no `Delete list`, no Rename; long press `Remove from list` only on my own spot (not for a view-only member) |

The strip shows at most five circles and `+2` for the rest. Deleting a shared list asks `Delete Downtown?` /
`Spots stay in your library. Members lose access to all 12 spots now.`

## Members screen (`app/list/[id]/members`, header title `Members`)

| State | Visible text | Controls |
|---|---|---|
| Signed out | `Sign in to see who's in this list` | `Sign in` |
| Owner of Downtown | `@me (owner)` · `@ben · Can add spots` · `@dee · View only` · `@cal · View only` + tag `Invited` | member rows are buttons (label `@ben · Can add spots`; the invited one `@cal · View only, Invited`); `Invite` (button, opens invite mode); `Stop sharing` (button) |
| Member of ana's list | `@ana (owner)` · `@me · Can add spots` · `@ben · Can add spots` · `Invited rider` + tag `Invited` (an invitee whose name this phone can't read) | plain rows, no role menus; `Leave list` (button); no Invite, no Stop sharing |
| List gone | `This list is gone` · `It may have been deleted.` | none |

Alerts (title / message / buttons; a `destructive` style on the last unless noted):

- Tap a joined member: `@ben` / no message / `Can add spots`, `View only`, `Remove from list` (destructive), `Cancel`.
- Tap an invited member: `@cal` / no message / `Withdraw invitation` (destructive), `Cancel`.
- Remove from list: `Remove @ben?` / `Their 5 spots in Downtown will leave it too.` (no message when they have none in it) / `Cancel`, `Remove` (destructive).
- Stop sharing: `Stop sharing Downtown?` / `Members lose access to all 12 spots now.` / `Cancel`, `Stop sharing` (destructive). Then toast `Stopped sharing Downtown` and back.
- Leave list: `Leave Downtown?` / `Your 5 spots in Downtown will leave it too.` (no message when none are mine) / `Cancel`, `Leave` (destructive). Then toast `Left Downtown`, the list screen closes and the Lists tab opens.
- A refused change (42501) alerts the server's line; any other failure alerts a short `Couldn't …` line and stays.

## Lists tab (`app/(tabs)/lists.tsx`)

Buttons `New hit list` and `New area list` on top, then two sections:

| Section | Rows |
|---|---|
| `My hit lists` (header) | `Bridges` + `0 spots` (private, label `Bridges, 0 spots`); `Downtown` + `0 spots` with the two-people badge and `3` (label `Downtown, 0 spots, Shared with 3`; ana and ben joined, cal invited is not counted) |
| `Shared with me` (header) | an invitation: `Downtown` + `@ana invited you · 12 spots` (label `Downtown, @ana invited you · 12 spots`) with `Join` (button, `Join Downtown`); a joined list: `Waterfront` + `@ana · 12 spots`, badge `4` (label `Waterfront, @ana · 12 spots, Shared with 4`, opens `/list/<id>`) |

An owner this phone can't name reads `A friend · 2 spots`. An invitation alone still shows the section (no empty state).
`Join` calls the server then a sync; toast `Joined Downtown`, the row leaves. A withdrawn invitation toasts
`This invitation was withdrawn.`

## Add to hit list (`AddToListSheet`, with a spot picked)

Header `Add to hit list`, `Done` (button), then one checkbox row per live list in name order, and `+ New hit list`.

| Row | Label / state | Visible |
|---|---|---|
| `Bridges` (private) | `Bridges`, unchecked | name |
| `Capitol Hill` (my area list) | `Capitol Hill`, **disabled**, hint `Area list: spots inside its circle are in it automatically` | name + that sentence |
| `Downtown` (mine, shared, 4) | `Downtown, Shared with 4`, enabled | name + badge `4` |
| `Rooftops` (ana's, I joined with View only) | `Rooftops, Shared with 3`, **disabled**, hint `View only` | name + `View only` + badge `3` |
| `Waterfront` (ana's, I may add) | `Waterfront, Shared with 2`, enabled | name + badge `2` |
| `Weekend` (ana's area list) | `Weekend, Shared with 2`, **disabled**, area hint | name + area sentence + badge `2` |

### The first add to a shared list

Tapping an enabled shared row the first time on this phone alerts: title `Everyone in Downtown (4) will see this
spot.` (`… will see these 3 spots.` for three), no message, buttons `Cancel` (cancel) and `Add`. `Add` adds and remembers
the answer for that list; the next add asks nothing. Cancel and a failed add leave it unasked.

## Another rider's spot (`app/spot/[id]`)

Rendered for ana's `Courthouse ledge` (Ledge, Skate stopped, speed Some, notes `low`) in the shared list `Crew`:

| | Another rider's spot | The rider's own spot |
|---|---|---|
| Under the title | `@ana's spot` (`A friend's spot` while her name isn't mirrored) | nothing |
| Header buttons | **none** (no Edit, no `Send this spot`) | `Send this spot`, `Edit` |
| Photos area | her photos only; with none, no `Add photos` tile | `Add photos` tile when it has none |
| `In lists` | read-only text naming the lists that hold it (`Crew`); no chips, no `+ Add to hit list` | chip row + `+ Add to hit list` |
| Tags, speed bar, notes | same, read-only | same |
| Bottom | `Save a copy` (button) | none |

`Save a copy` alerts `Save a copy of this spot?` / `It becomes your own private spot.` / `Cancel`, `Save`; then it opens
the copy in place and toasts `Saved a copy` (`Saved a copy · 1 photo couldn't be copied`; a failure `Couldn't save a copy`).

## Inbox invitations (`app/(tabs)/inbox.tsx`)

| State | Visible text | Controls |
|---|---|---|
| Empty | `Nothing here yet` · `Spots friends send you, hit list invitations and friend requests show up here.` | none |
| A friend request and three invitations | header `Friend requests` first (`@ben wants to be friends`, `Accept` / `Decline`), then header `Invitations`: `@ana invited you to Downtown (12 spots)` · `@ana invited you to Bridges (1 spot)` · `@ana invited you to Ledges (no spots yet)` | per row `Join Downtown` (`Join`) and `Decline the invitation to Downtown` (`Decline`); the row has hint `Long press to block` |
| After Join | line `Joined Downtown` at the top (announced), the row gone; `Open Downtown` (`Open`, to `/list/<id>`) appears once the list is on the phone | |

Alerts: Decline asks `Decline the invitation to Downtown?` / no message / `Cancel`, `Decline` (destructive). Long press
on the row offers `@ana` / `Block @ana` (destructive), `Cancel`, then `Block @ana?` / `They won't be told. They can't send to you or invite you.` / `Cancel`, `Block` (destructive); a block also reloads invitations and friends. While answering, the buttons read `Answering`, never `Sending`.
An invitation withdrawn meanwhile reads `This invitation was withdrawn.`.

## What to tap (phone, two riders)

Setup as in the live checklist (S4/S6/S7/S8 sections): `npm run db:start`, `npm run db:reset`, `.env.local` with the
box's URL/anon key, `npm run start:tailscale`, Expo Go, Mailpit at `http://100.88.90.97:54324` for codes. Riders A
(`@ana_test`) and B (`@ben_test`) already friends (see the S6 plan). Switch riders with Profile → Sign out → Keep spots
→ Sign in. Wait for 'Backed up' on Profile before sharing (a list not backed up yet refuses). To see the other side's
change pull to refresh on the Spots tab (the Inbox tab refreshes itself when focused); a sync also runs on sign-in, when
the app comes to the foreground and every 5 minutes.

1. **Share (A):** Lists → a hit list with some spots → `Share list` → read the sentence and count → tick `@ben_test`
   → keep `Can add spots` → `Share`. Expect toast `Shared <name> with @ben_test`; the list now shows the strip with `2`
   and `+ Invite`; the Lists tab row has the two-people badge `2`.
2. **Join (B):** sign in as B → Inbox badge → `@ana_test invited you to <name> (N spots)` → `Join`. Expect `Joined <name>`
   then `Open`. Lists → `Shared with me` → `@ana_test · N spots`; open it: A's spots, photos load as you scroll, no
   Edit/Send on a spot, `Save a copy` at the bottom.
3. **B adds a spot:** Spots tab → a spot of B's → `+ Add to hit list` → `<name>, Shared with 2` → the alert `Everyone in
   <name> (2) will see this spot.` → `Add`. Wait for 'Backed up'. A pulls: the spot is in A's list, read-only, `@ben_test's spot`.
4. **A adds a spot:** same on A's side (A's first add also asks the alert). B pulls: A's new spot appears in B's list.
5. **Roles (A):** list → strip → Members → `@ben_test · Can add spots` → `View only`. B pulls: in `Add to hit
   list` the row reads `View only` and is disabled; long press on B's own spot in the list offers no `Remove from list`.
   Switch back to `Can add spots` and B can add again.
6. **Invite more (A):** `+ Invite` → the sheet is `Invite to <name>` with `@ben_test` marked `In the list`.
7. **Leave (B):** list → strip → Members → `Leave list` → `Leave <name>?` / `Your N spots in <name> will leave it too.` →
   `Leave`. Toast `Left <name>`; the Lists tab no longer shows it, A's spots are gone from B's Spots tab, B's own
   spots stay in B's library but leave A's list after A pulls.
8. **Stop sharing (A):** Members → `Stop sharing` → `Stop sharing <name>?` / `Members lose access to all N spots now.` →
   `Stop sharing`. Toast `Stopped sharing <name>`. The list is private again (`Share list` row, no strip, no badge).
9. **Decline and Block (B):** have A share again; as B, `Decline` an invitation and confirm; share once more and long
   press the row → `Block @ana_test` → confirm.
10. **Undo:** delete the test lists and spots; `npm run db:stop`; delete `.env.local`.

## Verification record (2026-10-23)

- `npx jest --ci`: 103 suites, **1924 tests passed**; the full output has **0** `console.error` lines.
- `npm run test:integration` (`db:start`, `db:reset` first): 5 suites, **54 passed**, 0 console lines (run in S8-07, commit cc3c93b; no code under test changed since, this session only adds a doc); stack stopped after (`db:stop`).
- `npx expo export --platform ios --output-dir /tmp/hl-export`: **exit 0**, entry bundle 5,429,837 bytes (5.4 MB hbc).
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green (check.sh).
