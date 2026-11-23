# CLAUDE.md

Snow depths + new-snow alerts for Les 3 Vallées. Standalone project — unrelated to any other repo.

- **No build, no dependencies.** `index.html` is the whole front end (plain ES5-ish JS, inline CSS
  with light/dark tokens). `api/*.js` are Vercel Node functions; `lib/*.js` is shared logic.
- **One source of truth for alerts:** `lib/snow.js` `buildReport()`/`alertsFor()`. The page banner
  and the ntfy cron (`api/alert.js`) both read it — never duplicate threshold logic in the page.
- **Data:** measured depth from the Météo-France nivo CSV (`lib/nivo.js`, ported from
  faizpuru/meteofrance-montagne, MIT — keep NOTICE up to date), forecast from Open-Meteo
  (`lib/openmeteo.js`). One source failing must still return the other (`errors[]` in the report).
- **Resorts** live only in `lib/resorts.js`; the Open-Meteo request order is `[village, summit]`
  per resort and `buildReport()` relies on it.
- **Tests:** `npm test` (node:test). Pure functions take `nowMs`/`fetchImpl` so they test without
  network. Add a test for any new parsing or alert rule.
- **Local:** `npm run dev` (sets `NODE_USE_ENV_PROXY=1`, needed for fetch behind a proxy).
