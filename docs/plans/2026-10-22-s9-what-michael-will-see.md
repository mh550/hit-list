# S9: what Michael will see (Copy link, Sent link rows, invite links, Paste a link, the web page)

Captured by rendering each screen from scratch in temporary Jest tests (copies of the screen's test file with a tree
walker; fake Supabase client, stores set directly; the tests were deleted before the commit, `git status` clean) and
reading visible text, `accessibilityLabel`, role and state. The page text comes from the jsdom test's loaded
`web/share/` files. Live path: `docs/plans/2026-10-22-live-checklist.md` § S9. Words: **Send** = a copy, **Share/Invite**
= live (D34); a link is still a copy (D44), so the Send sheet's link mode says nothing about sharing.

## Send sheet, link mode (`SendSheet`, from `Copy link instead`)

Title `Send 3 spots`, `Cancel`, `3 spots`. Friends and the D34 sentence are hidden.

| State | Visible text | Controls (label / state) |
|---|---|---|
| Link mode | chips `1 day` · `7 days` · `30 days` · `Never`; D44 line `Anyone with the link can see these spots until it expires. No account needed to look.` | chips are buttons, `30 days` selected, others not; `Copy link` (button, enabled, not busy); `Send to friends instead` (button) |
| Link failed | same + `Couldn't make the link. Try again.` (role alert) | same |
| Success | sheet closes, toast `Link copied` | clipboard holds `<base>#t=<token>` |

`Copy link` reads `Making link…` and is busy while it runs.

## Sent screen (`app/sent`), `Links` section

Header `Links`, above or beside the friend sends. Rows (a send of 3, 1, 2, 5 spots):

| Row text | Control |
|---|---|
| `Link · 3 spots · Active until Nov 21` | `Revoke` (label `Revoke the link to 3 spots`) |
| `Link · 1 spot · Active` (never expires) | `Revoke` (label `Revoke the link to 1 spot`) |
| `Link · 2 spots · Expired` | none |
| `Link · 5 spots · Revoked` | none |

Revoke alert: `Revoke this link?` / `The link stops working now.` / `Cancel`, `Revoke`. After it the row reads `Revoked`.
Only links: no `Nothing sent yet`. No links: no `Links` header. A links load that fails keeps the friend sends under
`Couldn't reach the server. Pull to try again.`

## Members screen (`app/list/[id]/members`), owner, invite links

Below the member rows and `Invite link` (button), one row per link of this list, then `Invite` and `Stop sharing`:

| Row text | Control |
|---|---|
| `Invite link · Can add spots · Active until Oct 30` | `Revoke` (button) |
| `Invite link · View only · Used by @ben` | none |
| `Invite link · Can add spots · Expired` | none |
| `Invite link · View only · Revoked` | none |

`Invite link` asks `Invite link` / `What can they do?` / `Can add spots`, `View only`, `Cancel`; then copies the link and
toasts `Link copied · works once, 7 days`. Revoke alert: `Revoke this invite link?` / `Nobody can join with it now.` /
`Cancel`, `Revoke`. A member (not the owner) sees none of it.

## Inbox, `Paste a link`

| State | Visible text | Controls |
|---|---|---|
| Closed | `Paste a link` (then the usual `Nothing here yet` empty state) | button, `expanded: false` |
| Open | `Paste a link`, field (placeholder `Paste a HitList link`, label `HitList link`, no autocorrect/capitals), `Open` | `Open the link` button |
| Invite redeemed | `Joined Downtown` + `Open` | `Open Downtown` (→ `/list/<id>`); announced; already on the phone reads `Downtown is already in your lists`; name not yet synced `Joined the list` |
| Gone | `That link doesn't work any more` | |
| Not a link | `That isn't a HitList link` | no call made |
| Failure | `Couldn't open the link. Try again.` | |
| A send link | no text: the page opens in Safari (`<base>#t=<token>`) and the field clears | |

## The web page (`web/share/`, text from the jsdom test)

| State (`body[data-state]`) | Content |
|---|---|
| `send` (3 spots) | `<h1>` `3 spots from @ana` · `Expires Nov 21, 2026` · per spot `<h2>` `Pike Rail`, `Rail · Ledge`, `Skate stopped`, `Natural speed: Enough`, notes `Bust after 6`, photos, links `Open in Maps` (`maps.apple.com/?ll=…`) and `OpenStreetMap`; a nameless spot `Untitled · Fremont` (`Bank`); a spot at 0,0 `Nowhere` has no map links; `Save to my spots` (button; on tap: `You need HitList and an account to save these. Open the app, then Inbox → Paste a link.`) |
| `invite` | `@ana invited you to Downtown on HitList — open the app to join` |
| `gone` (404) | `This link doesn't work any more.` |
| `error` (offline / other status) | `Couldn't load this link. Try again.` |

## What to tap on the phone (all live steps in the checklist; local stack over Tailscale)

1. **Setup** (checklist § S9 "Local first"): stack up, `cd web && python3 -m http.server 8080`, the meta tag and
   `EXPO_PUBLIC_SHARE_BASE_URL=http://100.88.90.97:8080/share/` in `.env.local`, `PUBLIC_SUPABASE_URL` in `config.toml`,
   restart Metro.
2. **Copy a link:** Spots → Select three spots → `Send (3)` → `Copy link instead` → pick `7 days` → `Copy link` →
   toast `Link copied`. Open Safari on the phone, paste: the three spots and photos show. Reload with the link
   revoked (next step): `This link doesn't work any more.`
3. **Revoke:** Profile → `Sent` → under `Links` tap `Revoke` → `Revoke` in the alert → the row reads `Revoked`. Reload
   Safari: gone.
4. **Invite link:** open a shared list → member strip → `Invite link` → `Can add spots` → toast `Link copied · works once,
   7 days`; a row `Invite link · Can add spots · Active until …` appears.
5. **Paste it as the other rider:** sign in as the second rider (or a second phone), Inbox → `Paste a link` → paste →
   `Open` → `Joined <list>` → `Open <list>`. On the first phone the row reads `Used by @<them>`. Paste the same link
   again as a third rider: `That link doesn't work any more`.
6. Paste a send link in Inbox: Safari opens the page. Paste `hello`: `That isn't a HitList link`.

## Where the page must be hosted later

`web/share/` is static (no build step; output directory `web/share`), hosted next to the portfolio or on Cloudflare
Pages / GitHub Pages / Vercel, with the meta tag set to `https://<ref>.supabase.co/functions/v1` in the hosted copy and
`EXPO_PUBLIC_SHARE_BASE_URL=https://<domain>/share/` in the build. Functions deploy and staged hosting steps:
`docs/plans/2026-10-22-live-checklist.md` § S9. Q53 (which domain) is open in the spec's §9.

## Checks recorded for S9-06

- `npx jest --silent`: 107 suites, 2065 tests passed; `npx jest --ci` prints 0 `console.error` lines.
- `npm run test:integration` (after `db:start` + `db:reset`): 7 suites, 77 tests passed; `db:stop` run, no `hit-list`
  container left.
- `npx expo export --platform ios`: exit 0, 5.4 MB.
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green via `check.sh` (see the progress entry).
