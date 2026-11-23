// Measured snow depth from the Météo-France nivo-meteorological network.
//
// Ski patrols at each station report once or twice a day (morning, sometimes
// midday) during the season. Météo-France publishes a yearly CSV, gzipped,
// without any key. The parsing rules below are ported from
// faizpuru/meteofrance-montagne (MIT, © 2025 François Aizpuru) — see NOTICE.

import { gunzipSync } from 'node:zlib';

export const NIVO_URL = (year) =>
  `https://meteofrance.s3.sbg.io.cloud.ovh.net/data/OBS/NIVOSE/nivo_${year}.csv.gz`;

const DAY_MS = 24 * 3600 * 1000;

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Snow heights are published in metres.
const cm = (v) => {
  const m = num(v);
  return m === null ? null : Math.round(m * 100);
};
// Temperatures are published in kelvins.
const celsius = (v) => {
  const k = num(v);
  return k === null ? null : Math.round((k - 273.15) * 10) / 10;
};
const time = (row) => Date.parse(row.validity_time);

/** Parse the CSV text into rows (objects keyed by header), optionally keeping only some stations. */
export function parseNivoRows(text, stationIds = null) {
  const keep = stationIds ? new Set(stationIds) : null;
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(';');
  const idCol = header.indexOf('geo_id_wmo');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(';');
    if (keep && !keep.has(cells[idCol])) continue;
    const row = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    if (row.geo_id_wmo && row.validity_time && !Number.isNaN(time(row))) rows.push(row);
  }
  return rows;
}

/** Summarise one station's rows: its latest observation, plus a daily depth history. */
export function summariseStation(rows, since = null) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => time(b) - time(a));
  const last = sorted[0];
  // Some stations observe again at midday without measuring everything:
  // complete the latest observation with anything measured in the 24h before it.
  const recent = sorted.filter((r) => time(r) > time(last) - DAY_MS);
  const value = (col, from = recent) => from.find((r) => r[col])?.[col] ?? '';

  // Daily history for the season: the latest measured depth of each day (UTC
  // date is fine — observations are taken in the morning/midday, French time).
  const byDay = new Map();
  for (const r of sorted) {
    if (r.ht_neige === '') continue;
    const day = r.validity_time.slice(0, 10);
    if (since && day < since) continue;
    if (!byDay.has(day)) byDay.set(day, cm(r.ht_neige));
  }
  const history = [...byDay.entries()]
    .map(([date, depthCm]) => ({ date, depthCm }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    id: last.geo_id_wmo,
    name: last.name,
    altitude: num(last.Altitude),
    observedAt: new Date(time(last)).toISOString().replace('.000Z', 'Z'),
    depthCm: cm(value('ht_neige')),
    // Estimated by the observer higher up the mountain.
    depthHigherCm: cm(value('ht_neige_alti')),
    // Fresh snow on a board cleared at each observation: over 24h in the
    // morning (perssfrai -99), over a few hours at midday (-50). Only the 24h one.
    new24Cm: cm(value('ssfrai', recent.filter((r) => r.perssfrai === '-99'))),
    tempC: celsius(value('t')),
    avalancheRisk: num(value('aval_risque')),
    history,
  };
}

/** Latest observation per station id, from one or more yearly CSV texts. History starts at `since` (YYYY-MM-DD). */
export function parseNivo(texts, stationIds, since = null) {
  const rows = texts.flatMap((t) => parseNivoRows(t, stationIds));
  const byStation = new Map();
  for (const r of rows) {
    if (!byStation.has(r.geo_id_wmo)) byStation.set(r.geo_id_wmo, []);
    byStation.get(r.geo_id_wmo).push(r);
  }
  const out = {};
  for (const [id, stationRows] of byStation) out[id] = summariseStation(stationRows, since);
  return out;
}

async function fetchYear(year, fetchImpl) {
  const res = await fetchImpl(NIVO_URL(year), { signal: AbortSignal.timeout(20000) });
  // The bucket answers 403 or 404 for a year whose file isn't created yet.
  if (res.status === 403 || res.status === 404) return '';
  if (!res.ok) throw new Error(`Météo-France nivo ${year}: HTTP ${res.status}`);
  return gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
}

/** The season a date belongs to starts on 1 September: Nov 2026 and Mar 2027 are both in 2026-09-01's. */
export function seasonStart(now) {
  const y = now.getUTCFullYear();
  return `${now.getUTCMonth() >= 8 ? y : y - 1}-09-01`;
}

/**
 * Fetch and summarise the stations, with history since the start of the season.
 * A season spans two calendar years, so from January to August the previous
 * year's file is read too.
 */
export async function getStations(stationIds, { now = new Date(), fetchImpl = fetch } = {}) {
  const year = now.getUTCFullYear();
  const years = now.getUTCMonth() < 8 ? [year - 1, year] : [year];
  const texts = await Promise.all(years.map((y) => fetchYear(y, fetchImpl)));
  return parseNivo(texts.filter(Boolean), stationIds, seasonStart(now));
}
