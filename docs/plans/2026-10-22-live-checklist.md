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
