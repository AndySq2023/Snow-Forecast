// Combines measured (Météo-France stations) and modelled (Open-Meteo) snow into
// one report per resort, plus a valley-wide snow-line estimate for the 3D map.

import { RESORTS, STATION_IDS, FORECAST_POINTS } from './resorts.js';
import { getStations } from './nivo.js';
import { getForecast } from './openmeteo.js';

// A station reading older than this is shown greyed out and not trusted for "new snow".
export const STALE_HOURS = 36;
// Older than this, a reading is last season's, not a late one from this season.
export const LAST_SEASON_HOURS = 21 * 24;
// Depth at which the ground counts as snow-covered for the snow-line estimate.
const COVER_CM = 5;
// When even the lowest point we know about is covered, the snow reaches at least this far below it.
const BELOW_LOWEST_M = 250;

/**
 * Estimate the altitude above which the ground is snow-covered, from every
 * depth we trust: recent patrol readings plus the model at villages and summits.
 * Returns null when nothing is covered. It's an estimate — the map says so.
 */
export function estimateSnowLine(points) {
  const pts = points.filter((p) => p.elevation != null && p.depthCm != null).sort((a, b) => a.elevation - b.elevation);
  const lowestCovered = pts.find((p) => p.depthCm >= COVER_CM);
  if (!lowestCovered) return null;
  const bare = pts.filter((p) => p.elevation < lowestCovered.elevation && p.depthCm < COVER_CM).pop();
  const m = bare ? (bare.elevation + lowestCovered.elevation) / 2 : lowestCovered.elevation - BELOW_LOWEST_M;
  return Math.round(m / 50) * 50;
}

/** Pure: build the report from already-fetched pieces. */
export function buildReport({ stations, forecast, errors = [], nowMs = Date.now() }) {
  const resorts = RESORTS.map((r, i) => {
    const st = stations?.[r.station] ?? null;
    const ageH = st ? (nowMs - Date.parse(st.observedAt)) / 3.6e6 : null;
    const measured = st
      ? { ...st, ageHours: Math.round(ageH), stale: ageH > STALE_HOURS, lastSeason: ageH > LAST_SEASON_HOURS }
      : null;
    const village = forecast ? { ...r.village, ...forecast[i * 2] } : null;
    const summit = forecast ? { ...r.summit, ...forecast[i * 2 + 1] } : null;

    // Fresh snow: trust the patrol's board when the reading is recent, else the model.
    let fresh = null;
    if (measured && !measured.stale && measured.new24Cm !== null) {
      fresh = { cm: measured.new24Cm, source: 'measured' };
    } else if (village) {
      fresh = { cm: village.past24Cm, source: 'model' };
    }

    return { id: r.id, name: r.name, measured, village, summit, fresh };
  });

  const depthPoints = resorts.flatMap((r) => [
    r.measured && !r.measured.stale ? { elevation: r.measured.altitude, depthCm: r.measured.depthCm } : null,
    r.village && { elevation: r.village.elevation, depthCm: r.village.depthCm },
    r.summit && { elevation: r.summit.elevation, depthCm: r.summit.depthCm },
  ]).filter(Boolean);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    // null with snowLineKnown=true means no snow anywhere; snowLineKnown=false means no recent data at all.
    snowLineM: estimateSnowLine(depthPoints),
    snowLineKnown: depthPoints.length > 0,
    resorts,
    errors,
  };
}

/** Fetch both sources; a failure in one still returns the other, with the error listed. */
export async function getReport({ env = process.env, nowMs = Date.now(), fetchImpl = fetch } = {}) {
  const [st, fc] = await Promise.allSettled([
    getStations(STATION_IDS, { now: new Date(nowMs), fetchImpl }),
    getForecast(FORECAST_POINTS, { apiKey: env.OPEN_METEO_API_KEY || '', nowMs, fetchImpl }),
  ]);
  const errors = [];
  if (st.status === 'rejected') errors.push({ source: 'stations', message: st.reason?.message || String(st.reason) });
  if (fc.status === 'rejected') errors.push({ source: 'forecast', message: fc.reason?.message || String(fc.reason) });
  return buildReport({
    stations: st.status === 'fulfilled' ? st.value : null,
    forecast: fc.status === 'fulfilled' ? fc.value : null,
    errors,
    nowMs,
  });
}
