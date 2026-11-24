# Halves: notes for Claude Code

Halves is a two-person bill-splitting PWA. It's plain HTML, CSS and ES modules with **no build step and no npm runtime dependencies**. It uses Firebase Auth (email/password) and Firestore, and is hosted on GitHub Pages under a sub-path (`/halves/`).

## Commands
- `npm test`: unit tests for `js/money.js` (Node's built-in test runner)
- `npm run serve`: serve on http://localhost:8000
- `http://localhost:8000/?demo`: run the UI against the in-memory `demo-backend.js`, with no Firebase needed. Use this for any UI work.

## Rules of the codebase
- **Money is always integer pence.** Parse user input with `parsePence`, display with `formatPence`, and never do float arithmetic on pounds. All split and balance maths lives in `js/money.js` as pure functions with tests. Add a test for every behaviour change there.
- **Shares must add up to the amount exactly.** `firestore.rules` enforces this server-side, so any new entry shape has to be reflected in `validEntry()` in the rules.
- **The backend interface is shared.** `firebase-backend.js` and `demo-backend.js` export the same functions. If you add one to one file, add it to the other.
- **Relative paths only** (`./sw.js`, `icons/…`), because the app is served from a GitHub Pages sub-path.
- **Writes are fire-and-forget.** Firestore resolves writes only when the server acks them (never while offline). Don't `await` `saveEntry` or `deleteEntry` before closing a sheet. Use the `write()` helper in app.js.
- **Escape user text** with `esc()` whenever it's interpolated into HTML.
- When you change any file that's cached, **bump `VERSION` in `sw.js`**, and add new shell files to `SHELL`.
- Firebase SDK version is pinned in `firebase-backend.js` (`FB_VERSION`). Upgrade it deliberately and test sign-in, offline add, and sync.
- Keep the UI mobile-first: 48px minimum tap targets, 16px inputs (stops iOS zooming), and safe-area insets. Check light and dark mode.
- UK English in UI copy, GBP, `en-GB` dates.

## Changing Firestore rules
Rules live in `firestore.rules` and are deployed by pasting them into the Firebase console (or `firebase deploy --only firestore:rules` if the Firebase CLI is set up). Mention it in your summary whenever the rules change, because the user has to publish them.

## Verifying UI changes
Serve the app, open `?demo` at a 390×844 viewport, and click through: add expense (each split type), edit, delete, settle up, menu. Check there are no console errors.
