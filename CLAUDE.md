# CLAUDE.md

Passive snow dashboard for Les 3 Vallées — no alerts or notifications, by the owner's choice.
Standalone project, unrelated to any other repo.

- **No build, no npm dependencies.** `index.html` + ES modules in `js/`; `api/*.js` are Vercel Node
  functions; `lib/*.js` is shared logic (`lib/resorts.js` is imported by both server and browser).
  The only third-party runtime code is MapLibre GL, pinned to an exact version on unpkg in
  `js/map3d.js`; terrain tiles are the keyless AWS Terrain Tiles. The Live section embeds Windy's
  official map iframe (`js/live.js`, no key).
- **Webcams** (`lib/webcams.js`, `api/webcams.js`) use the Windy Webcams API free tier with
  `WINDY_WEBCAMS_KEY`. Its terms are binding: image URLs expire ~10 min after the API call (keep
  `/api/webcams` cached ≤4 min, apart from `/api/snow`, and keep the page's 8-min refresh), link every
  image to `cam.link` on windy.com, never upscale/stretch images, and keep the "Webcams provided by
  windy.com — add a webcam" courtesy line next to them.
- **Dark theme only.** Colours are CSS tokens in `index.html`; resort series colours `--s1..--s4`
  are fixed to resort order (never re-assign by rank). Heatmap steps live in `js/charts.js`.
- **Data:** measured depth from the Météo-France nivo CSV (`lib/nivo.js`, ported from
  faizpuru/meteofrance-montagne, MIT — keep NOTICE up to date), forecast from Open-Meteo
  (`lib/openmeteo.js`). One source failing must still return the other (`errors[]` in the report),
  and the page must render with either missing.
- **Snow line** (`estimateSnowLine` in `lib/snow.js`) only uses trusted depths: recent patrol
  readings and the model. `snowLineKnown=false` means no data, not "no snow".
- The Open-Meteo request order is `[village, summit]` per resort and `buildReport()` relies on it.
- **Tests:** `npm test` (node:test). Pure functions take `nowMs`/`fetchImpl` so they run without
  network. Add a test for any new parsing or estimation rule.
- **Local:** `npm run dev` (sets `NODE_USE_ENV_PROXY=1`, needed for fetch behind a proxy).
