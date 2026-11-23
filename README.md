# ❄️ Les 3 Vallées snow

Live snow depths and new-snow alerts for **Courchevel, Méribel, Les Menuires and Val Thorens**.
A single page on Vercel: open it when you want, add it to your phone's home screen, and get a
push notification when it snows.

## What it shows

| | Source | Notes |
|---|---|---|
| **Measured depth** | Météo-France snow stations, read by each resort's ski patrol | Once or twice a day in season. Early/late season the readings can be days apart — the page shows the reading's age, flags anything over 36h as *Old reading*, and hides last season's. Also shows the patrol's "higher up" estimate when given. |
| **New snow 24h** | The patrol's snow board if the reading is recent, otherwise the forecast model | Labelled *measured* or *model*. |
| **Forecast** | Open-Meteo, at the village and at the top of each resort | Next 24h / 72h, model snow depth, freezing level, and a daily chart (past 2 days + next 7). |

## Alerts

A Vercel cron calls `/api/alert` every morning at 06:00 UTC (7am in France in winter). If a
resort passes a threshold, it sends **one** push notification through [ntfy](https://ntfy.sh)
(free, no account):

- **Fresh snow:** ≥ `ALERT_FRESH_CM` (default 15) cm in the last 24h
- **Snow on the way:** ≥ `ALERT_FORECAST_CM` (default 20) cm forecast over the next 72h at the top

The page shows the same alerts as a banner, from the same code.

## Deploy (one time, ~5 minutes)

1. **Vercel → Add New → Project → import `Snow-Forecast`.** Framework preset: *Other*. No build
   command, no output directory. Deploy.
2. **Pick an ntfy topic.** Topics are public-by-name, so make it unguessable, e.g.
   `3v-snow-` followed by a few random words. Install the **ntfy** app (iOS/Android), tap **+**, and
   subscribe to that topic.
3. **Vercel → Project → Settings → Environment Variables:**

   | Name | Value |
   |---|---|
   | `NTFY_TOPIC` | your topic from step 2 |
   | `CRON_SECRET` | any long random string (stops anyone else triggering your alerts) |
   | `ALERT_FRESH_CM` | optional, default `15` |
   | `ALERT_FORECAST_CM` | optional, default `20` |
   | `SITE_URL` | optional, the URL tapping a notification opens (defaults to the deployment) |
   | `OPEN_METEO_API_KEY` | optional, only if the free Open-Meteo tier ever runs out (see below) |

   Then **redeploy** so the functions pick them up.
4. **Test the notification:**
   `curl -H "Authorization: Bearer <CRON_SECRET>" "https://<your-site>/api/alert?test=1"`
   (`?dry=1` shows what would be sent without sending.)
5. On your phone, open the site and **Add to Home Screen**.

## How it works

```
index.html        the whole page (no framework, no build)
api/snow.js       GET /api/snow  → the report (CDN-cached 30 min; ?fresh=1 skips it)
api/alert.js      GET /api/alert → cron: push to ntfy when a threshold is passed
lib/resorts.js    the 4 resorts: station ids + forecast points
lib/nivo.js       Météo-France station CSV → latest reading per station
lib/openmeteo.js  Open-Meteo → past/next snowfall, depth, daily series
lib/snow.js       combines both + decides alerts (shared by page and cron)
```

**Open-Meteo's free tier** is 10,000 calls a day *per IP*, and Vercel's outbound IPs are shared
with other sites, so the report is cached at the CDN (at most ~2 upstream calls an hour, however
often you open it). If you ever see *"Daily API request limit exceeded"* on the page, the station
readings still show; setting `OPEN_METEO_API_KEY` (paid plan) switches to the dedicated endpoint.

**Vercel Hobby plan** allows cron jobs once a day, which is why the alert is a morning check. On
Pro you can change the schedule in `vercel.json` (e.g. `"0 */3 * * *"`), but you'd then get the
same alert repeated while the snow is still within the 24h/72h window.

## Develop

```bash
npm run dev    # http://localhost:3000 — static files + api/ functions, zero dependencies
npm test       # node:test, zero dependencies
```

Third-party code and data licences: see [NOTICE](NOTICE).
