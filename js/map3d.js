// The 3D terrain hero: Les 3 Vallées in relief, white above the estimated snow
// line, slowly orbiting, with a pin per resort. MapLibre GL (BSD-3) from unpkg,
// elevation from the open AWS Terrain Tiles (terrarium encoding, no key).

import { RESORTS } from '../lib/resorts.js';

const ML = 'https://unpkg.com/maplibre-gl@5.24.0/dist/';
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CENTER = [6.585, 45.352];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let mapPromise = null;
let map = null;
let markers = [];

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function loadLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = ML + 'maplibre-gl.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = ML + 'maplibre-gl.js';
    js.onload = () => resolve(window.maplibregl);
    js.onerror = () => reject(new Error('Could not load the map library'));
    document.head.appendChild(js);
  });
}

/** Ground colour by altitude: valley → rock, then white above the snow line. */
export function reliefColor(snowLineM) {
  const earth = [[300, '#1a2620'], [1000, '#2c3a2c'], [1600, '#4a4d3f'], [2200, '#625f53'], [2800, '#77736a'], [4000, '#8d8a83']];
  const stops = [];
  if (snowLineM == null) {
    earth.forEach(([e, c]) => stops.push(e, c));
  } else {
    const below = snowLineM - 120, above = snowLineM + 120;
    earth.filter(([e]) => e < below).forEach(([e, c]) => stops.push(e, c));
    stops.push(below, '#5b5a4e', above, '#dfe8f2', Math.max(above + 400, 3000), '#f6f9fd', Math.max(above + 1500, 4500), '#ffffff');
  }
  return ['interpolate', ['linear'], ['elevation'], ...stops];
}

function style(snowLineM) {
  const dem = { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 14,
    attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>' };
  return {
    version: 8,
    sources: { terrain: dem, relief: { ...dem } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b0f14' } },
      { id: 'relief', type: 'color-relief', source: 'relief', paint: { 'color-relief-color': reliefColor(snowLineM) } },
      { id: 'shade', type: 'hillshade', source: 'relief', paint: {
        'hillshade-exaggeration': 0.65,
        'hillshade-shadow-color': 'rgba(4, 12, 26, 0.85)',
        'hillshade-highlight-color': 'rgba(255, 255, 255, 0.28)',
        'hillshade-accent-color': 'rgba(10, 24, 44, 0.6)',
        'hillshade-illumination-direction': 300,
      } },
    ],
    terrain: { source: 'terrain', exaggeration: 1.35 },
    sky: {
      'sky-color': '#071630', 'horizon-color': '#5d7ba6', 'fog-color': '#0b0f14',
      'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.55, 'atmosphere-blend': 0.8,
    },
  };
}

function pin(r, resort, color) {
  const el = document.createElement('div');
  el.className = 'pin';
  const m = r.measured;
  const measured = m && !m.lastSeason && m.depthCm != null;
  const depth = measured ? m.depthCm : r.village?.depthCm;
  const coming = r.summit?.next72Cm;
  el.innerHTML = `<div class="pin-card" style="--c:${color}"><b>${resort.name}</b>` +
    `<span class="pin-d">${depth == null ? '–' : (measured ? '' : '≈') + depth + '<small>cm</small>'}</span>` +
    (measured && m.stale ? `<span class="pin-f old">${Math.round(m.ageHours / 24)}d old</span>` : '') +
    (coming ? `<span class="pin-f">+${coming}cm in 72h</span>` : '') + `</div><div class="pin-stem"></div><div class="pin-dot" style="background:${color}"></div>`;
  return el;
}

function orbit() {
  if (reduceMotion) return;
  let paused = false, resumeAt = 0, last = performance.now();
  const stop = () => { paused = true; resumeAt = performance.now() + 10000; };
  ['mousedown', 'touchstart', 'wheel'].forEach((ev) => map.getCanvas().addEventListener(ev, stop, { passive: true }));
  const tick = (t) => {
    const dt = Math.min(64, t - last); last = t;
    if (paused && t > resumeAt) paused = false;
    if (!paused && document.visibilityState === 'visible' && !map.isMoving()) map.setBearing(map.getBearing() + dt * 0.0012);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Create the map once, then update the snow line and pins on every report. */
export async function renderMap(el, report, colors) {
  if (!webglOk()) throw new Error('3D view needs WebGL, which this browser doesn’t have');
  if (!mapPromise) {
    mapPromise = loadLib().then((maplibregl) => new Promise((resolve) => {
      const narrow = el.clientWidth < 640;
      map = new maplibregl.Map({
        container: el,
        style: style(report.snowLineM),
        center: CENTER,
        zoom: narrow ? 10.5 : 11.25,
        pitch: 62,
        bearing: -25,
        maxPitch: 80,
        attributionControl: { compact: true },
        cooperativeGestures: narrow, // one finger scrolls the page on phones; two fingers move the map
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('load', () => { orbit(); resolve(maplibregl); });
    }));
  }
  const maplibregl = await mapPromise;
  if (map.getLayer('relief')) map.setPaintProperty('relief', 'color-relief-color', reliefColor(report.snowLineM));
  markers.forEach((m) => m.remove());
  markers = report.resorts.map((r, i) => {
    const resort = RESORTS.find((x) => x.id === r.id);
    return new maplibregl.Marker({ element: pin(r, resort, colors[i]), anchor: 'bottom' })
      .setLngLat([resort.village.lon, resort.village.lat])
      .addTo(map);
  });
  return map;
}
