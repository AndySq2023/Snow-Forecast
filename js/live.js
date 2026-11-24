// "Live": Windy's own embedded map (no key) with a layer switch, and one Windy
// webcam per resort. Webcam image URLs expire ~10 minutes after they're issued
// (free tier), so the cameras refresh on their own every 8 minutes.

import { esc } from './charts.js';
import { RESORTS } from '../lib/resorts.js';

const LAYERS = [
  { id: 'snowAccu', label: 'New snow' },
  { id: 'snowcover', label: 'Snow depth' },
  { id: 'wind', label: 'Wind' },
  { id: 'deg0', label: 'Freezing level' },
];
const CAMS_EVERY_MS = 8 * 60 * 1000;
const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function windyUrl(overlay) {
  const p = new URLSearchParams({
    type: 'map', location: 'coordinates', lat: '45.36', lon: '6.59', zoom: '11',
    overlay, product: 'ecmwf', level: 'surface',
    metricRain: 'mm', metricTemp: '°C', metricWind: 'km/h',
    menu: '', message: 'true', marker: '', calendar: 'now', pressure: '', detailLat: '45.345', detailLon: '6.585', detail: '',
  });
  return `https://embed.windy.com/embed.html?${p}`;
}

export function initWindy(root) {
  let current = LAYERS[0].id;
  root.innerHTML =
    `<div class="seg" role="tablist" aria-label="Windy layer">${LAYERS.map((l) =>
      `<button type="button" role="tab" data-l="${l.id}" aria-selected="${l.id === current}">${l.label}</button>`).join('')}</div>` +
    `<div class="windy-frame"><iframe title="Windy weather map of Les 3 Vallées" loading="lazy" src="${windyUrl(current)}" allowfullscreen></iframe></div>`;
  const frame = root.querySelector('iframe');
  root.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.l === current) return;
    current = b.dataset.l;
    root.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.l === current)));
    frame.src = windyUrl(current);
  });
}

function ago(iso) {
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 36) return `${Math.round(h)}h ago`;
  return fmtTime.format(new Date(iso));
}

function tile(resort, cam, color) {
  if (!cam) {
    return `<figure class="cam empty"><div class="cam-ph">No live camera found near ${esc(resort.name)}</div>` +
      `<figcaption><i class="key" style="background:${color}"></i><b>${esc(resort.name)}</b></figcaption></figure>`;
  }
  // Shown at its own size or smaller, never stretched (Windy's terms); linked to windy.com.
  const w = cam.image.width, h = cam.image.height;
  return `<figure class="cam"><a href="${esc(cam.link)}" target="_blank" rel="noopener" title="Open this webcam on windy.com">` +
    `<img src="${esc(cam.image.url)}" alt="${esc(cam.title)}" loading="lazy"${w ? ` width="${w}" height="${h}" style="max-width:${w}px"` : ''}></a>` +
    `<figcaption><i class="key" style="background:${color}"></i><b>${esc(resort.name)}</b>` +
    `<span class="dim">${esc(cam.title)}${cam.updatedAt ? ` · ${esc(ago(cam.updatedAt))}` : ''}</span>` +
    (cam.timelapse ? ` <a class="tl" href="${esc(cam.timelapse)}" target="_blank" rel="noopener">▶ today's timelapse</a>` : '') +
    `</figcaption></figure>`;
}

export function initWebcams(root, colors) {
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const r = await fetch('/api/webcams');
      const j = await r.json();
      if (!j.configured) {
        root.innerHTML = '<p class="empty">Live webcams appear here once a free Windy Webcams key is added (<code>WINDY_WEBCAMS_KEY</code> — see the README).</p>';
        return;
      }
      if (j.error) throw new Error(j.error);
      root.innerHTML = `<div class="cams">${RESORTS.map((res, i) => tile(res, j.webcams[res.id], colors[i])).join('')}</div>` +
        `<p class="courtesy">Webcams provided by <a href="https://www.windy.com/" target="_blank" rel="noopener">windy.com</a> &mdash; ` +
        `<a href="https://www.windy.com/webcams/add" target="_blank" rel="noopener">add a webcam</a></p>`;
    } catch (e) {
      root.innerHTML = `<p class="empty">Webcams unavailable right now: ${esc(e.message)}</p>`;
    } finally {
      loading = false;
    }
  }
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, CAMS_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
}
