# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**matcards** — vanilla PWA for English spaced repetition. No build step, no bundler, no npm runtime dependencies. The README has the full feature/algorithm/setup story; this file only flags the things you wouldn't catch from a skim.

## Working with the app

Static file server, that's the whole thing:

```bash
python -m http.server 8000
# or
npx serve -p 8000
```

Open `http://localhost:8000`. The Service Worker only registers on `localhost` or HTTPS — on a LAN IP (e.g. iPhone testing) the UI still works but SW won't register and offline/install behavior is disabled.

There is **no build, no lint, no test suite**. Don't invent `npm test` or `npm run build` — they don't exist. Iterate by reloading the browser. To force a SW refresh after editing app-shell files, bump `CACHE_NAME` in `sw.js` (currently `matcards-v16`).

Tools under `tools/` are the only place with npm deps (`tools/package.json` — `adm-zip`, `sql.js`). They are dev-only converters/utilities, not part of the runtime.

```bash
cd tools && npm install               # one-time
node tools/apkg-to-matcards.js --input=deck.apkg --level=b1   # CLI .apkg → JSON
node tools/csv-to-matcards.js --input=words.csv --level=b1    # CSV → JSON
node tools/dedup-decks.js [--apply]                            # mark cross-deck dups
node tools/render-icons.js                                     # SVG → PNGs via headless Chrome
```

Note: `tools/apkg-to-matcards.js` is largely redundant with the in-app converter (`js/apkg-import.js`, lazy-loads `vendor/sql-wasm.*` + `vendor/jszip.min.js`). Prefer the in-app path when possible; the CLI tool is kept for batch / offline use.

## Deploy

GitHub Pages serves `main` at the repo root — pushing to `main` deploys. Firebase Hosting is an alternative (`firebase deploy --only hosting`). Firestore rules deploy via `firebase deploy --only firestore:rules`.

## Architecture in one screen

- **Entry**: `index.html` → `js/app.js` (hash router). Routes match `location.hash` against regex in `app.js`; views in `js/views/*.js` render into `#content`. Modal routes (`#/review`, `#/placement`, `#/history`) hide the tab bar.
- **Storage**: IndexedDB `flashcards-db` v1, five stores — `decks`, `cards`, `reviews` (keyPath `cardId` — 1:1 with cards, not its own id), `sessions`, `settings`. Wrapper in `js/db.js`.
- **SRS** (`js/srs.js`): SM-2 with Anki-style learning steps. State machine `new → learning → review ⇄ lapsed`. Quality codes are **`0` Again, `3` Hard, `4` Good, `5` Easy** (not 0/1/2/3 — SM-2 legacy). Review intervals are floored monotonically (`Math.max(card.interval + N, Math.ceil(...))`) — never let an interval shrink.
- **Placement** (`js/lextale.js`): yes/no LexTALE mechanic over CEFR-J wordlist. Per-level `adjusted = max(0, hitRate − falseAlarm)`; CEFR level = highest L with `adjusted ≥ 0.5`. Flags `unreliable` when `falseAlarm > 0.4`.
- **Sync** (`js/cloud-sync.js`): Firebase anonymous auth, writes a single doc per UID at `users/{uid}/backup/current`. Auto-push fires at end of each review session (best-effort, swallows errors into a `cloudLastSyncError` setting). Cross-device migration is **intentionally** manual export/import — don't propose Google linking or popup-based flows; iOS Safari blocks popups in PWA standalone (see `js/firebase.js` header comment and README "Sync na nuvem").
- **TTS** (`js/tts.js`): Web Speech API. iOS requires a user-gesture for the first `speak()`; `warmupTTS()` is called from the reveal-answer click. Voices load async — check `getVoices().length` before listing.

## Things you'll trip over

- **`sw.js` APP_SHELL is hand-maintained.** Adding a new JS module, view, deck JSON, or icon means appending to that array AND bumping `CACHE_NAME`. Forgetting either means the new file isn't pre-cached and won't work offline.
- **Adding a built-in deck = three edits**: drop the JSON in `data/`, add an entry in the `available` array in `js/views/decks.js` (id, file, name, level), and append the path to `sw.js` APP_SHELL. The deck only appears in the UI after the user clicks "Importar" on the Decks screen — built-ins are not auto-installed.
- **Built-in vs imported flag**: `importDeckFromJSON` sets `builtIn: Boolean(json.id)`. Any JSON with a stable `id` is treated as built-in (`deck-a1-builtin`, `imported-phrasal-550-p1`, etc.). UUIDs get assigned only when `json.id` is absent.
- **Firebase API key in `js/firebase.js` is public by design** — Web SDK keys are not secrets ([Firebase docs](https://firebase.google.com/docs/projects/api-keys)). Security comes from Firestore rules + Authorized domains. The GitHub secret scanner flags it as a false positive; dismiss as "Used in tests". Do not rotate it as if it were leaked, and do not refactor it out into env vars (there's no build to inject them).
- **`js/github-sync.js` + `js/sync-runner.js` are dormant.** They were an alternate sync path; no UI in `settings.js` currently exposes the `githubRepo`/`githubToken` settings. The active cloud path is Firestore via `cloud-sync.js`. Don't delete them blind, but also don't assume they're hooked up.
- **`importExport.js` strips sensitive settings on export** (`SENSITIVE_SETTING_KEYS`) and preserves local-only settings on import (`LOCAL_ONLY_SETTING_KEYS`). If you add a new setting that holds a token, sync state, or device-specific config, add it to one or both lists.
- **Backup `version` field is `1`** and `importAll` rejects unknown future versions. Any schema-changing import format needs a version bump + a migration path.
- **IndexedDB `DB_VERSION` is 1** with no migration logic. Adding/changing object stores requires bumping the version and extending `onupgradeneeded`.
- **`reviews` keyPath is `cardId`**, so one card = one review record. Don't try to put multiple review records per card.
- **No automated tests anywhere.** Verify changes by running the app in a browser and exercising the relevant flow (placement, review, deck import, settings export/import). For SRS changes, `window.__srs` is exposed in `srs.js` for console poking; `window.__app.navigate(hash)` works for router debugging.

## UI/voice rule

User-facing strings (`index.html`, `manifest.webmanifest`, `js/views/*`, `js/lextale.js`, alerts/errors) follow a deliberate voice: expert-first, technical, zero emojis (`▶`/`✓`/`✕` allowed), formal "você", "matcards" always lowercase, short declarative sentences, errors phrased as diagnostic + action. Tone target is Linear/Stripe/Anki, not a cheery education app. **This does not apply to deck content** in `data/deck-*.json` — translations of educational content are content, not chrome.

## Pre-existing decisions worth respecting

These are settled, not open questions:

- **PWA over native** — single codebase, install-from-Safari, offline by default.
- **Vanilla over framework** — no React/Vue/Svelte. The app is small enough that a framework's cost > benefit.
- **SM-2 over FSRS** — FSRS needs ~100+ historical reviews to calibrate; SM-2 works from day one. Roadmap item, not a current task.
- **Manual export/import for cross-device** — see Sync section above. iOS PWA + Google popup is a closed door.
- **Firestore single-doc backup** — last-writer-wins, no per-record merging. Fine for solo user across their own devices; not designed for concurrent multi-device study.
