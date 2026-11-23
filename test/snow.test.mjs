import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseLocation, forecastUrl } from '../lib/openmeteo.js';
import { buildReport, estimateSnowLine } from '../lib/snow.js';
import { RESORTS, FORECAST_POINTS } from '../lib/resorts.js';

// A synthetic Open-Meteo location in its documented shape: local wall-clock
// times (timezone=Europe/Paris, UTC+1 in winter), snowfall in cm, depth in m.
function location({ start = '2026-11-21', hours = 9 * 24, snowAt = () => 0, depthM = 0.5 } = {}) {
  const t0 = Date.parse(start + 'T00:00:00Z');
  const time = [], snowfall = [], snow_depth = [], freezing_level_height = [];
  for (let i = 0; i < hours; i++) {
    time.push(new Date(t0 + i * 3.6e6).toISOString().slice(0, 16));
    snowfall.push(snowAt(i));
    snow_depth.push(depthM);
    freezing_level_height.push(1480);
  }
  const days = hours / 24;
  const dtime = Array.from({ length: days }, (_, d) => new Date(t0 + d * 864e5).toISOString().slice(0, 10));
  const snowfall_sum = dtime.map((_, d) => snowfall.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0));
  return {
    utc_offset_seconds: 3600,
    hourly: { time, snowfall, snow_depth, freezing_level_height },
    daily: { time: dtime, snowfall_sum, temperature_2m_max: dtime.map(() => -2), temperature_2m_min: dtime.map(() => -9) },
  };
}
// 2026-11-23 12:00 in Paris = 11:00 UTC → hourly index 2*24 + 12 = 60.
const NOW = Date.parse('2026-11-23T11:00:00Z');

test('sums snowfall over the 24h before now and the 24/72h after', () => {
  // 1cm every hour from index 40 to 99.
  const s = summariseLocation(location({ snowAt: (i) => (i >= 40 && i < 100 ? 1 : 0) }), NOW);
  assert.equal(s.past24Cm, 20); // 40..59
  assert.equal(s.next24Cm, 24); // 60..83
  assert.equal(s.next72Cm, 40); // 60..99
  assert.equal(s.depthCm, 50);
  assert.equal(s.freezingLevelM, 1500);
});

test('marks past days and keeps one entry per day', () => {
  const s = summariseLocation(location(), NOW);
  assert.equal(s.daily.length, 9);
  assert.deepEqual(s.daily.filter((d) => d.past).map((d) => d.date), ['2026-11-21', '2026-11-22']);
});

test('the request asks for every point, in resort order', () => {
  const u = new URL(forecastUrl(FORECAST_POINTS));
  assert.equal(u.hostname, 'api.open-meteo.com');
  assert.equal(u.searchParams.get('latitude').split(',').length, RESORTS.length * 2);
  assert.equal(new URL(forecastUrl(FORECAST_POINTS, 'k')).hostname, 'customer-api.open-meteo.com');
});

const station = (over = {}) => ({ altitude: 1800, observedAt: '2026-11-23T07:00:00Z', depthCm: 80, depthHigherCm: null, new24Cm: 4, history: [], ...over });
const forecastFor = (depthM = 0.5) => RESORTS.flatMap(() => [
  summariseLocation(location({ snowAt: (i) => (i === 50 ? 3 : 0), depthM }), NOW),
  summariseLocation(location({ depthM }), NOW),
]);

test('a recent patrol reading wins over the model for fresh snow', () => {
  const r = buildReport({ stations: { 7893: station({ new24Cm: 18 }) }, forecast: forecastFor(), nowMs: NOW });
  assert.deepEqual(r.resorts.find((x) => x.id === 'courchevel').fresh, { cm: 18, source: 'measured' });
});

test('an old reading is marked stale and the model is used instead', () => {
  const r = buildReport({ stations: { 7893: station({ observedAt: '2026-11-19T07:00:00Z', new24Cm: 40 }) }, forecast: forecastFor(), nowMs: NOW });
  const c = r.resorts.find((x) => x.id === 'courchevel');
  assert.equal(c.measured.stale, true);
  assert.deepEqual(c.fresh, { cm: 3, source: 'model' });
});

test('with neither source the report still has every resort', () => {
  const r = buildReport({ stations: null, forecast: null, errors: [{ source: 'forecast', message: 'x' }], nowMs: NOW });
  assert.equal(r.resorts.length, RESORTS.length);
  assert.equal(r.resorts[0].fresh, null);
  assert.equal(r.snowLineM, null);
});

test('6-hour blocks cover the whole range and mark the past', () => {
  const s = summariseLocation(location({ snowAt: (i) => (i < 6 ? 1 : 0) }), NOW);
  assert.equal(s.blocks.length, 36);
  assert.equal(s.blocks[0].snowfallCm, 6);
  assert.equal(s.blocks[0].start, '2026-11-21T00:00');
  // now = index 60: the block 54..59 is past, 60..65 is not.
  assert.equal(s.blocks[9].past, true);
  assert.equal(s.blocks[10].past, false);
});

test('snow line sits between the highest bare point and the lowest covered one', () => {
  assert.equal(estimateSnowLine([
    { elevation: 1700, depthCm: 0 }, { elevation: 1850, depthCm: 2 }, { elevation: 2300, depthCm: 40 }, { elevation: 2900, depthCm: 90 },
  ]), 2100);
});

test('snow line goes below the lowest point when everything is covered, null when nothing is', () => {
  assert.equal(estimateSnowLine([{ elevation: 1750, depthCm: 30 }, { elevation: 2900, depthCm: 80 }]), 1500);
  assert.equal(estimateSnowLine([{ elevation: 1750, depthCm: 0 }, { elevation: 2900, depthCm: 3 }]), null);
});

test('the report carries a snow line from trusted depths only', () => {
  // Stale station says 80cm at 1800m; the model has no snow anywhere → no snow line.
  const r = buildReport({ stations: { 7893: station({ observedAt: '2026-11-01T07:00:00Z' }) }, forecast: forecastFor(0), nowMs: NOW });
  assert.equal(r.snowLineM, null);
});
