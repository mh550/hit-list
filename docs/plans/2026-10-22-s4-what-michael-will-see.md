# S4: what Michael will see (accounts screens)

Captured by rendering each screen from scratch in a temporary Jest test (fake Supabase client, deleted before the commit)
and walking the tree for visible text, `accessibilityLabel`, role, state and placeholder. Profile also shows Units and
Import Settings in every state (not repeated below): "Units" (Imperial/Metric buttons), "Import Settings", "Import radius ·
ft", the explainer, field label "Import radius in feet".

## Profile (Account section on top)

| State | Visible text | Controls (label / role) |
|---|---|---|
| Unconfigured (no `.env.local`) | `Account` · `Accounts aren't set up in this build` | none (no Sign in) |
| Signed out | `Account` · `Sign in to back up your spots and share them` · `Signing in uploads the spots already on this phone to your account. Nothing is deleted.` | `Sign in` (button) |
| Signed in | `Account` · `@ana` · `Ana B` · `ana@example.com` | `Sign out`, `Delete account` (buttons) |
| Signed in, no display name | same, without the display-name line | same |

Busy/error text: `Deleting…` on the Delete button; `Couldn't delete the account. Try again.` in place.
Delete alert: title `Delete your account?`, message `Your spots, photos, hit lists and sends are deleted from the server. Spots on this phone stay until you remove them.`, buttons Cancel / Delete.

## Sign-in screen (sheet)

- Heading (role header): `Sign in to HitList`; `We'll email you a 6-digit code. No password.`
- Email field: label `Email`, placeholder `you@example.com`.
- `Send code` (button): disabled while the email is empty, enabled once typed; `Sending…` while busy.
- Errors in place: the server's message, or `Couldn't send the code. Check your connection and try again.` offline.

## Code screen

- `Enter the code we sent to ana@example.com`
- Field: label `Code`, placeholder `123456`, number pad, 6 digits, one-time-code autofill. Six digits verify on their own.
- `Checking…` while verifying; wrong code shows its error in place, field stays editable.
- Buttons: `Resend code` (shows `Sending…`, then `Sent` for 3 s), `Use a different email`.

## Username screen (no back button, no swipe down)

- Heading (role header): `Pick your @username`; a visual `@` prefix.
- Fields: `Username` (placeholder `username`), `Display name` (placeholder `Ana B`, max 50), helper `Optional. Shown to friends.`
- `Done` (button): disabled until the name is valid; `Saving…` while busy.
- `Sign out` (ghost button, added in S4-08): `Signing out…`, then the Profile tab, signed out. With no account the
  screen shows only `Signed out. Sign in again from Profile.` and `Back to Profile`.

| Input | Message under the field (live region, polite) | Done |
|---|---|---|
| (empty) | none | disabled |
| `ab` | `At least 3 characters` | disabled |
| `Ana Rider!` | `Only letters, numbers, _ and .` | disabled |
| `ana_rides` | none | enabled |

Save errors: taken → `That username is taken`; format → the format rule; else `Couldn't save. Try again.`

## What to tap (phone, against the box's local stack)

Same steps as `docs/plans/2026-10-22-live-checklist.md` (S4 section); in short:

1. On the box: `npm run db:start`, then `npm run db:reset` (clean accounts).
2. `cp .env.example .env.local`; set `EXPO_PUBLIC_SUPABASE_URL=http://100.88.90.97:54321` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `ANON_KEY` from `npx supabase status`. Restart Metro: `npm run start:tailscale`; open in Expo Go.
3. Profile: the "Sign in to back up…" copy → `Sign in` → email → `Send code`.
4. **The code appears in Mailpit**, `http://100.88.90.97:54324` (port 54324; nothing is really emailed). Open the newest message, read the 6 digits, type them (or use the keyboard suggestion bar).
5. New email → `Pick your @username` (try `ab`, then a free name; Next goes to Display name) → `Done`. Profile shows `@name`, display name, email.
6. `Sign out` (spots stay on the phone), sign in again: same @username, not asked again.
7. `Delete account` → alert → `Delete`: the server deletes the account, your uploaded photos and sends (Studio `http://100.88.90.97:54323` → Authentication shows no user); you are signed out; spots on the phone are untouched. Offline, it says `Couldn't delete the account. Try again.` and you stay signed in.
8. `npm run db:stop`. Undo: delete `.env.local`.

## Verification record (2026-10-23)

- `npx jest --silent`: 75 suites, **1062 tests passed**, zero `console.error` (silent run, no failures).
- `npm run test:integration` (local stack: db:start, db:reset): **17 passed**; stack stopped after (`db:stop`, no supabase_* containers left).
- `npx expo export --platform ios --output-dir /tmp/hl-export`: **exit 0**, entry bundle 5,021,702 bytes (~5.0 MB hbc).
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green (check.sh).
