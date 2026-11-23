# ❄️ Les 3 Vallées snow

A passive snow dashboard for **Courchevel, Méribel, Les Menuires and Val Thorens**: open it when you
want to know how much snow there is and when more is coming. No accounts, no notifications.

## What's on the page

- **3D terrain of Les 3 Vallées** — real elevation, slowly orbiting (drag to look around), shaded
  white above the estimated snow line, with a pin per resort showing its depth and the next 72h of
  snow. Falling snow over the view when the forecast says it's snowing right now.
- **A card per resort** — the ski patrol's measured depth (and their "higher up" estimate), how old
  that reading is, new snow in the last 24h, the next 24h/72h forecast at the top and in the village,
  and a side-on mountain profile with depth at each altitude, the snow line and the freezing level.
- **When the snow arrives** — a heatmap of snowfall every 6 hours, top and village of each resort,
  from two days ago to a week ahead.
- **Season so far** — measured depth at each resort since 1 September.

| | Source | Notes |
|---|---|---|
| Measured depth | Météo-France snow stations, read by each resort's ski patrol | Once or twice a day in season. Early/late season the readings can be days apart — the page shows their age, flags anything over 36h as *Old reading*, and treats anything over 3 weeks as last season's. |
| Forecast, model depth, freezing level | Open-Meteo | At each resort's village and summit. |
| Snow line | Estimated from the two above | Halfway between the highest bare point and the lowest covered one. |
| 3D terrain | AWS Terrain Tiles, rendered with MapLibre GL | Loaded from public CDNs, no key. |

## Deploy (one time)

Vercel → **Add New → Project → import `Snow-Forecast`**. Framework preset: *Other*, no build
command, no output directory. Deploy. That's it — no environment variables are required.

Optional: `OPEN_METEO_API_KEY`, only if the free Open-Meteo tier ever runs out (below).

On your phone, open the site and **Add to Home Screen**; it opens full-screen like an app.

## How it works

```
index.html        page shell + styles (dark theme)
js/app.js         fetches /api/snow and renders everything
js/map3d.js       the 3D terrain map (MapLibre GL 5.24.0 from unpkg)
js/charts.js      heatmap, season chart, mountain profiles (plain SVG)
js/snowfall.js    falling-snow canvas (off for prefers-reduced-motion)
api/snow.js       GET /api/snow → the report (CDN-cached 30 min; ?fresh=1 skips it)
lib/resorts.js    the 4 resorts: station ids + forecast points (shared by server and page)
lib/nivo.js       Météo-France station CSV → latest reading + season history per station
lib/openmeteo.js  Open-Meteo → past/next snowfall, depth, 6-hour blocks, daily series
lib/snow.js       combines both sources + estimates the snow line
```

**Open-Meteo's free tier** is 10,000 calls a day *per IP*, and Vercel's outbound IPs are shared with
other sites, so the report is cached at the CDN (at most ~2 upstream calls an hour, however often
you open it). If the page ever says *"Daily API request limit exceeded"*, the patrol readings and
the map still show; setting `OPEN_METEO_API_KEY` (paid plan) switches to the dedicated endpoint.

## Develop

```bash
npm run dev    # http://localhost:3000 — static files + api/ functions, zero dependencies
npm test       # node:test, zero dependencies
```

Third-party code and data licences: see [NOTICE](NOTICE).
