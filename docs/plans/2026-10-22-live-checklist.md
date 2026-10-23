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
- [ ] **Host `web/share/`** (static, no build command; any static host works. The commands below use Cloudflare
      Pages through `npx wrangler`, nothing to install in the repo; Vercel: `npx vercel deploy <dir>` the same way).
      1. Make the hosted copy (never commit the edited meta):
         `rm -rf /tmp/hitlist-share && mkdir -p /tmp/hitlist-share/share && cp web/share/index.html web/share/share.js /tmp/hitlist-share/share/`
         `sed -i 's#http://127.0.0.1:54321/functions/v1#https://<ref>.supabase.co/functions/v1#' /tmp/hitlist-share/share/index.html`
         Check: `grep -c 'https://<ref>.supabase.co/functions/v1' /tmp/hitlist-share/share/index.html` prints `1`, and
         `grep -c 127.0.0.1 /tmp/hitlist-share/share/index.html` prints `0`. The CSP's `connect-src`/`img-src` must allow
         `https://<ref>.supabase.co` (the committed meta allows `http:`/`https:`; check it still does).
      2. Dry run: `npx wrangler pages project list` (log in once with `npx wrangler login`); nothing is created. Then `npx wrangler pages project create hitlist-share --production-branch main` (an empty project).
      3. Preview: `npx wrangler pages deploy /tmp/hitlist-share --project-name hitlist-share --branch preview` → a
         `https://preview.hitlist-share.pages.dev` URL. Open `<preview>/share/#t=AAAAAAAAAAAAAAAAAAAAAA` →
         `This link doesn't work any more.` Then a real link: `EXPO_PUBLIC_SHARE_BASE_URL=<preview>/share/` in
         `.env.local`, restart Metro, Copy link on the phone, open it in Safari → the spots and photos show; Revoke in
         Sent, reload → gone.
      4. Production: `npx wrangler pages deploy /tmp/hitlist-share --project-name hitlist-share --branch main` (or a
         custom domain in the Cloudflare dashboard), then `EXPO_PUBLIC_SHARE_BASE_URL=https://<domain>/share/` (keep the
         trailing slash) in `.env.local` / the EAS build's env. Check the host's request log: requests show `/share/`
         with no `t=` (the token is in the fragment and never reaches the host).
      **Undo:** `npx wrangler pages project delete hitlist-share`; links already sent then fail to load (the app is
      unaffected); revert `EXPO_PUBLIC_SHARE_BASE_URL`.
