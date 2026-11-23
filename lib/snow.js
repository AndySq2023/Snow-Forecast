// Combines measured (Météo-France stations) and modelled (Open-Meteo) snow into
// one report per resort, and decides which alerts fire. Both the page and the
// push-notification cron read this, so they can never disagree.

import { RESORTS, STATION_IDS, FORECAST_POINTS } from './resorts.js';
import { getStations } from './nivo.js';
import { getForecast } from './openmeteo.js';

// A station reading older than this is shown greyed out and isn't used for alerts.
export const STALE_HOURS = 36;

export function thresholds(env = process.env) {
  const n = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  return {
    freshCm: n(env.ALERT_FRESH_CM, 15), // new snow in the last 24h
    forecastCm: n(env.ALERT_FORECAST_CM, 20), // forecast over the next 72h, at the summit
  };
}

/** Pure: build the report from already-fetched pieces. */
export function buildReport({ stations, forecast, errors = [], nowMs = Date.now(), limits = thresholds() }) {
  const resorts = RESORTS.map((r, i) => {
    const st = stations?.[r.station] ?? null;
    const ageH = st ? (nowMs - Date.parse(st.observedAt)) / 3.6e6 : null;
    const measured = st ? { ...st, ageHours: Math.round(ageH), stale: ageH > STALE_HOURS } : null;
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

  return { generatedAt: new Date(nowMs).toISOString(), limits, resorts, alerts: alertsFor(resorts, limits), errors };
}

export function alertsFor(resorts, limits) {
  const alerts = [];
  for (const r of resorts) {
    if (r.fresh && r.fresh.cm >= limits.freshCm) {
      alerts.push({
        resort: r.id,
        kind: 'fresh',
        cm: r.fresh.cm,
        text: `${r.name}: ${r.fresh.cm}cm of new snow in 24h${r.fresh.source === 'model' ? ' (model)' : ''}`,
      });
    }
    if (r.summit && r.summit.next72Cm >= limits.forecastCm) {
      alerts.push({
        resort: r.id,
        kind: 'forecast',
        cm: r.summit.next72Cm,
        text: `${r.name}: ${r.summit.next72Cm}cm forecast in the next 72h at ${r.summit.elevation}m`,
      });
    }
  }
  return alerts;
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
    limits: thresholds(env),
  });
}
