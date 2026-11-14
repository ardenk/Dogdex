# Dogdex

_Gotta pet 'em all_

A collection game for the dogs you meet. Log a dog in a couple of taps, learn and practice breed ID, and earn badges. Think Pokédex, but for real dogs around town.

A **React + Vite + TypeScript** app. Everything is stored on your device in IndexedDB first. Optionally, signing in backs it up and syncs it across devices through Supabase (see below).

## Quick start

You need **Node 20 or newer** (this project was built on Node 22).

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The app is designed phone-first, so in desktop Chrome open DevTools and switch on the device toolbar (Cmd+Shift+M), or just narrow the window.

### Installing Node

If `node -v` says "command not found":

- **Easiest:** download the macOS installer from <https://nodejs.org> (choose LTS).
- **On this machine** Node 22 was unpacked into `~/.local/node` (no admin rights, no changes to your shell profile). To use it in a terminal, run this once per terminal window, or add it to `~/.zshrc`:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

### Other scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run dev:phone` | Same, over **HTTPS on your Wi-Fi network** so a phone can use it (see below) |
| `npm run build` / `npm run preview` | Production build / serve it locally |
| `npm test` | Unit and accessibility tests (Vitest) |
| `npm run validate:data` | Checks the editable data files |
| `npm run check` | Type-check, lint, validate data, run tests |

## Trying it on your phone

Camera, geolocation, and the share sheet only work in a *secure context*. `localhost` counts; your computer's Wi-Fi address (`http://192.168.x.x`) does not. So:

1. Put your phone and computer on the same Wi-Fi.
2. Run `npm run dev:phone`. Vite prints a `https://192.168.…` **Network** URL.
3. Open that URL on your phone. The browser warns about the self-signed certificate (this is expected for local development): choose to continue anyway.
4. **Add to Home Screen** (Share menu on iPhone Safari, ⋮ menu on Android Chrome) for a full-screen app that works offline. Offline support is enabled in production builds only (`npm run build && npm run preview`).

Data on a phone is separate from data on your computer. Use **You → Export backup** to move it.

> The Expo Go instructions from the original brief no longer apply: we switched to a React + Vite web app.

## What's in the MVP

1. **Quick log:** pick a breed (search, recents, or a full grouped list) and save. A photo, name, owner, note, time and neighborhood are all optional. Two taps for the simplest case. For a photo, choose **Take photo** (opens the camera) or **From library** (pick one you already have).
   - **A breed that isn't in the list:** type it, choose **Not listed**, and pick which category it belongs to. To fix a dog later, open it and tap **Edit → Change breed or category**. To rename a breed you added, or move all of its dogs to another category, open it from the Dogdex.
2. **Guess-first flow:** add a photo, guess the breed, then see suggestions. Whether your guess matched the breed you confirmed is recorded.
3. **Breed ID behind an interface** (`src/services/identify`). Today it's a deterministic *mock* that does not look at the dog.
4. **Dogdex:** breeds grouped by AKC group (plus "Mixed & Designer"), with silhouettes for breeds you haven't met.
5. **Dog detail** with encounter history and a **Met again** button.
6. **Breed pages:** short summary, tap for group, origin, temperament and key identifying traits.
7. **Rarity** (common ● / uncommon ◆ / rare ★), celebrated on uncommon and rare finds.
8. **Badges** from a rules file: First dog, Ten dogs, Met 10 doodles, Completed a group, 3 rare finds, Guessed 10 right.
9. **Weekly goal** (default 5, adjustable; weeks start Monday; no streaks).
10. **Share card:** a 1080×1350 PNG for a dog, shared via the system share sheet (or saved as an image where sharing isn't supported).

### Password reset

On the sign-in form, tap **Forgot your password?**, enter your email, and open the link Supabase emails you *on the same device*. It returns to the app's **You** tab, where you choose a new password (8+ characters, typed twice).

This needs two settings in the Supabase dashboard, which can't be set from the app:
1. **Authentication → URL Configuration → Redirect URLs:** add every address you open the app from, with `/**` on the end, for example `http://localhost:5173/**` and your phone-testing address `https://192.168.x.x:5175/**` (what `npm run dev:phone` prints). Add your real domain too once you deploy. A link to an address that isn't listed falls back to the **Site URL**.
2. **Email delivery:** Supabase's built-in sender is for testing. It is heavily rate-limited, and on new projects it may only deliver to members of your Supabase team. For real users, set up your own email provider (SMTP) under **Authentication → Emails → SMTP Settings**.

The app answers "If there's an account for that email…" whether or not the email exists, so the form can't be used to find out who has an account. Reset links expire; if one has, the app says so and lets you ask for a new one.

## Dog photos

A dog can have up to **12 photos**. On a dog's page, tap **Photos** to add more (**Take photo** opens the camera; **From library** lets you pick several at once), choose which one is the **cover**, or **delete** the one being shown. A strip of small photos under the main photo switches between them.

- The **cover photo** is the one shown on the Dogdex tile, in dog lists and on the share card, and it's where stickers sit (stickers are only drawn while the cover is showing).
- The first photo added becomes the cover. Deleting the cover hands the role to the next photo.
- **Deleting a photo** removes the image from this device and, if you're signed in, from your cloud backup too, and it disappears on your other devices the next time they sync. It can't be undone. A tiny record stays behind so other devices know to remove it.

## GIPHY stickers

On a dog's page, tap **Stickers → Add a sticker** to search GIPHY's animated stickers, then place it on the photo. **On a touch screen:** drag with one finger to move it, and use **two fingers** to pinch (resize) and twist (rotate) it. Moving both fingers together moves it too. The Size and Rotate sliders and the arrow keys do the same for mouse and keyboard users. You can also bring it to front or remove it. Up to 8 per dog. They show on the dog page and on the dog's thumbnail in lists, sync with the rest of your collection, and are *not* drawn on share cards (a card is a still image).

**Setup.** The GIPHY API key is a **Supabase secret**, not part of the app. The app talks to a small Edge Function called `giphy` (source in [`supabase/functions/giphy/`](supabase/functions/giphy)), which adds the key and asks GIPHY for stickers, so the key never reaches a browser.
1. Create a free app at <https://developers.giphy.com> and copy its API key.
2. In the Supabase dashboard, go to **Edge Functions → Secrets** and add `GIPHY_API_KEY_DOGDEX` with that key. (From a terminal: `supabase secrets set GIPHY_API_KEY_DOGDEX=...`.) Never put the key in `.env` or any `VITE_` variable.
3. Deploy the function (it's already deployed to this project; to redeploy after editing, run `supabase functions deploy giphy`).

**Who can use it.** Only **signed-in** users can search; the function checks their login, so the key can't be used by anonymous visitors or scripts, and each user is limited to about 60 searches a minute (best effort). Signed-out users see "Sign in to add stickers". If you'd rather let everyone search, change the sign-in check in `supabase/functions/giphy/logic.ts` (and add your own limit, since GIPHY's free key allows about 100 requests an hour in total).

**Privacy and rules**
- Searching sends your search words to your sticker function and on to GIPHY, and GIPHY sees your IP address when stickers load. The picker says so. Image requests send no page address (`referrerpolicy="no-referrer"`).
- Only GIPHY-rated **G** stickers are requested.
- Only GIPHY ids and URLs are stored, never copies of the images, and only `https` links on `giphy.com` hosts are accepted or rendered. The database enforces the same rule.
- The picker shows "Powered by GIPHY" as GIPHY's terms ask. Check their [terms](https://support.giphy.com/hc/en-us/articles/360020027752-GIPHY-API-Terms-of-Service) before shipping widely; GIPHY's brand guidelines may ask for their logo mark rather than text.
- People who prefer reduced motion see a still frame instead of the animation.

## Link previews (og-image)

`public/og-image.png` (1200 × 630) is the picture shown when the site is shared on Slack, iMessage, X, Facebook or LinkedIn; the matching tags are in `index.html`. Crawlers need an **absolute** image address, so set `VITE_SITE_URL` to your deployed address (for example `https://dogdex.example.com`, no trailing slash) in the environment where you build. Without it, the tags use relative paths: fine locally, but most previews won't show the image. After deploying, you can check the result with the platforms' own preview tools (for example Facebook's Sharing Debugger); they cache aggressively, so re-scrape after changing the image.

## Editing the content

Breeds, groups, rarity tiers and badge rules are JSON files in [`src/data/`](src/data/README.md), not code. Edit, save, and the app reloads. `npm run validate:data` catches typos such as an unknown group or rarity. The seed has 25 breeds (21 AKC breeds across all seven groups, plus 4 mixed/designer entries). The rarity tiers are subjective: adjust them to your area.

## Privacy

- **Collections are private.** Nothing leaves your device unless you share a card, or sign in to back up. Backed-up data is visible only to your account.
- **Location is coarse.** The browser's position is rounded to about 1 km *before anything else happens to it*. Only that rounded value is sent to OpenStreetMap's Nominatim service to get a neighborhood name, and only the name plus the rounded cell are stored. Raw coordinates are never saved. You can edit or clear the neighborhood on each log, or turn automatic location off in **You**.
- **Share cards leave off the neighborhood** unless you tick the box.
- **Photos are resized and re-encoded** on your device, which also strips embedded EXIF metadata such as GPS.

## How it's organized

```
src/
  data/        Editable JSON + validation (zod)          ← content lives here
  domain/      Pure logic: badges, goals, search, guess scoring (no React)
  storage/     IndexedDB (Dexie) behind a Repository interface
  services/    identify (breed ID), location, images, share card
  features/    One folder per screen
  components/  Shared UI pieces
  styles/      Design tokens + global CSS
  test/        Vitest unit + accessibility tests
```

Accessibility: 48 px tap targets, labels on every control, visible focus, live announcements for toasts, rarity shown as symbol + word (never color alone), reduced-motion respected. Text contrast is checked against WCAG AA in `src/test/contrast.test.ts`, and screens are checked with axe in `src/test/a11y.test.tsx`.

## Plugging in a real breed identifier

Implement `BreedIdentifier` (`src/services/identify/index.ts`) and call `setIdentifier(...)`. Return `[{ breed, confidence }]`; names, aliases or ids from `breeds.json` are mapped automatically and unknown labels are dropped.

| Option | Pros | Cons |
|---|---|---|
| **On-device in the browser** (Transformers.js / ONNX Runtime Web with a dog-breed classifier) | Private, free per use, works offline | 10–30 MB model download, weak on mixes and rare breeds, check the model's license |
| **Vision LLM via a Supabase Edge Function** | Best accuracy, handles mixes and "looks like" answers | Per-call cost, latency, the photo leaves the device (make it opt-in), API key must stay server-side |
| **Vision/label API** (Google Vision, Clarifai, Hugging Face Inference) | Cheap and simple | Inconsistent breed coverage, you must map labels to breeds, the photo leaves the device |

**Recommendation:** start on-device (matches the privacy-by-default principle, needs no backend), then add the cloud function as an opt-in "better ID" once Supabase exists.

## Cloud backup and sync (Supabase)

Dogdex is **local-first**: the app always reads and writes the on-device database, and works fully offline and without an account. If you sign in, a background sync copies changes to and from Supabase so your collection is backed up and shows up on your other devices.

**Setup.** The project's URL and *publishable* key are in `.env` (copy `.env.example` if you start fresh). The publishable key is safe in the browser because the database enforces who can see what. **Never** put a `service_role`/secret key in a `VITE_` variable: it would be shipped to every visitor. With both variables blank, the app runs local-only.

**What happens**
- **Sign in / create account** is on the **You** tab (email + password). On a new project, Supabase may require clicking an email confirmation link first (Authentication → Providers → Email).
- **First sign-in on a device** adopts the collection already on it and uploads it. A second device then downloads it, photos included.
- **Syncing** runs on sign-in, shortly after each change, when the app comes back into view, and when the connection returns. **Sync now** forces it.
- **Conflicts:** the most recent edit wins, decided by each record's `updatedAt`. The database applies the same rule, so an old offline edit can't overwrite a newer one.
- **A different account on the same device:** signing out clears the device, so the next person starts clean. If a device ever still holds another account's data (for example after an expired session), nothing syncs until you choose to replace it, so two collections never mix.
- **Signing out** first backs up one last time, then removes the account's collection from the device (it stays in the cloud and returns when you sign back in). If the last backup fails, for example offline, you're warned before anything is removed. **Delete everything** (You tab) also deletes the cloud copy when you're signed in.

**What is stored where.** Tables `dogs`, `encounters`, `photos`, `guesses`, `badge_awards` and `settings`, each row owned by one user and locked down with row-level security (users can only read and write their own rows; anonymous visitors get nothing). Photos live in a **private** Storage bucket, `dog-photos`, in a folder named after the owner's user id, with a 5 MB per-file limit. Only the neighborhood name and a ~1 km rounded cell are ever stored, never exact coordinates. The schema lives in the project's Supabase migrations.

**Where the code is:** `src/sync/` (`engine.ts` is the sync logic and is tested against an in-memory fake backend; `supabaseStore.ts` is the only file that talks to Supabase). Screens still use only the `Repository` interface.

Not built: deleting the account itself (the data can be deleted, the login remains), live updates between open devices (they catch up on the next sync), and sign-in with Google/Apple.

## Known limitations

- **Breed suggestions are fake.** The mock returns the same three breeds for the same photo regardless of what's in it, so guess-accuracy numbers are only meaningful once a real identifier is plugged in.
- **Browsers can clear site data**, especially Safari for sites that aren't installed. Use **You → Export backup**, and **Ask the browser to keep my data**.
- **Silhouettes** are simple per-group shapes, not per-breed art. The data model leaves room to add them.
- Neighborhood lookup needs a network connection; offline it falls back to typing a place.
- Scope cut for this MVP: no accounts or sync, social features, leaderboards, owner-claimed profiles, event mode, widgets, or family mode.
