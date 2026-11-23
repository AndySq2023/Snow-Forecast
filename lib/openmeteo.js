// Modelled snow — past snowfall, forecast snowfall and snow depth — from Open-Meteo.
//
// Free and keyless for non-commercial use (10k calls/day per IP). Vercel's
// outbound IPs are shared, so /api/snow is CDN-cached to keep our share tiny;
// set OPEN_METEO_API_KEY to use the paid customer endpoint instead.

const HOURLY = ['snowfall', 'snow_depth', 'freezing_level_height'];
const DAILY = ['snowfall_sum', 'temperature_2m_max', 'temperature_2m_min'];
export const PAST_DAYS = 2;
export const FORECAST_DAYS = 7;

export function forecastUrl(points, apiKey = '') {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat).join(','),
    longitude: points.map((x) => x.lon).join(','),
    elevation: points.map((x) => x.elevation).join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Paris',
  });
  if (apiKey) p.set('apikey', apiKey);
  const host = apiKey ? 'customer-api.open-meteo.com' : 'api.open-meteo.com';
  return `https://${host}/v1/forecast?${p}`;
}

const round = (n) => (n === null || n === undefined ? null : Math.round(n));
const sum = (arr) => arr.reduce((a, b) => a + (b ?? 0), 0);

/**
 * Summarise one Open-Meteo location object relative to `nowMs`.
 * Hourly times are local wall-clock strings ("2026-11-23T14:00"); the location's
 * utc_offset_seconds converts "now" into the same form so the two compare as strings.
 */
export function summariseLocation(loc, nowMs = Date.now()) {
  const h = loc.hourly;
  const nowLocal = new Date(nowMs + loc.utc_offset_seconds * 1000).toISOString().slice(0, 13) + ':00';
  let i = h.time.findIndex((t) => t >= nowLocal);
  if (i === -1) i = h.time.length;
  const window = (from, to) => sum(h.snowfall.slice(Math.max(0, from), Math.max(0, to)));
  const depthM = h.snow_depth[Math.min(i, h.time.length - 1)];
  const freezing = h.freezing_level_height?.[Math.min(i, h.time.length - 1)];
  const today = nowLocal.slice(0, 10);

  return {
    // Snowfall is in cm of fresh snow (not water equivalent).
    past24Cm: round(window(i - 24, i)),
    next24Cm: round(window(i, i + 24)),
    next72Cm: round(window(i, i + 72)),
    depthCm: depthM === null || depthM === undefined ? null : Math.round(depthM * 100),
    freezingLevelM: freezing === null || freezing === undefined ? null : Math.round(freezing / 50) * 50,
    daily: loc.daily.time.map((date, j) => ({
      date,
      snowfallCm: Math.round((loc.daily.snowfall_sum[j] ?? 0) * 10) / 10,
      tMax: loc.daily.temperature_2m_max?.[j] ?? null,
      tMin: loc.daily.temperature_2m_min?.[j] ?? null,
      past: date < today,
    })),
  };
}

export async function getForecast(points, { apiKey = '', nowMs = Date.now(), fetchImpl = fetch } = {}) {
  const res = await fetchImpl(forecastUrl(points, apiKey), { signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(`Open-Meteo: ${body?.reason || `HTTP ${res.status}`}`);
  }
  // One location → a single object; several → an array in request order.
  const locs = Array.isArray(body) ? body : [body];
  return locs.map((loc) => summariseLocation(loc, nowMs));
}
