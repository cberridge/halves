# Halves

A small installable web app (PWA) for splitting bills between two people, along the lines of Monzo Split and Splitwise.

- Add an expense, choose who paid, and split it 50/50, by percentage or by an exact amount
- See a running balance ("Sam owes you £42.10") and settle up
- Edit or delete anything, and export everything to CSV
- Both phones stay in sync in real time (Firebase), and the app works offline
- Installs to the home screen on iPhone and Android
- No build step: plain HTML, CSS and JavaScript modules

Try it without any setup: run `npm run serve` and open <http://localhost:8000/?demo>.

---

## Setup (about 15 minutes, one-off)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project**. Name it e.g. `halves`. You don't need Google Analytics.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database.** Pick a location in Europe, e.g. `europe-west2` (London). You can't change this later. Start in **production mode**.
4. In Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
5. **Project settings** (the cog) → **Your apps** → click the **`</>`** (Web) icon → register an app called `halves`. You don't need Firebase Hosting.
   Copy the `firebaseConfig` values it shows into [`js/config.js`](js/config.js).

Everything Halves uses is on Firebase's free Spark plan. Two people splitting bills will use a tiny fraction of the free quota.

### 2. Put it on GitHub Pages
1. Create a new GitHub repository, e.g. `halves`. It can be private if you have GitHub Pro; on a free account Pages needs a public repo. The Firebase config being public is fine: access is controlled by sign-in and the security rules.
2. From this folder, push it:
   ```bash
   git init -b main && git add -A && git commit -m "Halves v1"
   git remote add origin git@github.com:cberridge/halves.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**, set **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, and save. After a minute it's live at `https://<you>.github.io/halves/`.
4. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `<you>.github.io`.

### 3. Install on your phones
1. On your phone, open the URL, **create an account**, and tap **Start**.
2. Tap **Share invite link** and send it to your partner. She opens it, creates her account, and the code is already filled in, so she just taps **Join**.
3. Install it on each phone:
   - **iPhone:** open it in Safari → Share → **Add to Home Screen**
   - **Android:** open it in Chrome → ⋮ menu → **Install app** (or tap the in-app banner)

## Deploying updates
1. Change the files and bump `VERSION` in `sw.js` (e.g. `halves-v2`) so installed apps pick up the new version.
2. Commit and push. GitHub Pages redeploys automatically.
3. The app updates the next time it's opened. Sometimes it needs a second open, because the service worker serves the cached copy first.

## Project layout
```
index.html               App shell plus the sheets for adding expenses and settling up
css/styles.css           All styles (light and dark)
js/app.js                UI: rendering, forms, events
js/money.js              Pure money logic in integer pence (unit tested)
js/firebase-backend.js   Auth and Firestore (SDK loaded from Google's CDN)
js/demo-backend.js       In-memory fake backend, used with ?demo
js/config.js             Your Firebase config
sw.js                    Service worker (offline app shell)
firestore.rules          Security rules: paste into the Firebase console
tests/money.test.js      Run with `npm test` (Node 18+)
docs/SPEC.md             Product spec and roadmap
CLAUDE.md                Guidance for Claude Code when working on this repo
```

## How the data works
- `households/{id}` contains `members: [uid, uid]` and `names: {uid: "Chris"}`. The household ID is also the invite code.
- `households/{id}/entries/{id}` contains `{ kind: "expense" | "settlement", description, amount, paidBy, shares, split, date }`.
  - `amount` and `shares` are **integer pence**. `shares` says how much of the amount is each person's responsibility, and the shares always add up to `amount`.
  - A settlement where A pays B £20 is stored as `paidBy: A, shares: { B: 2000 }`.
- Balance per person = what they paid − their shares. A positive balance means they are owed money.
