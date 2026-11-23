// The station parser. Fixture and expected values come from the test suite of
// faizpuru/meteofrance-montagne (MIT), which this parser is ported from — so
// passing these proves the port behaves the same. See NOTICE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { parseNivo, getStations } from '../lib/nivo.js';

const csv = readFileSync(new URL('./fixtures/nivo_sample.csv', import.meta.url), 'utf8');

test('completes a midday reading with the morning one', () => {
  const s = parseNivo([csv])['7498'];
  assert.equal(s.altitude, 1854);
  assert.equal(s.observedAt, '2026-02-12T12:02:00Z');
  assert.equal(s.depthCm, 151);
  assert.equal(s.tempC, -1.7);
  // The morning board over 24h, not the midday one over a few hours.
  assert.equal(s.new24Cm, 31);
});

test('ignores fresh snow measured more than 24h before the latest reading', () => {
  const s = parseNivo([csv])['7393'];
  assert.equal(s.observedAt, '2026-02-12T06:45:00Z');
  assert.equal(s.depthCm, 120);
  assert.equal(s.new24Cm, null);
  assert.equal(s.avalancheRisk, null);
});

test('keeps only the requested stations', () => {
  assert.deepEqual(Object.keys(parseNivo([csv], ['7498'])), ['7498']);
  assert.deepEqual(parseNivo([csv], ['0000']), {});
});

test('daily history holds one depth per day, oldest first', () => {
  const h = parseNivo([csv])['7498'].history;
  const dates = h.map((x) => x.date);
  assert.deepEqual(dates, [...new Set(dates)].sort());
  assert.equal(h.at(-1).depthCm, 151);
});

test('a missing yearly file (403/404) means no readings, not an error', async () => {
  const fetchImpl = async () => new Response('', { status: 403 });
  assert.deepEqual(await getStations(['7498'], { now: new Date('2026-11-23'), fetchImpl }), {});
});

test('in January the previous year is read too', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return new Response(url.includes('2025') ? gzipSync(csv) : null, { status: url.includes('2025') ? 200 : 404 });
  };
  const out = await getStations(['7498'], { now: new Date('2026-01-03T08:00:00Z'), fetchImpl });
  assert.equal(urls.length, 2);
  assert.equal(out['7498'].depthCm, 151);
});
