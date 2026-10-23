# Live checklist (for Michael)

Everything in this run is built against the **local** Supabase stack only (build-only policy). These are the steps
that touch something real; nobody has run any of them. Tick a box when it is done. Spec §10 is the source; each
milestone appends its own steps below.

## From spec §10

- [ ] **Try it before any cloud.** On the box: `npm run db:start` (or `npx supabase start`). Put its Tailscale
      address (port 54321) and the anon key from `npx supabase status` into `.env.local` as `EXPO_PUBLIC_SUPABASE_URL`
      / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then `npm run start:tailscale` and sign in on the phone (the 6-digit codes
      show up in Mailpit, `http://<box>:54324`). Stop it afterwards with `npm run db:stop`.
- [ ] **Supabase cloud project** (free tier is enough to start): create it, `npx supabase link`,
      `npx supabase db push`, `npx supabase functions deploy share-preview account-delete`, set the two
      `EXPO_PUBLIC_*` values, configure the email sender (custom SMTP before real users; Supabase's built-in sender is
      rate-limited).
- [ ] **Host `web/share/`** (Vercel next to the portfolio, Cloudflare Pages or GitHub Pages) on a domain you like
      for links; set `SHARE_BASE_URL` in the app config.
- [ ] **Later, with a dev build / TestFlight:** Apple sign-in, the `hitlist://` scheme + universal links for "Open
      in HitList", push notifications for the Inbox.

## S3 — backend schema and policies

The migrations in `supabase/migrations/` are the whole server schema. Pushing them to a cloud project, in stages:

- [ ] **Link** (once): `npx supabase login`, then `npx supabase link --project-ref <ref>` from this repo. Check:
      `npx supabase migration list` shows every local migration as not yet applied remotely.
- [ ] **Dry run:** `npx supabase db push --dry-run`. Check: it lists exactly the files in `supabase/migrations/`, in
      order, and nothing else (`seed.sql` is never pushed). Never add `--include-seed`, never run
      `npx supabase db reset --linked`: both would put the `tests` schema on the cloud database.
- [ ] **Push:** `npx supabase db push`. Check in the dashboard: Table editor shows the ten tables, each with "RLS
      enabled"; Storage shows a private bucket `photos` (allowed MIME `image/jpeg`, 10 MB limit) whose Policies tab
      lists `photos_select`, `photos_insert`, `photos_update`, `photos_delete`; Database → Functions lists
      `can_read_spot`, `find_profile`, `create_send` and the others from `docs/plans/2026-10-22-s3-backend.md`.
- [ ] **Smoke test with two throwaway accounts** (Auth → Add user): as user A in the SQL editor
      `select set_config('request.jwt.claims', '{"sub":"<A id>","role":"authenticated"}', true); set local role
      authenticated; select count(*) from spots;` returns only A's rows; as B, A's spot is not returned.
      Delete both users afterwards.
- [ ] **Links are service-role only** (S3-07): in the SQL editor `select has_function_privilege('anon',
      'public.preview_link(text)', 'execute'), has_function_privilege('authenticated', 'public.preview_link(text)',
      'execute');` returns `false, false`, and `select count(*) from public.links;` as an authenticated user (as in
      the smoke test) returns 0. The service-role key that `share-preview` (S9) uses to call `preview_link` is a
      function secret only: never in the app, `.env.local` or the repo.
- **Undo:** migrations only go forward. Before any real user exists, the clean undo is to delete the cloud project
  and create a new one (nothing else depends on it). After real users exist, undo is a new migration that reverses
  the change; never edit a pushed file.

## S4 — accounts on the phone (local stack over Tailscale)

Works from S4-05 on (sign-in, username, Profile). Nothing here touches a cloud project. Plan:
`docs/plans/2026-10-22-s4-accounts.md`.

- [ ] **Start the stack** on the box: `npm run db:start`, then `npm run db:reset` for a clean database. Check:
      `curl -s http://100.88.90.97:54321/auth/v1/health` from the box (or the phone's browser) answers with JSON. If
      it doesn't, the ports are bound to 127.0.0.1 only: tell the run, don't change Docker by hand.
- [ ] **Check the server side first** (S4-06): `npm run test:integration`. Check: `Tests: 17 passed` (two riders sign
      up, usernames, sign out and back in, account-delete). If a function was edited since `db:start`, run
      `docker restart supabase_edge_runtime_hit-list` first (the local runtime doesn't reload functions).
- [ ] **Point the app at it:** `cp .env.example .env.local`, then set `EXPO_PUBLIC_SUPABASE_URL=http://100.88.90.97:54321`
      and `EXPO_PUBLIC_SUPABASE_ANON_KEY=` the `ANON_KEY` from `npx supabase status` (a local demo key; `.env.local` is
      git-ignored, never commit it). Check: `git status` doesn't list `.env.local`.
- [ ] **Run it:** `npm run start:tailscale` (restart Metro after any `.env.local` change; `EXPO_PUBLIC_` values are read
      when the bundle is built), open it in Expo Go. Check: Profile shows "Sign in to back up your spots and share
      them" (not "Accounts aren't set up in this build").
- [ ] **Sign in:** Profile → Sign in → your email → Send code. Read the 6-digit code in Mailpit at
      `http://100.88.90.97:54324` (any address works locally; nothing is really emailed). Type it; pick an @username.
      Check: Profile shows `@you`, your display name and email. If Mailpit's email has only a link and no code, the
      local magic-link template needs `{{ .Token }}`: note it in INBOX.md for the run.
      Screens (S4-03): Sign in opens as a sheet; Enter code is pushed after it, and iOS shows a screen pushed after a
      sheet as another sheet on top. Check: the code field gets the code from the keyboard's suggestion bar (one-time
      code autofill), six digits verify on their own, and a rider who already has a username lands back on the tab
      that opened Sign in with both sheets gone. If the stacked sheets look wrong, note it in INBOX.md (the fix is an
      `app/auth/_layout.tsx` Stack presented as one sheet).
      Username (S4-04), with a new email: after the code, "Pick your @username" replaces Enter code; no back button,
      no swipe down. Type `ab` (shows "At least 3 characters"), then a free name; the keyboard's Next goes to Display
      name; Done. Check: both sheets close and the Profile tab shows, with no second copy of the tabs in a sheet
      (swiping down must not reveal Sign in again). Try a username another account already has: "That username is
      taken". Close Expo Go on the username screen and reopen: the tabs send you straight back to it. Then `Sign out` under
      Done (S4-08): the Profile tab, signed out, no sheet left over.
- [ ] **Stay signed in:** close Expo Go fully and reopen. Check: still signed in on Profile.
- [ ] **Sign out / back in:** Sign out (spots stay on the phone, D62), sign in again with the same email. Check: same
      @username, not asked again.
- [ ] **Delete account** (needs the `account-delete` function, served by the local stack): Profile → Delete account →
      Delete. Check: back to signed out; in Studio (`http://100.88.90.97:54323`) Authentication shows no user for that
      email; spots on the phone are untouched. With Wi-Fi and cellular off, Delete → "Couldn't delete the account. Try
      again." and still signed in.
- [ ] **Sign out offline** (S4-05): sign in, turn Wi-Fi and cellular off, Sign out. Check: Profile says signed out; turn
      the network back on, wait a minute, reopen Expo Go: still signed out (not signed back in).
- [ ] **Stop:** `npm run db:stop`. **Undo:** delete `.env.local` (the app goes back to signed-out only);
      `npm run db:reset` wipes every local account.
- [ ] **Later, for a cloud project** (not before the §10 cloud step): in the dashboard, Authentication → Email: OTP
      length **6**, and the "Magic Link" and "Confirm signup" templates must contain `{{ .Token }}` (the app asks for a
      code, never a link); `npx supabase functions deploy account-delete`; check a request without a token gets 401.

## S5 — backup and sync (local stack over Tailscale)

Works from S5-06 on. Same setup as S4 (stack up, `.env.local`, `npm run start:tailscale`). Plan:
`docs/plans/2026-10-22-s5-sync.md`; the screens and alerts: `docs/plans/2026-10-22-s5-what-michael-will-see.md`.

- [ ] **Server side first:** `npm run test:integration`. Check: `Tests: 29 passed` (S4's 17 + the two-phone sync 12).
- [ ] **Before signing in, count what the phone has:** on the Spots tab, note the number of spots, one spot with
      several photos (its name and photo count) and the hit lists on the Lists tab.
- [ ] **First sync:** sign in (S4 steps) with those spots on the phone. Check: within a few seconds Profile shows
      "Backed up · just now"; the Spots tab still shows every spot (adoption never deletes).
- [ ] **What to check in Studio after that first sync** (`http://100.88.90.97:54323`, Table editor, schema `public`):
      - `spots`: one row per spot on the phone, `owner_id` = your user id (Authentication → Users), `rev` filled,
        `updated_at` set, `deleted_at` empty; `feature_types` an array like `{rail,ledge}`; a spot with no GPS has
        `lat`/`lng` = 0. SQL editor: `select count(*) from spots where owner_id = '<your id>' and deleted_at is null;`
        equals the phone's count.
      - `media`: one row per photo, `storage_path` = `<your id>/<spot id>/<media id>.jpg`, `spot_id` matches.
      - `hit_lists`: one row per list (`kind` `manual` or `area`, `shared` false); `hit_list_spots`: one row per spot in
        a manual list, `added_by` = your id; area lists have none (computed on the phone).
      - Storage → `photos` → `<your id>/`: one folder per spot with photos; open one file: a JPEG, long edge ≤ 2048 px.
      - The photos on the phone are untouched (same count on the spot you noted; full resolution in the viewer).
- [ ] **Edits travel:** rename a spot on the phone, wait for "Backed up · just now" (or pull down on the Spots tab).
      Check: Studio `spots.name` changed and `rev` went up. Delete a spot: `deleted_at` is set (the row stays).
- [ ] **Offline:** Airplane mode on, add a spot with a photo. Check: Profile keeps the old time. Airplane off, pull down
      on the Spots tab. Check: the row and its file appear in Studio; Profile "Backed up · just now".
- [ ] **Server → phone:** in Studio edit a `spots.name` of yours and set `updated_at` to now (`now()` in the SQL editor:
      `update spots set name = 'From Studio', updated_at = now() where id = '<id>';`), pull down on the Spots tab.
      Check: the phone shows "From Studio". Set an older `updated_at` instead: the phone keeps its name.
- [ ] **Sign out / switch** (S5-08 steps 6–8): Keep keeps the spots; a second email signs in to an empty Spots tab;
      the first rider's spots and photos return after signing back in. Check in Studio: the second rider's rows have
      the second id; nobody's rows changed owner.
- [ ] **Stop:** `npm run db:stop`. **Undo:** Profile → Sign out → Remove from this phone, then sign in again (everything
      downloads from the account); `npm run db:reset` wipes the server side. A phone that should forget the account
      entirely: Sign out → Keep leaves the rows owned by that account; Delete account (S4) makes them phone-only.

## S6 — friends and Inbox (local stack over Tailscale)

Works from S6-04 on. Same setup as S4/S5 (stack up, `.env.local`, `npm run start:tailscale`). You need **two riders on
two emails** (codes for both show in the local Mailpit at port 54324); on one phone, switch by Profile → Sign out
(Keep) → Sign in with the other email. Plan: `docs/plans/2026-10-22-s6-friends.md`.

- [ ] **Server side first:** `npm run test:integration`. Check: the friends suite passes (count in the S6 plan).
- [ ] **Two riders:** sign in as rider A (e.g. `@ana_test`), sign out (Keep), sign in as rider B (`@ben_test`), pick
      the username; sign out (Keep).
- [ ] **Add by username:** as A, Profile → Friends → type `@BEN_TEST` (capitals on purpose) → Add. Check: 'Request
      sent to @ben_test' and a 'Requests sent' row '@ben_test' with Cancel. Type `@nobody_xyz` → 'No rider named
      @nobody_xyz'. Type your own name → "That's you".
- [ ] **Accept on the other side:** sign out (Keep), sign in as B. Check: the tab bar reads Spots · Lists · Inbox ·
      Profile and Inbox has a badge '1'. Open Inbox: '@ana_test wants to be friends' with Accept / Decline; the badge
      goes away. Tap Accept once. Check: the row leaves; Profile shows 'Friends · 1' and Friends lists '@ana_test'.
- [ ] **Both sides:** switch back to A. Check: Friends lists '@ben_test' (no longer under 'Requests sent').
- [ ] **Block and vanish from find:** as B, long-press '@ana_test' → Block @ana_test → confirm text "They won't be
      told. They can't send to you or invite you." → Block. Check: A is gone from Friends and under 'Blocked'. Switch
      to A: B is gone from A's Friends; typing `@ben_test` → 'No rider named @ben_test' (same words as a name that
      doesn't exist). Switch to B, Unblock: A can find B again (no friendship comes back).
- [ ] **What to check in Studio** (`http://100.88.90.97:54323`): `friendships` has one row for the pair (`user_a` <
      `user_b`), `status` `pending` then `accepted`; after the block it is gone and `blocks` has `blocker` = B,
      `blocked` = A; after Unblock `blocks` is empty.
- [ ] **Offline:** Airplane mode on, open Friends. Check: "Couldn't reach the server. Pull to try again." and no
      crash; Airplane off, pull down: the list returns.
- [ ] **Stop:** `npm run db:stop`. **Undo:** remove friendships from the app (Remove friend / Cancel / Unblock) or
      `npm run db:reset` to wipe the server side; the phone's name mirror empties when another account signs in.
- Later (dev build): push notifications for friend requests and an app-icon badge (D75).

## S7 — Send spots to friends (local stack over Tailscale)

Works from S7-05 on (the server migration lands in S7-03). Same setup as S6: stack up, `.env.local`,
`npm run start:tailscale`, two riders A and B who are friends (S6). Plan: `docs/plans/2026-10-22-s7-send.md`.

- [ ] **Server side first:** `npm run db:reset && npm run test:db && npm run test:integration`. Check: the send suite
      passes (counts in the S7 plan's 'As built').
- [ ] **Deploy order (cloud, later):** `npx supabase db push` the S7 migration **before** installing a build that
      sends spots (an older server without `spots.from_username` stalls every backup), then
      `npx supabase functions deploy account-delete` (it calls `staged_send_objects`, which the migration adds: deployed
      first, every Delete account answers 500). Check: `select public.mark_send_saved` takes `(uuid, uuid)` in the SQL
      editor's function list and a test rider's Delete account answers ok. Undo: redeploy the previous function
      (`git show <S6 commit>:supabase/functions/account-delete/index.ts`); the migration only adds.
- [ ] **Staged photos:** Studio → SQL: `select * from public.staged_send_objects('<A's id>')` after an interrupted send
      (kill the app while 'Sending…'). Check: the leftover paths are listed; they go with A's account delete.
- [ ] **One spot from its page:** as A, open a spot with a photo → paper-plane (top right) → tick @B. Check: the
      sentence "They get a copy of this spot as it is now. Changes you make later won't reach them." and no word
      "Share" anywhere in the sheet. Send. Check: 'Sent to @B'.
- [ ] **Three from multi-select, and a list:** Spots tab → Select → three spots → 'Send (3)' → @B → Send. Open a hit
      list → 'Send these spots · one-time copy of N spots' → @B → Send.
- [ ] **Area picker and the sheet's edges (S7-04):** Lists → Pick an area → 'Send these N spots' → @B → Send. Check:
      the 'Sent to @B' line shows **over the picker** (it draws its own). Signed out, open the sheet from a spot →
      'Sign in'. Check: the sign-in sheet opens (the Send sheet closes in the same tap; if iOS refuses to present it,
      nothing happens: note it and the sheet needs to push after its close). While 'Sending…', Cancel is grey and a
      swipe down doesn't close the sheet.
- [ ] **The copy is frozen:** as A, rename the first sent spot and delete another. Switch to B (Sign out → Keep →
      sign in). Check: Inbox badge, '@A sent you 3 spots' shows the **old** name; Save all. Check: 'Saved 3 spots',
      the spots are in B's Spots tab with 'From @A' on detail, photos included, and Edit works.
- [ ] **Pick and new list:** on the list send: 'Pick spots' → untick one → Save; on another: 'Save into a new hit
      list' → a list 'From @A' appears on Lists.
- [ ] **Inbox edges (S7-05):** as B with a send waiting: Dismiss → "Dismiss these spots?" · "@A won't be told." →
      Dismiss. Check: the row goes and A's Sent still reads 'Waiting' (D82). On another send, tap Save all and turn on
      Airplane mode at once. Check: "Couldn't save these spots. Try again." and the row offers **only 'Try again'**
      when the save may have reached the server (otherwise the four buttons come back); Airplane off → Try again →
      'Saved N spots', no second set of copies. With VoiceOver on, Save all. Check: 'Saved N spots' is spoken once and
      each button names the sender ('Save all spots from @A'). The first spot's photo shows as the row's thumbnail.
- [ ] **Withdraw:** as A, send one more spot; Profile → Sent → Withdraw before B saves. Switch to B: it's gone from
      the Inbox. As A, Sent shows the saved one as 'Saved' with no Withdraw ('Saved copies are theirs').
- [ ] **Offline:** Airplane mode, try Send. Check: "Couldn't send. Try again." (or the not-backed-up line) and
      nothing appears on B's side.
- [ ] **What to check in Studio** (`http://<tailnet-ip>:54323`): `sends` has one row per friend per send with
      `payload.sender.username` = A; Storage `photos/sends/<id>/` holds one file per photo; after Withdraw that folder
      is empty and `withdrawn_at` is set.
- [ ] **Stop:** `npm run db:stop`. **Undo:** delete B's copies on the phone like any spot; `npm run db:reset` wipes
      the server side.
