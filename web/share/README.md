# web/share: the link page (S9-04)

The page a send link or an invite link opens in a browser (D44/D45). Two static files, no build step, no framework:
`index.html` and `share.js`. The link carries its token in the fragment (`…/share/#t=<token>`), so the host that
serves these files never sees it. `share.js` reads it, asks the `share-preview` Edge Function for the link's JSON
(`GET <functions url>/share-preview?t=<token>`, no account, no Authorization header) and renders:

- a send link: `3 spots from @ana`, the expiry, one card per spot (name or `Untitled · <town>`, tags, a red
  `Skate stopped`, `Natural speed: Enough`, notes, photos from 10-minute signed URLs, `Open in Maps` and
  `OpenStreetMap`), and `Save to my spots`, which explains that saving needs the app (Inbox → Paste a link);
- an invite link: `@ana invited you to Downtown on HitList — open the app to join`;
- anything dead (unknown, expired, revoked, withdrawn, used, malformed or missing token): `This link doesn't work any more.`

Every field goes in with `textContent`, never HTML, and a Content-Security-Policy meta allows only `share.js`.

## Where the functions live

`index.html` has one `<meta name="hitlist-functions-url" content="http://127.0.0.1:54321/functions/v1">`: the local
stack. Hosting it for real means changing that value to the project's functions URL
(`https://<project-ref>.supabase.co/functions/v1`) and setting `EXPO_PUBLIC_SHARE_BASE_URL` in the app to where the page
is served. That is a **live step** for Michael: see `docs/plans/2026-10-22-live-checklist.md` (S9).

## Serve it locally

With the local stack running (`npm run db:start`, then `npm run db:reset`):

```bash
cd web && python3 -m http.server 8080
```

Then open `http://localhost:8080/share/#t=<token>` (the app's default `EXPO_PUBLIC_SHARE_BASE_URL` is
`http://localhost:8080/share/`, D92). From the phone, serve on the box's Tailscale address instead, point the meta tag
at `http://<tailnet address>:54321/functions/v1`, and set `PUBLIC_SUPABASE_URL` for the edge runtime so the photo URLs
are reachable too (live checklist S9). Stop the stack afterwards (`npm run db:stop`).

## Tests

`src/__tests__/web-share.test.ts` (jsdom) loads both files and stubs `fetch`: the three states, the XSS case, a
missing token (no fetch), the network failure. `share.js` copies the feature-type and natural-speed words from
`src/constants/labels.ts`; change both together.
