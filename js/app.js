import { heatmap, seasonChart, profile, SERIES, esc } from './charts.js';
import { renderMap } from './map3d.js';
import { setSnowfall } from './snowfall.js';

const REFRESH_MS = 30 * 60 * 1000;
const TZ = 'Europe/Paris';
const $ = (id) => document.getElementById(id);
const fmtWhen = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const cmv = (v) => (v === null || v === undefined ? '–' : `${v}<small>cm</small>`);

function ago(h) {
  if (h < 1) return 'just now';
  if (h < 36) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
}

function card(r, i, report) {
  const m = r.measured, v = r.village, s = r.summit;
  let h = `<section class="card"><h3><i class="key" style="background:${SERIES[i]}"></i>${esc(r.name)}</h3>`;
  if (m && m.depthCm !== null && !m.lastSeason) {
    h += `<div class="hero${m.stale ? ' dim' : ''}"><div class="big">${m.depthCm}<small>cm</small></div>` +
      `<div class="what">measured at ${m.altitude}m${m.depthHigherCm != null ? `<br><strong>${m.depthHigherCm}cm</strong> higher up` : ''}</div></div>` +
      `<div class="obs">Patrol reading ${esc(fmtWhen.format(new Date(m.observedAt)))} · ${ago(m.ageHours)}` +
      `${m.stale ? '<span class="tag">⚠ Old reading</span>' : ''}</div>`;
  } else {
    h += `<div class="hero dim"><div class="big">–</div><div class="what">No patrol reading yet this season</div></div>` +
      (m?.lastSeason && m.depthCm != null ? `<div class="obs">Last reading: ${m.depthCm}cm on ${esc(fmtWhen.format(new Date(m.observedAt)))}</div>` : '');
  }
  h += `<div class="stats">` +
    `<div class="stat"><div class="k">New 24h</div><div class="v">${cmv(r.fresh?.cm)}</div><div class="n">${r.fresh ? r.fresh.source : 'no data'}</div></div>` +
    `<div class="stat"><div class="k">Next 24h</div><div class="v">${cmv(s?.next24Cm)}</div><div class="n">${s ? `at the top · village ${v.next24Cm ?? '–'}cm` : 'no forecast'}</div></div>` +
    `<div class="stat"><div class="k">Next 72h</div><div class="v">${cmv(s?.next72Cm)}</div><div class="n">${s ? `at the top · village ${v.next72Cm ?? '–'}cm` : 'no forecast'}</div></div>` +
    `</div>`;
  if (v || (m && !m.lastSeason)) h += profile(r, report.snowLineM, SERIES[i]);
  return h + '</section>';
}

function snowingNow(report) {
  // heaviest snowfall in the current 6h block across the summits
  return Math.max(0, ...report.resorts.map((r) => r.summit?.blocks?.find((b) => !b.past)?.snowfallCm ?? 0));
}

function heroLegend(report) {
  const fls = report.resorts.map((r) => r.village?.freezingLevelM).filter((x) => x != null);
  const fl = fls.length ? Math.round(fls.reduce((a, b) => a + b, 0) / fls.length / 50) * 50 : null;
  const now = snowingNow(report);
  return `<span class="lg"><i class="sw-snow"></i>${report.snowLineM != null ? `Snow cover above ≈${report.snowLineM.toLocaleString('en-GB')}m <span class="dim">(estimated)</span>` : report.snowLineKnown ? 'No snow cover yet' : 'Snow line unknown <span class="dim">(no recent data)</span>'}</span>` +
    (fl != null ? `<span class="lg">🌡 Freezing level ${fl.toLocaleString('en-GB')}m</span>` : '') +
    (now >= 0.3 ? `<span class="lg">❄️ Snowing now · ${now}cm/6h at the top</span>` : '');
}

let mapFailed = false;
function render(report) {
  $('updated').textContent = `Updated ${fmtTime.format(new Date(report.generatedAt))}`;
  $('banners').innerHTML = (report.errors || []).map((e) =>
    `<div class="banner">⚠ ${e.source === 'forecast' ? 'Forecast unavailable' : 'Patrol readings unavailable'}: ${esc(e.message)}</div>`).join('');
  $('legend').innerHTML = heroLegend(report);
  $('cards').innerHTML = report.resorts.map((r, i) => card(r, i, report)).join('');
  heatmap($('heat'), report);
  seasonChart($('season'), report);
  setSnowfall($('flakes'), snowingNow(report));
  if (!mapFailed) {
    renderMap($('map'), report, SERIES).catch((e) => {
      mapFailed = true;
      $('map').innerHTML = `<div class="map-fallback">${esc(e.message)}</div>`;
    });
  }
}

let loading = false;
async function load(fresh) {
  if (loading) return;
  loading = true;
  $('refresh').disabled = true;
  try {
    const res = await fetch('/api/snow' + (fresh ? '?fresh=1' : ''));
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    render(j);
    try { localStorage.setItem('snow:last', JSON.stringify(j)); } catch {}
  } catch (e) {
    $('banners').innerHTML = `<div class="banner">⚠ Couldn’t load the snow report: ${esc(e.message)}</div>`;
  } finally {
    loading = false;
    $('refresh').disabled = false;
  }
}

// Show the last report instantly (slow signal on the mountain), then refresh.
try {
  const cached = JSON.parse(localStorage.getItem('snow:last') || 'null');
  if (cached?.resorts) { render(cached); $('updated').textContent += ' · refreshing…'; }
} catch {}
$('refresh').addEventListener('click', () => load(true));
load(false);
setInterval(() => { if (document.visibilityState === 'visible') load(false); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
