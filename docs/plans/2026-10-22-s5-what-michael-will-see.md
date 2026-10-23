# S5: what Michael will see

Every text below was dumped from a scratch render of `app/(tabs)/profile.tsx` (a temporary test file, deleted
afterwards) with the same mocks as `src/__tests__/profile.test.tsx`; an alert is the exact `Alert.alert(title, message,
buttons)` call.

## Profile, signed in (`@ana`, Ana B, ana@example.com)

| State | Visible text, top to bottom |
|---|---|
| Just synced | Account · @ana · Ana B · ana@example.com · **Backed up · just now** · [Sign out] · [Delete account] · Units … |
| 3 failed changes | … ana@example.com · **Backed up · just now** · **3 changes not backed up** [Retry] · [Sign out] · [Delete account] |

(1 failed change reads "1 change not backed up"; before the first sync, or with another rider's sync state: "Not backed
up yet". Retry is disabled while a sync runs. The line re-reads every 60 s: "3 min ago".)

## Alerts

| Alert | Title | Message | Buttons |
|---|---|---|---|
| Sign out, everything backed up | Keep spots on this phone? | They're backed up in your account either way. | Keep · Remove from this phone (red) · Cancel |
| Sign out, changes waiting | 3 changes aren't backed up yet (1: "1 change isn't backed up yet"; count failed: "Some changes aren't backed up yet") | Sign out anyway and they'll back up next time you sign in to this account. | Cancel · Sign out anyway (red). No Remove |
| Delete account, first ask | Delete your account? | Your spots, photos, hit lists and sends are deleted from the server. Spots on this phone stay until you remove them. | Cancel · Delete (red) |
| Delete account, after it worked | Account deleted | Your account is deleted. Keep the spots on this phone? | Keep · Remove from this phone (red) |

Sign out first tries one last backup (button reads "Signing out…", gives up after 10 s offline), then asks.

## What to tap (phone, Expo Go, local stack)

Setup: `npm run db:start`, `npm run db:reset`; `.env.local` holds the stack URL and anon key from `npx supabase status`;
`npm run start:tailscale`. Phone must have a few spots with photos before signing in.

1. Profile → Sign in → your email → six-digit code (Mailpit/Inbucket on the stack) → pick a username. The spots already
   on the phone are adopted (nothing is deleted).
2. Profile shows "Backed up · just now" within a few seconds.
3. Studio, http://100.88.90.97:54323: Table editor `spots` / `media` / `hit_lists` show the rows; Storage → `photos`
   bucket has `<your user id>/<spot id>/<media id>.jpg` files.
4. Turn on Airplane mode, add a spot. Profile: the line stays at its old time; after repeated failures it shows
   "N changes not backed up" + Retry. Turn Airplane off, tap Retry (or pull down on the Spots tab): the line returns to
   "Backed up · just now" and Studio shows the new row.
5. Pull to refresh on the Spots tab (signed in only) syncs now.
6. Sign out → "Keep spots on this phone?" → Keep. Spots stay; Profile shows Sign in.
7. Sign in with a second email (new rider): the Spots tab is empty (the first rider's rows and photo folders leave
   the phone on sign-in; they are safe in the account). If that rider still had unbacked-up changes you are asked first (D66).
8. Sign back in as the first rider: the spots return and sync.

**How to undo:** Profile → Sign out → **Remove from this phone**, then sign in again; the spots and photos download
from the account. Server side: `npm run db:reset` wipes the whole local stack.

## Checks recorded (2026-10-23)

- `npx jest --silent`: 85 suites, **1324 tests passed**; `npx jest --ci` prints 0 `console.error` lines.
- `npm run test:integration` (local stack up after `db:start` + `db:reset`): 2 suites, **29 passed**; stack stopped
  after, no `supabase_*` container left.
- `npx expo export --platform ios`: exit 0, 5.1 MB output.
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green (check.sh).
