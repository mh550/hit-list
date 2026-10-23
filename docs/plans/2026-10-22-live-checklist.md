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
      order, and nothing else (`seed.sql` is never pushed).
- [ ] **Push:** `npx supabase db push`. Check in the dashboard: Table editor shows the ten tables, each with "RLS
      enabled"; Storage shows a private bucket `photos`; Database → Functions lists `can_read_spot`, `find_profile`
      and the others from `docs/plans/2026-10-22-s3-backend.md`.
- [ ] **Smoke test with two throwaway accounts** (Auth → Add user): as user A in the SQL editor
      `select set_config('request.jwt.claims', '{"sub":"<A id>","role":"authenticated"}', true); set local role
      authenticated; select count(*) from spots;` returns only A's rows; as B, A's spot is not returned.
      Delete both users afterwards.
- **Undo:** migrations only go forward. Before any real user exists, the clean undo is to delete the cloud project
  and create a new one (nothing else depends on it). After real users exist, undo is a new migration that reverses
  the change; never edit a pushed file.
