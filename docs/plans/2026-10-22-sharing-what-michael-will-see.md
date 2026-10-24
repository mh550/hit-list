# Sharing, start to finish: what Michael will see

One walk through the whole accounts-and-sharing feature on the phone with **two riders** (call them A = `@ana_test`
and B = `@ben_test`). Nothing here has been run on the phone; each step says what to tap and what should happen.
Words: **Send** = a one-time copy, **Share** = a live hit list (D34). Per-milestone detail (every state and label):
[S1](2026-10-22-s1-what-michael-will-see.md) · [S2](2026-10-22-s2-what-michael-will-see.md) ·
[S4](2026-10-22-s4-what-michael-will-see.md) · [S5](2026-10-22-s5-what-michael-will-see.md) ·
[S6](2026-10-22-s6-what-michael-will-see.md) · [S7](2026-10-22-s7-what-michael-will-see.md) ·
[S8](2026-10-22-s8-what-michael-will-see.md) · [S9](2026-10-22-s9-what-michael-will-see.md).
(S3 is the server only and S10 is the sweep: neither has a screen.) The commands to get the stack and `.env.local`
ready are in [the live checklist](2026-10-22-live-checklist.md) (S4 section).

## 0. Before you start
1. On the box: `npm run db:start`, `npm run db:reset`. Put the Tailscale URL and anon key in `.env.local`
   (checklist, S4). `npm run start:tailscale`, open in Expo Go.
2. Have a few spots with photos on the phone already. Mailpit (`http://<box>:54324`) shows the sign-in codes.

## 1. Make a hit list and an area list (signed out)
1. Lists tab → **+ New hit list** → name it `Downtown` → you land on the empty list.
2. Spots tab → **Select** → tick three spots → **Add to list (3)** → tick `Downtown`. The Lists row now reads 3 spots.
3. Lists tab → **Pick an area**. Drag the map under the centre pin, tap a radius chip, watch the count change.
   **Save as hit list** → **Keep it updated**. A list titled with "Area · 2 mi of …" appears; its spots can't be removed
   by hand (they follow the circle).

## 2. Sign in with the code, see Backed up
1. Profile → **Sign in** → your email → **Send code**. Open Mailpit, read the six digits, type them.
2. New email: pick an `@username` (3+ characters) and a display name. The tabs show again.
3. Within a few seconds Profile says **Backed up · just now**. Every spot is still on the Spots tab.

## 3. Add a friend by username (two riders)
1. Make B first: Profile → Sign out → **Keep** → sign in with a second email → pick `@ben_test` → sign out (Keep).
2. As A: Profile → **Friends** → type `@ben_test` → **Add**. "Request sent to @ben_test"; a **Requests sent** row.
3. Sign out (Keep), sign in as B. The Inbox tab has a badge **1**: "@ana_test wants to be friends" → **Accept**.
   Profile reads **Friends · 1**. Switch back to A: B is in A's Friends.

## 4. Send a spot and save it on the other side
1. As A: open a spot with a photo → the paper-plane (top right) → tick `@ben_test` → **Send**.
   The sheet says they get a copy as it is now; "Sent to @ben_test".
2. Rename that spot on A. Switch to B: Inbox shows "@ana_test sent you 1 spot" with the photo, and the **old** name.
   **Save all** → "Saved 1 spot". It is in B's Spots tab, "From @ana_test" under the title, photos included.
3. Profile → **Sent** (as A): the row reads **Saved**, no Withdraw.

## 5. Share a list, join, add on both sides, leave
1. As A (Backed up): `Downtown` → **Share list** → tick `@ben_test` → **Can add spots** → **Share**. The member strip
   appears and the Lists row gets a "2" badge.
2. As B: Inbox → "@ana_test invited you to Downtown (3 spots)" → **Join** → "Joined Downtown" → **Open**. The three
   spots show (photos load as you scroll); there is no Edit, no Send; **Save a copy** works.
3. Live both ways: A renames a spot; B pulls down on Spots and sees it. B adds one of B's spots to `Downtown`
   (alert "Everyone in Downtown (2) will see this spot." the first time only); A pulls and sees "@ben_test's spot".
4. B → Downtown → member strip → **Leave list** → **Leave**. After one pull Downtown is gone from B's Lists and A's
   spots are gone from B's Spots; A's list keeps everything.

## 6. Copy a link and open it in Safari; revoke it
1. As A: select two spots → **Send (2)** → **Copy link instead** → pick **7 days** → **Copy link** → "Link copied".
   (This needs the page served and `EXPO_PUBLIC_SHARE_BASE_URL` set: checklist, S9 "Local first".)
2. Open Safari on the phone, paste it. The page shows the two spots and their photos, no sign-in.
3. Profile → Sent → **Links** → **Revoke** on that row. Reload Safari: "This link doesn't work any more."

## 7. The sign-out prompt
Profile → **Sign out**. The app backs up first (up to ~10 s), then asks **Keep** (spots stay on this phone) /
**Remove** (this account's spots leave the phone) / **Cancel**. With changes still waiting it says "N changes aren't
backed up yet" with Cancel / Sign out anyway. After Keep, other riders' spots (from shared lists) are gone; yours stay.

## 8. Delete account
Profile → **Delete account** → **Delete**. You land signed out and your spots are still on the phone (they become
phone-only). In Studio (`http://<box>:54323`) → Authentication no longer lists that email. Offline it says "Couldn't
delete the account. Try again." and you stay signed in.

## If something is off
- **Nothing works / "Accounts aren't set up in this build"**: the stack isn't running or `.env.local` is missing.
  `npx supabase status` should list the services; `curl -s http://<box>:54321/auth/v1/health` answers JSON. Restart Metro
  after any `.env.local` change.
- **No code arrives**: codes only appear in Mailpit (`http://<box>:54324`), nothing is really emailed. If the email has a
  link but no digits the template lacks `{{ .Token }}` (checklist S4).
- **"N changes not backed up"**: Profile → **Retry**. If it stays, check the network and Studio; rows wait in the
  outbox and nothing is lost. Sending and sharing refuse until a spot or list is backed up.
- **A shared spot isn't showing**: pull down on the Spots tab (sync also runs on open and every 5 minutes).
- **Link page empty**: the Python server isn't running, or the meta tag URL / `EXPO_PUBLIC_SHARE_BASE_URL` is wrong.
- **A function you edited doesn't change**: `docker restart supabase_edge_runtime_hit-list`.
- When done: `npm run db:stop`. Wipe the server side with `npm run db:reset`.
