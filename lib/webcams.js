// One live webcam per resort from the Windy Webcams API (free tier).
//
// Free-tier rules this code and the page follow (api.windy.com/webcams/terms):
//  - image URLs carry a token that expires ~10 minutes after the API call, so
//    this is fetched separately from the snow report and cached only briefly;
//  - every image links to its windy.com webcam page; images are never stretched;
//  - the page shows "Webcams provided by windy.com — add a webcam".
// Needs WINDY_WEBCAMS_KEY (free key from api.windy.com/keys).

import { RESORTS } from './resorts.js';

const API = 'https://api.windy.com/webcams/api/v3/webcams';
// Les 3 Vallées with a margin: north, east, south, west.
export const BBOX = '45.47,6.72,45.24,6.44';
// A camera further than this from the village belongs to another resort.
const MAX_KM = 6;
// Cameras that haven't sent an image for this long are skipped unless pinned.
const MAX_AGE_H = 48;
// Categories that usually mean a view of the slopes rather than a street or a hotel lobby…
const GOOD = new Set(['mountain', 'landscape', 'sportArea', 'village']);
// …and ones that never do (Courchevel's most popular camera is its altiport runway).
const SKIP = new Set(['airport', 'traffic', 'indoor']);
const catIds = (w) => (w.categories ?? []).map((c) => c.id ?? c);

export function webcamsUrl() {
  const p = new URLSearchParams({ bbox: BBOX, limit: '50', sortKey: 'popularity', sortDirection: 'desc', lang: 'en' });
  p.append('include', 'images');
  p.append('include', 'location');
  p.append('include', 'player');
  p.append('include', 'urls');
  p.append('include', 'categories');
  return `${API}?${p}`;
}

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Only what the page needs, in a shape that doesn't depend on Windy's. */
export function slim(w, village) {
  const cur = w.images?.current ?? {};
  const size = w.images?.sizes?.preview ?? {};
  const url = cur.preview || cur.thumbnail;
  if (!url) return null;
  const loc = w.location ?? {};
  return {
    id: w.webcamId,
    title: w.title,
    updatedAt: w.lastUpdatedOn ?? null,
    image: { url, width: size.width ?? null, height: size.height ?? null },
    // Required by the terms: link every image to windy.com.
    link: w.urls?.detail || `https://www.windy.com/webcams/${w.webcamId}`,
    timelapse: w.player?.day || null,
    distanceKm: loc.latitude != null && village ? Math.round(km(village, { lat: loc.latitude, lon: loc.longitude }) * 10) / 10 : null,
  };
}

/**
 * Pick one camera per resort. Pinned ids win; otherwise each camera belongs to
 * the resort whose village is nearest, and among a resort's own cameras the
 * API's popularity order wins, nudged by distance and preferring slope-ish
 * categories. Only active, recently updated cameras; never one twice.
 */
export function pickWebcams(webcams, resorts = RESORTS, nowMs = Date.now()) {
  const used = new Set();
  const out = {};
  const nearest = (loc) => resorts.reduce((best, r) => {
    const d = km(r.village, { lat: loc.latitude, lon: loc.longitude });
    return d < best.d ? { id: r.id, d } : best;
  }, { id: null, d: Infinity }).id;
  for (const r of resorts) {
    const pinned = (r.webcams ?? []).map((id) => webcams.find((w) => w.webcamId === Number(id))).filter(Boolean);
    const candidates = webcams
      .map((w, rank) => {
        const loc = w.location;
        if (!loc || loc.latitude == null || nearest(loc) !== r.id) return null;
        const d = km(r.village, { lat: loc.latitude, lon: loc.longitude });
        const ageH = w.lastUpdatedOn ? (nowMs - Date.parse(w.lastUpdatedOn)) / 3.6e6 : Infinity;
        if (d > MAX_KM || ageH > MAX_AGE_H || (w.status && w.status !== 'active')) return null;
        if (catIds(w).some((c) => SKIP.has(c))) return null;
        const good = catIds(w).some((c) => GOOD.has(c));
        // Lower is better: popularity rank, nudged by distance and category.
        return { w, score: rank + d * 2 - (good ? 5 : 0) };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map((c) => c.w);
    const pick = [...pinned, ...candidates].find((w) => !used.has(w.webcamId) && slim(w, r.village));
    if (pick) used.add(pick.webcamId);
    out[r.id] = pick ? slim(pick, r.village) : null;
  }
  return out;
}

export async function getWebcams({ apiKey, nowMs = Date.now(), fetchImpl = fetch } = {}) {
  const res = await fetchImpl(webcamsUrl(), {
    headers: { 'x-windy-api-key': apiKey },
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`Windy webcams: ${body?.message || `HTTP ${res.status}`}`);
  const webcams = body.webcams ?? [];
  // Pinned cameras outside the first page of results are fetched by id.
  const missing = RESORTS.flatMap((r) => r.webcams ?? []).map(Number).filter((id) => !webcams.some((w) => w.webcamId === id));
  if (missing.length) {
    const p = new URLSearchParams();
    missing.forEach((id) => p.append('webcamIds', String(id)));
    ['images', 'location', 'player', 'urls', 'categories'].forEach((i) => p.append('include', i));
    const r2 = await fetchImpl(`${API}?${p}`, { headers: { 'x-windy-api-key': apiKey }, signal: AbortSignal.timeout(12000) });
    if (r2.ok) webcams.push(...((await r2.json()).webcams ?? []));
  }
  return pickWebcams(webcams, RESORTS, nowMs);
}
