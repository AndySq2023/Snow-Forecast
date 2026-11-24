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
- **Live** — Windy's own forecast map over Les 3 Vallées (New snow by default; switch to Snow
  depth, Wind or Freezing level, with Windy's 12h–5 day timeline), and a live webcam at each resort
  with a link to today's timelapse.
- **When the snow arrives** — a heatmap of snowfall every 6 hours, top and village of each resort,
  from two days ago to a week ahead.
- **Season so far** — measured depth at each resort since 1 September.

| | Source | Notes |
|---|---|---|
| Measured depth | Météo-France snow stations, read by each resort's ski patrol | Once or twice a day in season. Early/late season the readings can be days apart — the page shows their age, flags anything over 36h as *Old reading*, and treats anything over 3 weeks as last season's. |
| Forecast, model depth, freezing level | Open-Meteo | At each resort's village and summit. |
| Snow line | Estimated from the two above | Halfway between the highest bare point and the lowest covered one. |
| 3D terrain | AWS Terrain Tiles, rendered with MapLibre GL | Loaded from public CDNs, no key. |
| Live map | Windy.com embed | Windy's official embeddable map, no key. Its snow scale is in inches/feet — the embed has no setting for snow units. |
| Webcams | Windy Webcams API, free tier | Needs a free key (below). |

## Deploy (one time)

1. Vercel → **Add New → Project → import `Snow-Forecast`**. Framework preset: *Other*, no build
   command, no output directory.
2. **Settings → Environment Variables:** add `WINDY_WEBCAMS_KEY` = a free key from
   [api.windy.com/keys](https://api.windy.com/keys) (sign in with your Windy account → create a
   *Webcams API* key). Your Windy Premium subscription isn't needed and doesn't change anything here.
   Without the key the site works, and the webcam strip says it needs one.
3. Deploy (or redeploy, if you added the key afterwards).

Optional: `OPEN_METEO_API_KEY`, only if the free Open-Meteo tier ever runs out (below).

On your phone, open the site and **Add to Home Screen**; it opens full-screen like an app.

## How it works

```
index.html        page shell + styles (dark theme)
js/app.js         fetches /api/snow and renders everything
js/map3d.js       the 3D terrain map (MapLibre GL 5.24.0 from unpkg)
js/charts.js      heatmap, season chart, mountain profiles (plain SVG)
js/snowfall.js    falling-snow canvas (off for prefers-reduced-motion)
js/live.js        Windy map embed + layer switch, webcam strip (refreshes every 8 min)
api/snow.js       GET /api/snow → the report (CDN-cached 30 min; ?fresh=1 skips it)
api/webcams.js    GET /api/webcams → one camera per resort (CDN-cached 4 min)
lib/webcams.js    Windy Webcams API → picks the camera for each resort
lib/resorts.js    the 4 resorts: station ids + forecast points (shared by server and page)
lib/nivo.js       Météo-France station CSV → latest reading + season history per station
lib/openmeteo.js  Open-Meteo → past/next snowfall, depth, 6-hour blocks, daily series
lib/snow.js       combines both sources + estimates the snow line
```

**Open-Meteo's free tier** is 10,000 calls a day *per IP*, and Vercel's outbound IPs are shared with
other sites, so the report is cached at the CDN (at most ~2 upstream calls an hour, however often
you open it). If the page ever says *"Daily API request limit exceeded"*, the patrol readings and
the map still show; setting `OPEN_METEO_API_KEY` (paid plan) switches to the dedicated endpoint.

## Webcams

Each resort shows the most popular live camera whose nearest village is that resort's (airport,
traffic and indoor cameras are skipped; so are ones silent for 48h). To pin a favourite, open it on
windy.com, take the number from its URL (`windy.com/webcams/1480513720`) and put it in that resort's
`webcams: []` in `lib/resorts.js`.

Free-tier rules the page follows: image links expire ~10 minutes after they're issued (so webcams are
fetched separately and refreshed every 8 minutes), every image links to its windy.com page, images are
never stretched, and the page shows *Webcams provided by windy.com — add a webcam*.

## Develop

```bash
npm run dev    # http://localhost:3000 — static files + api/ functions, zero dependencies
npm test       # node:test, zero dependencies
```

Third-party code and data licences: see [NOTICE](NOTICE).
