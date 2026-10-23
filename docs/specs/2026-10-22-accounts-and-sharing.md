# HitList — accounts, hit lists and sharing (2026-10-22), rev 1

Written from Michael's 2026-10-22 note (condensed below) on top of the simplified app (`main` at `5c7404e`, schema v3,
656 tests). It picks up `docs/specs/2026-10-16-simplification-design.md` §7 ("Direction, not scope"), which already
separated lists from sharing; where this document and §7 differ, this one wins. **D33+** continue the numbering after
D32. A decision marked *default* is the writer's call, not Michael's: the run builds it and Michael can overrule it in
§9. The harness run plans from this document (superpowers:writing-plans per milestone) and does not re-open §1–§2; it
brings anything new to §9 as `D<n> *default*` and keeps going.

---

## 0. Why

Michael, condensed: *"Make the app multi-tenant. Each user logs in and tracks their spots, all private by default.
They can add friends. They can share individual spots, groups of spots (a folder they made), or spots by area (like
Facebook Marketplace's location + distance selector). Sharing goes either directly to a user of the app, or as a link
sent to a friend; not sure whether the link should show the spot without a login or ask them to make an account. They
can create a folder, or turn an existing one, into a shared folder, where everyone with access sees all current and
future spots in it. Find a better word than 'folder'. The sharing mechanism must be very clear in the UX: it must make
sense whether they're sharing a one-time set or a shared folder. There's more to this than this list. Globally shared
(public) spots are off the radar for now."*

### Goals
1. A signed-in rider's spots, photos and lists live in their account and survive a new phone; nobody else can read
   them unless the rider shares them (enforced by the database, not by the app).
2. The app still works fully **signed out and offline**, exactly as today (APP_SPECIFICATIONS "No account required for
   local use"). Signing in later adopts everything already on the phone.
3. Riders can group spots into **hit lists** (D33), by hand or by area.
4. Two ways to share, and the rider always knows which one they're using (§1):
   **Send** = a one-time copy; **Share a hit list** = live access to everything in it, now and later.
5. Sharing reaches friends in the app directly, or anyone by link.

### Non-goals (this run)
- Public / global spots, discovery, a feed, following strangers.
- Comments, likes, other people adding photos to your spot, co-editing a spot's tags (fork with "Save a copy" instead).
- Push notifications (needs a dev build; the Inbox badge is enough for now), realtime subscriptions.
- Crews as their own object (a shared hit list's members are the crew for now; §9 Q9).
- Apple / Google sign-in (email code first, D36), App Store submission, a production deploy of anything.
- Video, offline map tiles, sports tag (§7.1 of the 10-16 spec).

### Anti-goals (would make this a failure even if it "works")
- One "Share" button that sometimes copies and sometimes grants live access depending on a toggle buried below it.
- A spot leaking to someone the owner didn't share it with, because the check lived only in the app.
- Signing in, signing out or a failed sync losing a spot or a photo that was on the phone.
- An app that stops working, or nags, for someone who never makes an account.
- A link that keeps working after the sender revoked it, or that reveals more than the sender saw on the Send screen.

---

## 1. The model in one screen (vocabulary and the two verbs)

| Word in the UI | What it is | Live? |
|---|---|---|
| **Spot** | unchanged: one rideable thing at one place | — |
| **Hit list** | a named group of spots the rider made (D33). Many-to-many: a spot can be in any number. | — |
| **Area list** | a hit list defined by a circle on the map ("within 2 mi of Capitol Hill"): it holds the owner's spots inside the circle, including ones saved there later (D41) | the rule is |
| **Send** | a **one-time copy** of one spot or a set of spots, to friends in the app or as a link. The recipient gets what the spots looked like *when sent*; later edits don't reach them; they keep what they saved. | **no** |
| **Share** (a hit list) | **live access**: the people in it see every spot in the list now and every spot added later, until they leave or the owner removes them or stops sharing. | **yes** |
| **Friends** | people you've connected with (request → accept); the people you can Send to or add to a list directly | — |
| **Inbox** | spots sent to you, invitations to shared lists, friend requests | — |

**Rules that make the two verbs unmistakable (D34):**
- The words are never mixed. "Send" (paper-plane icon) appears only for copies; "Share" / "Shared" / "Invite"
  (two-people icon) only for live lists. No screen offers a "Share" button that ends in a copy, or vice versa.
- Every Send screen says, under the recipients: *"They get a copy of these N spots as they are now. Changes you make
  later won't reach them."*
- Every Share screen says: *"Everyone here sees every spot in <list> — including spots added later — until you remove
  them or stop sharing."*
- A shared list carries the two-people icon and its member count everywhere it appears (Lists tab, list picker, the
  spot detail's "In lists" row, the Add-to-list sheet).
- **Adding a spot to a shared list** shows a one-line confirmation the first time per list: *"Everyone in <list> (4)
  will see this spot."* (Cancel / Add). Making a private list shared lists how many spots become visible.
- From a hit list's screen the two actions sit side by side, with their consequence in the button's subtitle:
  **Send these spots** · *one-time copy of 12 spots* and **Share list** · *live: they'll see new spots too*.

**Ownership:** every spot has exactly one owner (its creator). Only the owner edits or deletes it. Others who can see
it can **Save a copy** (it becomes their own private spot, with "From @name" on detail).

---

## 2. Decisions

| # | Decision | Built as | Source |
|---|---|---|---|
| D33 | **"Hit list" is the word for a user-made group** *default* | UI: "Hit lists", "New hit list", "Add to hit list"; short form "list" where space is tight. Code: `HitList`, table `hit_lists`. The List \| Map toggle keeps its name. | Michael asked for a less formal word than folder; "hit list" is what a street rider calls the spots they mean to hit, and it's the app's name (§9 Q1 has alternatives) |
| D34 | **Two verbs, never mixed: Send (copy) and Share (live)** | §1's rules, enforced by copy in tests (screen text assertions) | Michael: "very clear in the UX" |
| D35 | **Backend: Supabase** (Postgres + PostGIS, Auth, Storage, Edge Functions), as APP_SPECIFICATIONS' stack table already says. Built and tested against the **local** Supabase stack in Docker (`npx supabase`, pinned devDependency); no cloud project this run. | §3 | APP_SPECIFICATIONS "Technical Considerations"; local-only is the build-only policy |
| D36 | **Sign-in is an emailed 6-digit code** (Supabase email OTP) *default* | No password, no deep link (works in Expo Go). Apple sign-in later, with the dev build. | Expo Go can't receive universal links; Apple sign-in's token audience is Expo Go's own bundle id there (§9 Q2) |
| D37 | **Accounts are optional; signed out = today's app** | Profile shows "Sign in to back up and share". Nothing else changes for a signed-out rider; Send/Share/Friends say "Sign in to …". | APP_SPECIFICATIONS "No account required for local use" |
| D38 | **First sign-in adopts the phone's spots** | Every local spot, photo and hit list gets the account as owner and uploads. Signing out keeps a local copy and asks "Keep spots on this phone?" (Keep / Remove from this phone); a different account signing in on that phone never sees the previous account's spots. | *default*: never lose data, never mix accounts (§9 Q3) |
| D39 | **Usernames** | `@username`: 3–20 chars, `a–z 0–9 _ .`, unique, case-insensitive, chosen after first sign-in; plus a display name. Friends are added by **exact** username or by an invite link/QR; no fuzzy search (no enumerating riders). | *default* (§9 Q4) |
| D40 | **Send is a frozen copy** | A send stores the spots' fields as they were and copies their photos server-side, so the sender editing or deleting later changes nothing for the recipient. The recipient's Inbox shows it until they **Save** (each spot becomes their own private spot, "From @name") or **Dismiss**. The sender can **withdraw** a send until it is saved; after that it's the recipient's copy (the UI says so). Notes are included (§9 Q5). | 10-16 §7.3 ("a snapshot already sent is the recipient's copy and cannot be revoked") |
| D41 | **Area: one picker, two uses** | The Marketplace-style picker (§5.3) selects spots by centre + radius (+ the existing filters). Its result can be **Sent** (a one-time copy of those spots) or **saved as a hit list**: *Just these N spots* (a normal list) or *Keep it updated* (an **area list**: the owner's spots inside the circle, now and later). An area list can be shared like any list. Members can't add spots to an area list. | Michael's "groups of spots by geographic location"; 10-16 §7.3 "store the scope as a rule" |
| D42 | **Shared-list roles** *default* | Owner; members **Can add spots** (default) or **View only**. Anyone who can add removes only spots they added; the owner removes any spot from the list (never deletes the spot). Only the owner renames, invites, removes members, changes roles, stops sharing or deletes the list. | (§9 Q6) |
| D43 | **A member's spots stay theirs** *default* | Spots a member added to a shared list are still owned by that member. If they leave (or are removed), their spots leave the list with them; the Leave dialog says "Your 5 spots in <list> will leave it too". The owner stopping sharing removes members' spots from the list the same way. Anyone can **Save a copy** first. | Ownership stays simple, nothing is silently given away (§9 Q7) |
| D44 | **Links** *default* | **Send link** (copy): opens a read-only web preview **with no login** (name, town, tags, notes, photos, a map pin) plus "Get HitList" / "Save to my spots" (sign-in needed to save). The link expires after **30 days** by default (1 day / 7 days / 30 days / never) and the sender can revoke it from Sent. **Invite link** (shared list): **requires an account** to see anything; single-use, expires in 7 days; the owner can revoke it. | Michael was unsure; a friend you text a spot to shouldn't need an account to look at one spot, but live access to a list is membership and needs one (§9 Q8) |
| D45 | **Link tokens are secrets** | 128-bit random, only their SHA-256 stored; the preview is served by an Edge Function that returns JSON with short-lived (10 min) signed photo URLs; the page itself is a static file (§3.6) | Supabase Edge Functions rewrite `text/html` GET responses to `text/plain`, so the page can't be served from one |
| D46 | **Photos lose their EXIF on upload** | Re-encode through `expo-image-manipulator` before upload (JPEG 0.85, long edge ≤ 2048 px); the local original is untouched. The spot's location is shared deliberately; the phone model, timestamps to the second and any GPS on photos taken elsewhere are not. | *default*: privacy |
| D47 | **Others' spots are read-only on this phone** | Spots from shared lists sync into the local DB with their `owner_id`; detail shows "@owner's spot" and a Save-a-copy button instead of Edit; map pins and list rows carry a small owner badge. "My spots" stays the default view of the Spots tab. | *default* |
| D48 | **Sync is pull-on-open + outbox** | Changes queue locally (outbox) and push when signed in and online; pull on launch, on foreground, on pull-to-refresh and every 5 min while open. No realtime. Conflicts: last write wins per row by the client's `updated_at`; a spot's media merge as a set. | APP_SPECIFICATIONS "Sync Strategy"; *default* on the triggers |
| D49 | **Tabs: Spots · Lists · Inbox · Profile** *default* | Lists: my hit lists, shared with me, + New, + Area list. Inbox: badge = unseen items. Profile: account, Friends, settings. Signed out, Lists works (local lists) and Inbox shows "Sign in to get spots from friends". | (§9 Q10) |
| D50 | **Blocking** | Blocking someone removes the friendship, hides their pending sends/invites, and stops them sending to you or inviting you; they aren't told. Shared lists you're both in stay as they are (§9 Q11). | Minimum safety for a social feature |
| D51 | **Account deletion** | Profile → Delete account: deletes the account's spots, photos, lists, sends and links on the server (sends already saved by others stay theirs), signs out, and asks Keep / Remove on this phone (D38). | App Store requires in-app deletion once accounts exist |
| D52 | **One set of filters, search, sort and List \| Map for every view** *default* | The Spots tab, each hit list's screen and the list picker read and write the same `useSpotsStore` fields; only the set of spots differs. A filter set on a list is still on back on the Spots tab (the Filter count shows it). | S1 plan (`docs/plans/2026-10-22-s1-hit-lists.md`): simplest, no per-list state (§9 Q13) |
| D53 | **An area list ignores spots with no location** *default* | Spots stored at `NO_LOCATION` (0, 0) are never inside any circle; the area picker's count leaves them out | S2 plan (`docs/plans/2026-10-22-s2-area.md`): they have no place to be in (§9 Q14) |
| D54 | **An area's place name is the rider's search text or 'my location'** *default* | 'Area · 2 mi of Capitol Hill' uses the trimmed search text as typed, or 'my location' after "Use my location"; no reverse geocoding; dragging the centre more than a quarter of the radius away drops the place ('Area · 2 mi'); an edit measures that from the saved centre, so small drags over several edits can carry the name further (accepted, S2 review) | S2 plan: simplest, no extra network call (§9 Q15) |
| D55 | **The area picker uses the shared filters (D52)** *default* | 'Keep it updated' saves the current filters as the area list's `area_filters`; 'Edit area' loads them into the shared filters while the picker is open and puts the rider's own filters back when it closes (Save or Cancel, S2 review); the Spots tab's text search is never applied in the picker or saved | S2 plan: one filter set, as D52 (§9 Q16) |
| D56 | **Area radius: default 2 mi / 2 km; a saved radius is never resized** *default* | Stored in whole metres, one of the chip steps of the unit it was picked in; after a units switch the label converts it ('Area · 3.2 km') and no chip is selected until one is tapped | S2 plan (§9 Q17) |
| D57 | **A shared-list invitation is a member row with `status = 'invited'`** *default* | `hit_list_members.status` is `'invited'` \| `'member'`; Join flips it to `'member'` (sets `joined_at`), Decline deletes it. An invitee sees the list's name and owner only; only `'member'` reads its spots. | S3 plan (`docs/plans/2026-10-22-s3-backend.md`): §3.5's Join / Decline needs an invited state that §3.2 didn't have (§9 Q18) |
| D58 | **A display name is at most 50 characters** *default* | A `profiles` check constraint; usernames stay 3–20 (D39). Removing a friend also withdraws pending list invitations between the two (an invitation needs a friendship). | S3-05 Opus review: an unbounded display name is downloaded by every friend, co-member and `find_profile` caller (§9 Q19) |
| D59 | **Blocking hides the blocked rider's sends to you; your own pending sends to them stay** *default* | When you block someone, the sends *they* sent you disappear from your Inbox (and can't be saved), and come back unchanged if you unblock them while they are still pending. Sends *you* had sent them stay readable by them until you withdraw them (Sent → Withdraw). Unfriending without a block leaves sends alone. | S3-06 Opus review: the simplest reading of D50 (§9 Q20) |
| D60 | **An invite link lets any signed-in rider who holds it join once; it dies with the list's sharing** *default* | No friendship is needed to join by link (holding it is the owner's consent; the in-app invite still needs a friend). The owner, or someone already a member, opening the link changes nothing and doesn't use it up. Stopping sharing or deleting the list revokes its open invite links, so sharing again later doesn't bring them back. An invite link asked for longer than 7 days is cut to 7 (D44). | S3-07 (§9 Q21) |
| D61 | **The session is stored in the iOS keychain, large sessions encrypted** *default* | Supabase's LargeSecureStore pattern: a session up to 2048 bytes lives in `expo-secure-store`; a larger one is AES-256-GCM encrypted (expo-crypto, a fresh key per write) into AsyncStorage with the key in SecureStore. A key with no ciphertext (app reinstalled) reads as signed out. | S4 plan (`docs/plans/2026-10-22-s4-accounts.md`): SecureStore caps a value at 2048 bytes and a Supabase session is usually larger (§9 Q22) |
| D62 | **Sign out in S4 is plain; the Keep / Remove prompt (D38) arrives with S5** *default* | S4 signs out (falling back to a local sign-out when offline) and leaves every spot on the phone. S5, which backs spots up first, adds "Keep spots on this phone?". | S4 plan: before S5 nothing is on the server, so "Remove from this phone" would lose data (§9 Q23) |
| D63 | **A display name is optional** *default* | Onboarding asks for an @username (required) and a display name (optional, ≤ 50, D58); without one, Profile and friends see only @username. | S4 plan: one fewer step to get in (§9 Q24) |
| D64 | **The username screen has a Sign out** *default* | Onboarding can't be dismissed and the tabs send a rider without an @username back to it, so a ghost `Sign out` under Done signs out (spots stay) and returns to Profile. | S4-08 review (Important): without it a rider who won't pick a name, or whose save keeps failing, can only delete the app (§9 Q25) |
| D65 | **The unused `sync_queue` table is dropped** *default* | Local migration 5 drops `sync_queue` and its index (nothing ever wrote or read it) and adds `sync_outbox` + `sync_state` (§3.4) in its place. | S5 plan (`docs/plans/2026-10-22-s5-sync.md`): one outbox, not two half-used ones (§9 Q26) |
| D66 | **A different account signing in removes the previous account's local rows after its data was pushed** *default* | The rows of the last account (and their photo files) leave the phone when another account signs in; that data is in its own account. If that account still has changes on the phone that never reached the server, the app asks first ("Changes not backed up" · Cancel / Remove and continue). | S5 plan: never mix accounts (D38) and never drop an unsynced change silently (§9 Q27) |
| D67 | **Keep after Delete account makes the spots phone-only again** *default* | Choosing Keep after deleting the account clears the deleted account from those spots, photos and lists; they are local spots again, and a later sign-in adopts them like any other. | S5 plan: otherwise the next sign-in would treat them as another account's and remove them (§9 Q28) |
| D68 | **"Older details" stay on the phone** *default* | The archived pre-v3 fields (`legacy_json`) are not uploaded; a second phone shows the spot without the Older details disclosure. The server schema stays as S3 shipped it. | S5 plan: read-only leftovers, simplest; a later migration can add them (§9 Q29) |
| D69 | **Sign out backs up first; Remove only when nothing is waiting** *default* | Sign out tries one sync, then counts every change still waiting (not only those that failed 10 times). Anything waiting → "3 changes aren't backed up yet" · Cancel / Sign out anyway, with no Remove option; nothing waiting → Keep / Remove from this phone (D38). | S5 plan: an offline edit is not yet "failed" but would still be lost by Remove (§9 Q30) |
| D70 | **Spots deleted before the first sign-in stay on the phone only** *default* | Adoption takes live spots, live photos of live spots and live lists; a spot (or photo) deleted before signing in is never uploaded, and its list memberships aren't either. | S5-06 review: adopting tombstones would upload every photo of every spot deleted since install (privacy, data) (§9 Q31) |
| D71 | **Delete account keeps the phone's spots first, then asks** *default* | Right after the account is deleted the app makes its spots, photos and lists phone-only (D67); the Keep / Remove question that follows only decides whether to remove them. An unanswered question (app closed) means Keep. | S5-06 review: otherwise the next sign-in would remove them as another account's, with no server copy left (§9 Q32) |
| D72 | **Friends' names are kept on the phone** *default* | A local `profiles` table (migration 6: id, @username, display name) mirrors the friends and askers the server shows, plus a rider you looked up by username, so names show offline and on things they send or share. It is never uploaded and is emptied when another account signs in, on Remove from this phone and on Delete account. | S6 plan (`docs/plans/2026-10-22-s6-friends.md`): simplest offline names (§9 Q33) |
| D73 | **A request you sent shows the name only on the phone you sent it from** *default* | The server doesn't show you someone's profile until they accept (S3: you mustn't follow them through a rename), so 'Requests sent' shows '@cal' where you typed it and 'A rider you asked' on another phone, with Cancel either way. | S6 plan (§9 Q34) |
| D74 | **Friends has a 'Blocked' section with Unblock** *default* | Blocked riders are listed (names from the phone's mirror, D72) with Unblock; unblocking restores nothing (no friendship comes back, D50). | S6 plan: without it a block could never be lifted from the app (§9 Q35) |
| D75 | **Opening the Inbox marks everything in it seen** *default* | The Inbox tab's badge counts items addressed to you that arrived after you last opened it; no per-row read state; the tab badge only (an app-icon badge needs push notifications, a dev build). | S6 plan (§9 Q36) |
| D76 | **A send to several friends is one send per friend, each with its own photo copy** *default* | `create_send` once per recipient with its own client id and its own `sends/<id>/` photo set; Save, Dismiss and Withdraw are per friend. | S7 plan (`docs/plans/2026-10-22-s7-send.md`): S3's storage rule maps one photo path to one send; a shared set would need a new mapping and a withdrawal couldn't delete photos another friend still needs. Cost: photos × friends in storage, copied server-side (§9 Q37) |
| D77 | **A send's photos are copied before the send exists** *default* | A rider may write photos under `sends/<id>/` for an id no send has yet (nobody can read them), and remove them; `create_send` refuses an id holding another rider's photos; Delete account removes leftovers. | S7 plan: the recipient never sees a send with a photo missing; one small storage-policy change instead of a service-role copy function (§9 Q38) |
| D78 | **Sending needs the spots backed up** *default* | The Send sheet syncs first; if any of the spots or their photos still wait in the outbox: "Some of these spots aren't backed up yet. Try again when you're online." | S7 plan: the server copies the photos from the rider's backup (§9 Q39) |
| D79 | **At most 100 spots per send** *default* | More than 100 (a big area or list): "That's 140 spots. Send up to 100 at a time." | S7 plan: one copy request per photo per friend (§9 Q40) |
| D80 | **The sender's name on a send is the server's, and "From @name" is frozen** *default* | `create_send` writes the sender's @username and display name into the payload (a forged one is replaced); a saved copy keeps "From @ana" as it was when saved (a later rename doesn't change it) and the name syncs with the spot (server `spots.from_username`). | S7 plan (§9 Q41) |
| D81 | **Saving some of a send's spots finishes it** *default* | Pick spots → Save saves those and marks the send saved; the rest aren't offered again (ask the sender to send them again). | S7 plan: one saved state per send, as S3 built it (§9 Q42) |
| D82 | **A dismissed send reads "Waiting" to its sender** *default* | The sender isn't told it was dismissed (Sent shows Waiting and still offers Withdraw). | S7 plan: like D50, nobody is told no (§9 Q43) |

---

## 3. Architecture

### 3.1 Repo layout added
- `supabase/` — `config.toml` (`project_id = "hit-list"`), `migrations/` (SQL, **append-only like `src/db/schema.ts`**),
  `tests/` (pgTAP, run by `npx supabase test db`), `functions/` (Deno Edge Functions: `share-preview`, `account-delete`).
- `src/sync/` — the client side: `client.ts` (the one `createClient`), `outbox.ts`, `push.ts`, `pull.ts`, `photos.ts`,
  `adopt.ts`. Pure logic in `src/utils/` as today.
- `web/share/` — the static link-preview page (`index.html` + one script, no build step).
- `.env.example` — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `.env*` stays ignored. **With no URL
  set the app runs signed-out only** and Profile says "Accounts aren't set up in this build" — so the phone keeps
  working before any backend exists.

### 3.2 Server data model (Postgres, all tables RLS-on)
```
profiles        (id = auth.users.id, username unique citext, display_name, created_at)
spots           (id uuid pk = the client's id, owner_id, name, generated_name, lat, lng, geog geography(Point) generated,
                 feature_types text[], stopped, natural_speed smallint null, notes, primary_photo_id,
                 copied_from_send uuid null, created_at, updated_at, deleted_at, rev bigint)
media           (id, spot_id, owner_id, storage_path, captured_at, lat, lng, uploaded_by, created_at, deleted_at, rev)
hit_lists       (id, owner_id, name, kind 'manual'|'area', area_center geography null, area_radius_m int null,
                 area_filters jsonb null, shared bool, created_at, updated_at, deleted_at, rev)
hit_list_spots  (list_id, spot_id, added_by, added_at)               -- manual lists only
hit_list_members(list_id, user_id, role 'add'|'view', joined_at)     -- the owner is implicit
friendships     (user_a < user_b, status 'pending'|'accepted', requested_by, created_at)
blocks          (blocker, blocked)
sends           (id, sender, recipient null, link_id null, payload jsonb  -- frozen spots, D40
                 , created_at, withdrawn_at, saved_at, dismissed_at)
links           (id, kind 'send'|'invite', token_sha256, send_id|list_id, created_by, expires_at, revoked_at,
                 used_by null, used_at null)
```
`rev` is a server-assigned `bigserial`-style counter bumped by trigger on every write; it's the pull cursor (no client
clocks in the cursor). Storage: one private bucket `photos`, paths `<owner_id>/<spot_id>/<media_id>.jpg`; sends copy
into `sends/<send_id>/<media_id>.jpg`.

### 3.3 Who can read what (RLS, the heart of multi-tenancy)
One `security definer` SQL function `can_read_spot(spot_id, uid)` used by the `spots`, `media` and storage policies:
the owner; or a member of a manual shared list containing it; or a member of a shared **area** list whose owner owns
the spot and whose circle contains it (`ST_DWithin`). Writes on `spots`/`media`: owner only. `hit_list_spots` insert:
the list's owner, or a member with role `add` adding a spot **they own** (you can't put someone else's spot in a list).
`profiles`: a row is readable by its user, their friends and co-members; everyone else gets only
`find_profile(username)` (exact match, returns id + username + display name, nothing for someone who blocked you).
`sends`: sender and recipient. `links`: no direct access; only through `share-preview` / `redeem_invite(token)`.
Deleted (`deleted_at`) rows read as gone to everyone but their owner's sync.

**Every policy has pgTAP tests written first**, with at least these cases: stranger reads nothing; friend reads
nothing that wasn't shared; member of list A can't read list B's spots; view-only member can't add; a member can't add
someone else's spot; a removed/left member loses read immediately, including photos in storage; withdrawn send and
revoked/expired/used link return nothing; a blocked user can't send, invite or find you.

### 3.4 Sync (client)
- Local schema: a new migration (append, never edit) adds `owner_id` (null = not yet adopted) to spots, media,
  hit lists; `hit_lists`, `hit_list_spots`, `hit_list_members` mirrors; `sync_outbox (id, entity, entity_id, op,
  created_at, attempts, last_error)`; `sync_state (key, value)` for per-table `rev` cursors and the signed-in user id.
- Every local write that the account owns appends an outbox row in the same transaction. Push drains in order,
  upserting with "only if newer `updated_at`"; photos upload (D46) before their media row. Failures back off; nothing
  is dropped; a row that fails 10 times surfaces as "N changes not backed up" on Profile with Retry.
- Pull fetches rows with `rev > cursor` per table (RLS decides what comes back), writes them locally, and removes local
  copies of others' spots the rider can no longer read (left the list, removed, unshared).
- Others' photos download lazily into the cache directory (`Paths.cache`), never `Paths.document`.
- Fakes mirror supabase-js: the Jest fake for the client copies the member names and return shapes
  (`{ data, error }`) from `node_modules/@supabase/*/dist/*.d.ts`. The DB-level truth is the pgTAP suite and an
  integration test against the local stack (`npm run test:integration`), not the fake.

### 3.5 Inbox and friends
Friend request by exact username, from an invite link/QR (`hitlist` deep link in a dev build; in Expo Go the link's
page shows the username to type), or from a shared list's member row. Accept / Decline / Remove / Block. Inbox rows:
received sends (Save all · Save into a new hit list · pick spots · Dismiss), list invitations (Join / Decline),
friend requests.

### 3.6 Links
`share-preview` Edge Function: `GET ?t=<token>` → JSON (`{ kind:'send', spots:[…frozen fields…, photo_urls], sender:
{username, display_name}, expires_at }`), or a 404-shaped `{ error:'gone' }` for unknown, expired, revoked or
withdrawn, never distinguishing which. `web/share/index.html` reads `t` from the URL, calls the function, renders the
spots (photos, tags, notes, an Apple/OpenStreetMap static link to the pin), and a "Save to my spots" button that
explains it needs the app and an account. Where the page is hosted is a live step (§10). Invite links use the same
token scheme but the page only says "<name> invited you to a hit list on HitList — open the app to join"; joining is
`redeem_invite(token)` from the signed-in app (paste the link or scan the QR in Expo Go).

---

## 4. What doesn't change
The spot model, the three tags, photos (local files and relative paths), filters/sort/search, Quick Add and import,
the viewer, units, NO_LOCATION, `newId()`. Every CLAUDE.md convention holds (append-only migrations, deps via
`npx expo install`, real SQLite in DB tests, fakes mirror the real API, TDD, zero `console.error` in Jest).

---

## 5. Screens (what the plans build; exact layout is the plan's call within these rules)

### 5.1 Lists tab
Sections "My hit lists" and "Shared with me". Each row: name, spot count, a small map thumbnail if cheap (else none),
two-people icon + member count if shared, "Area · 2 mi" for area lists. "+ New hit list" and "+ Area list". Tapping a
list opens it: the same List | Map views and filters as the Spots tab, scoped to the list, plus the side-by-side
**Send these spots / Share list** actions (§1). Shared lists show the member strip under the title (avatars/initials,
"+ Invite").

### 5.2 Getting spots into lists
- Spot detail: an "In lists" row (chips; shared ones with the icon) → Add-to-list sheet (checkboxes, "+ New hit list").
- Spots tab: long-press a row (or "Select" in the header) → multi-select → Add to list · Send.
- Spots tab: a list picker chip row above the list/map ("My spots" first, then lists) filters both views (10-16 §7.2).

### 5.3 The area picker (Marketplace-style)
Full-screen map with a fixed centre pin; drag the map or search a place (geocode via expo-location) to move it; a
radius control (imperial: 0.25, 0.5, 1, 2, 5, 10, 25 mi; metric: 0.5, 1, 2, 5, 10, 25, 50 km) drawn as a circle; the
existing filters available; a live count "23 spots". "Use my location" button. Bottom: **Send these 23 spots** ·
**Save as hit list** → *Just these 23* / *Keep it updated (area list)*, each with a one-line explanation.

### 5.4 Send
One sheet for one spot, a selection, a list's contents or an area result: the spots (count + thumbnails), recipients
(friends with checkboxes), **Copy link instead** (expiry choice, D44), the §1 sentence, Send. Profile → **Sent**
shows each send with its status (to friends: Waiting · Saved · Withdrawn; links: Active · Expired · Revoked, no view
counts) and Withdraw / Revoke.

### 5.5 Share a hit list
"Share list" on a private list → choose friends + role → the §1 sentence and "N spots will become visible to them" →
Share. On a shared list: member list with role menus (owner), Invite (friends or invite link), **Leave** (members),
**Stop sharing** (owner; "Members lose access to all N spots now").

### 5.6 Signed out
Profile: "Sign in to back up your spots and share them" (+ what signing in does: D38). Lists works locally. Send /
Share / Inbox / Friends show one line and a Sign in button; nothing is disabled silently.

---

## 6. Testing and verification
- `npx expo lint && npx tsc --noEmit && npx jest --silent` (the CI gates; `CHECK_CMD`) stay green, no `console.error`.
- `npm run test:db` = `npx supabase test db` (pgTAP) and `npm run test:integration` (Jest against the running local
  stack: sign up two users via the local Auth admin API, push/pull, share, revoke). Both need Docker; they are **not**
  in `CHECK_CMD` (CI has no Supabase), so every S2+ feature's verify steps name the one(s) it needs.
- The local stack: start with `npx supabase start`, stop with `npx supabase stop` when a milestone's checks are done.
  Only the containers whose names start `supabase_` and end `_hit-list` are this project's. **Never touch any other
  container** (dj-*, n8n-*, anything else), never `docker system prune`, never `docker compose` in another directory.
- Screen copy for §1's rules is asserted in component tests (the Send sentence, the Share sentence, the shared-list
  confirmation), so a later refactor can't quietly blur the two verbs.
- `npx expo export --platform ios --output-dir /tmp/hl-export` must still bundle after every milestone that adds a
  dependency.
- Verify steps are checkable as written. A "grep prints nothing" step names the paths it excludes (retro of
  hit_list-2026-10-20: two requeues came from greps that matched test fixtures).

---

## 7. Milestones (in order; one PR each)

Each milestone ends with an Opus review of its diff (fix Critical/Important with RED→GREEN), `/simplify`, and a
`docs/plans/2026-10-22-<s#>-what-michael-will-see.md` written for the phone (what to tap, what should happen).

**S1 — Hit lists, local (no accounts).** Local migration for `hit_lists`/`hit_list_spots` (owner nullable), store,
Lists tab (D49) with manual lists, Add-to-list sheet and "In lists" row, multi-select on the Spots tab, list screen
(List | Map scoped), list picker chips on the Spots tab, rename/delete list (deleting a list never deletes spots).
*Done when:* a list can be made, filled from detail and from multi-select, viewed on the map, renamed and deleted, all
offline and signed out; real-SQLite tests cover the many-to-many and soft deletes.

**S2 — Area picker and area lists, local.** The §5.3 picker (pure geometry in `src/utils/area.ts`: radius steps per
unit, circle membership via haversine, tested), "Just these N" and "Keep it updated" lists; an area list's spots are
computed, not stored; its screen shows "Area · 2 mi of <place>" and offers Edit area.
*Done when:* saving a spot inside an area list's circle makes it appear in that list with no other action.

**S3 — Supabase backend.** `supabase/` (pinned CLI devDependency), migrations for §3.2, RLS and `can_read_spot` per
§3.3, `find_profile`, storage bucket + policies, pgTAP suite with every §3.3 case written first and watched failing.
*Done when:* `npm run test:db` passes on a fresh `npx supabase db reset`, and the §3.3 case list maps 1:1 onto named
tests (list them in the plan).

**S4 — Accounts in the app.** `@supabase/supabase-js` via `npx expo install` (+ whatever Supabase's current Expo guide
requires for session storage; secure storage for the refresh token), `.env.example`, unconfigured = signed-out only
(§3.1), email-code sign-in (D36), username + display name onboarding (D39), sign out (D38 prompt), Delete account
(D51, `account-delete` function), Profile's signed-in/out states (§5.6).
*Done when:* integration test signs up via the local stack, sets a username, signs out and back in; Jest covers the
unconfigured build and every Profile state.

**S5 — Sync own data.** §3.4 in full for the rider's own spots, media, photos (D46) and lists; adoption on first sign-in
(D38); "N changes not backed up" + Retry; two-device integration test (two clients, one account: edit on A appears on
B; delete propagates; offline edits on both converge by D48).
*Done when:* integration tests pass and no local spot or photo is lost across sign-in → sign-out(Keep) → sign-in as
another account → back (each account sees only its own).

**S6 — Friends and Inbox.** `friendships`/`blocks` flows (D39, D50), Friends in Profile, Inbox tab with friend requests,
badge.

**S7 — Send.** Send sheet (§5.4) for one spot / selection / list / area result to friends; frozen payload + photo copy
(D40); Inbox: Save all / Save into new hit list / pick / Dismiss; "From @name" on saved copies; Sent screen with
Withdraw; §1 sentence asserted.
*Done when:* integration test: A sends 3 spots to B, A edits one and deletes another, B still saves the 3 as sent;
A withdraws a second send before B saves it and B no longer sees it.

**S8 — Shared hit lists.** Share list (§5.5), roles (D42), invitations in Inbox, member strip, Leave / Remove / Stop
sharing (D43), others' spots read-only locally (D47) with Save a copy, shared area lists (D41), the first-add
confirmation and every §1 marker.
*Done when:* integration test: B joins A's list, sees its 5 spots and a 6th A adds later; view-only C can't add; B
leaves and loses all of them locally after the next pull (and their photos fail to download).

**S9 — Links.** `links` table + `share-preview` + `redeem_invite`, Copy link in the Send sheet (expiry, D44), invite
links from a shared list, Revoke in Sent / the member screen, `web/share/` page (served locally for tests by any
static server; a Node test loads it against the local function), "paste a link" entry in Inbox for Expo Go.
*Done when:* a send link previews with no auth header, then 404-shapes after revoke and after expiry; an invite link
works once for a signed-in user and never anonymously.

**S10 — Sweep.** Whole-run Opus review; APP_SPECIFICATIONS gets a "Accounts and sharing (2026-10-22)" section at the
top like the Simplified model one, and its `[FUTURE] Sharing Model / Crews / Folders` headings marked as superseded by
it; README, CLAUDE.md (layout, `supabase/`, `src/sync/`, the test commands, the Docker rule) and RUNNING-ON-PHONE
(pointing Expo Go at the box's local stack over Tailscale) brought up to date; `docs/plans/2026-10-22-live-checklist.md`
(§10) finished; one `docs/plans/2026-10-22-sharing-what-michael-will-see.md` that walks the whole feature on the phone.

---

## 8. Order and cut line
S1 → S10 in order. S1–S2 are useful on the phone with no backend at all, so they go first. If the run must stop early,
it stops at a milestone boundary; S9 (links) is last among the features because D44 is the least settled decision.

---

## 9. Needs Michael (each has a default the run builds; answer in INBOX.md or on the PR)

1. **The word (D33).** Default **hit list**. Alternatives: *list*, *stack*, *trip*, *mission*, *zone* (good for area
   lists only). Does "hit list" next to the "List | Map" toggle read badly to you?
2. **Sign-in (D36).** Default emailed 6-digit code only; Apple sign-in when there's a dev build. Want a password option?
3. **Signing out (D38).** Default asks Keep / Remove-from-phone. Or always keep, or always remove?
4. **Finding friends (D39).** Default exact @username or invite link/QR, no search by name. Want contacts matching?
5. **Notes in sends and links (D40).** Default: notes go with the spot. Want a per-send "include notes" toggle, or a
   private-notes field that never leaves your phone?
6. **Roles (D42).** Default members can add spots, owner can switch someone to view-only. Want co-owners?
7. **Leaving a shared list (D43).** Default: a member's spots leave with them. Alternative: the list keeps a copy owned
   by the list owner (feels generous, but it gives away spots without asking).
8. **Links (D44), your open question.** Default: a *Send* link shows the spots to anyone holding it for 30 days (no
   account needed to look; account needed to save); an *invite* link to a shared list always needs an account and works
   once. Stricter option: every link needs an account (safer for spots you don't want blown up; more friction for a
   friend who just wants to see one rail). Looser option: no expiry by default.
9. **Crews.** Not built: a shared list's members act as the crew. Want a reusable "crew" (a saved group of friends you
   can share several lists with in one go)? Good next step after this run.
10. **Tabs (D49).** Default Spots · Lists · Inbox · Profile. Or keep two tabs and put Lists/Inbox inside Spots/Profile?
11. **Blocking inside a shared list (D50).** Default nothing changes in lists you share; you can leave. Or hide each
    other's spots in shared lists?
12. **Spot notes by others.** Not built: members commenting or adding photos to someone else's spot. Next run?
13. **Filters across lists (D52).** Default: the Spots tab and every hit list share one set of filters, search and sort
    (set "Rail" on a list and the Spots tab shows rails too until you reset). Or should each list remember its own?
14. **Area lists and spots with no location (D53).** Default: a spot saved without a location never shows in an area
    list. OK?
15. **The place name of an area (D54).** Default: your search text ('Capitol Hill') or 'my location', dropped when you
    drag the map away. Want the town looked up instead (sends the coordinates to Apple, like the town backfill)?
16. **Area list filters (D55).** Default: the picker uses the Spots tab's filters, and 'Edit area' loads the list's
    filters into them while it is open (your own filters come back when it closes). Or should each area keep its own
    filters, separate from the Spots tab?
17. **Area radius (D56).** Default 2 mi / 2 km; switching units later keeps a saved area's size (shown converted,
    e.g. 3.2 km). OK?
18. **Invitations to a shared list (D57).** Default: you're added as "invited" and see only the list's name and who
    invited you until you tap Join; Decline removes the invitation. Or should a friend you invite be in the list
    straight away (they could Leave)?
19. **Display name length (D58).** Default: up to 50 characters. Longer or shorter? (Also: a blocked rider who tries to
    take your exact username learns it exists while `find_profile` hides you; unavoidable with unique names unless
    username changes go through a rate-limited function. OK to accept?)
20. **Blocking and sends (D59).** Default: blocking someone hides the sends they sent you (they come back if you
    unblock while they're still pending), but the sends you had sent *them* stay visible to them until you withdraw
    them. Should blocking also withdraw your own pending sends to that person, and should unblocking keep their old
    sends hidden?
21. **Invite links (D60).** Default: anyone with an account who has the link can join the list once (they don't
    have to be your friend first), and stopping sharing or deleting the list kills its open invite links. Should an
    invite link work only for your friends?
22. **Where the sign-in lives on the phone (D61).** Default: in the iPhone keychain, with a large session encrypted
    and its key in the keychain. OK, or should signing in last only until the app is closed?
23. **Signing out before backup exists (D62).** Default: in S4, Sign out just signs out and keeps every spot on the
    phone; the Keep / Remove question (Q3) comes with S5. OK?
24. **Display name (D63).** Default: optional; friends see @username when you leave it empty. Should it be required?
25. **A way out of picking a username (D64).** Default: the username screen has a small 'Sign out' under Done that
    signs out and goes back to Profile. Or should picking a username be the only way on?
26. **The old sync table (D65).** Default: the never-used `sync_queue` table is dropped when the outbox arrives. OK?
27. **Another account on the same phone (D66).** Default: when someone else signs in, the last account's spots leave
    the phone (they're in that account); if some of its changes never got backed up, the app asks before removing
    them. Or should the phone refuse a second account until the first one's changes are backed up?
28. **Keep after deleting your account (D67).** Default: Keep turns them back into phone-only spots that a future
    sign-in adopts. OK?
29. **Older details (D68).** Default: the archived pre-simplification details stay on the phone that had them and
    aren't backed up. Want them in the account too (one more server column)?
30. **Signing out with changes waiting (D69).** Default: Sign out tries a backup first; if anything is still waiting
    it offers only Cancel / Sign out anyway (no Remove). OK?
31. **Spots deleted before you ever signed in (D70).** Default: they stay on the phone only and are never uploaded
    (nor their photos). OK, or should the first sign-in back up deleted spots too?
32. **Closing the app on "Account deleted · Keep the spots on this phone?" (D71).** Default: Keep (they become
    phone-only spots right away; Remove takes them off). OK?
33. **Friends' names on the phone (D72).** Default: your friends' @usernames and display names are kept on the phone
    so they show offline (removed when another account signs in). OK?
34. **Requests you sent, seen from another phone (D73).** Default: 'A rider you asked' (with Cancel) until they accept,
    because the server hides their profile until then. Or should a pending request always show the @username you typed
    (one more server column on the request)?
35. **Unblocking (D74).** Default: Profile → Friends lists the riders you blocked, each with Unblock. Or should a block
    be permanent / live in Settings?
36. **Inbox badge (D75).** Default: opening the Inbox tab clears its badge; no unread dot per row. Want per-row unread?
37. **Sending to several friends (D76).** Default: each friend gets their own copy (photos stored once per friend).
    OK, or should one send be shared by all its recipients (less storage, but withdrawing from one friend gets
    complicated)?
38. **Photos go up before the send (D77).** Default: the app copies the photos into the send's folder first, then
    creates the send, so a friend never opens one with photos missing. OK?
39. **Sending spots that aren't backed up (D78).** Default: Send tries a backup first and refuses with a message if
    something is still waiting (e.g. offline). Or should the send wait and go out by itself later?
40. **Send size (D79).** Default: at most 100 spots per send. More, fewer, or no limit?
41. **"From @name" (D80).** Default: the name is the sender's @username when you saved it, and doesn't change if they
    rename later. Should it follow their current name instead?
42. **Picking some spots of a send (D81).** Default: saving the ones you picked finishes the send; the rest are gone.
    Or should the rest stay in the Inbox?
43. **Dismissing (D82).** Default: the sender still sees "Waiting" after you dismiss (they aren't told). Or should
    Sent say "Dismissed"?

---

## 10. Live checklist (for Michael; the run maintains `docs/plans/2026-10-22-live-checklist.md`)
- Try it before any cloud: `npx supabase start` on the box, put its URL (Tailscale address, port 54321) and anon key
  in `.env.local`, `npm run start:tailscale`, sign in on the phone (codes appear in the local Inbucket/Mailpit UI).
- Supabase cloud project (free tier is enough to start): create it, `npx supabase link`, `npx supabase db push`,
  `npx supabase functions deploy share-preview account-delete`, set the two `EXPO_PUBLIC_*` values, configure the
  email sender (custom SMTP before real users; Supabase's built-in sender is rate-limited).
- Host `web/share/` (Vercel next to the portfolio, Cloudflare Pages or GitHub Pages) on a domain you like for links;
  set `SHARE_BASE_URL` in the app config.
- Later, with a dev build / TestFlight: Apple sign-in, the `hitlist://` scheme + universal links for "Open in
  HitList", push notifications for the Inbox.
