import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickWebcams, slim, webcamsUrl } from '../lib/webcams.js';
import { RESORTS } from '../lib/resorts.js';

const NOW = Date.parse('2026-11-24T17:00:00Z');
const at = (id) => RESORTS.find((r) => r.id === id).village;
// A webcam in the Windy v3 shape (only the fields we read).
const cam = (webcamId, where, { cats = ['mountain'], updated = '2026-11-24T16:45:00Z', status = 'active', dLat = 0 } = {}) => ({
  webcamId, title: `cam ${webcamId}`, status, lastUpdatedOn: updated,
  categories: cats.map((id) => ({ id, name: id })),
  location: { latitude: at(where).lat + dLat, longitude: at(where).lon },
  images: { current: { preview: `https://imgproxy.windy.com/x/${webcamId}.jpg` }, sizes: { preview: { width: 400, height: 224 } } },
  urls: { detail: `https://windy.com/webcams/${webcamId}` },
  player: { day: `https://webcams.windy.com/p/${webcamId}/day` },
});

test('a camera only counts for the resort whose village is nearest', () => {
  // The most popular camera is in Val Thorens; Les Menuires must not borrow it.
  const out = pickWebcams([cam(1, 'valthorens'), cam(2, 'menuires', { cats: ['landscape'] })], RESORTS, NOW);
  assert.equal(out.valthorens.id, 1);
  assert.equal(out.menuires.id, 2);
  assert.equal(out.courchevel, null);
});

test('airports, traffic and indoor cameras are skipped; stale and inactive ones too', () => {
  const out = pickWebcams([
    cam(1, 'courchevel', { cats: ['meteo', 'airport'] }),
    cam(2, 'courchevel', { updated: '2026-11-20T10:00:00Z' }),
    cam(3, 'courchevel', { status: 'inactive' }),
    cam(4, 'courchevel', { cats: ['landscape'] }),
  ], RESORTS, NOW);
  assert.equal(out.courchevel.id, 4);
});

test('popularity order wins among a resort’s own cameras, nudged towards slope views', () => {
  const out = pickWebcams([cam(1, 'meribel', { cats: ['city'] }), cam(2, 'meribel'), cam(3, 'meribel')], RESORTS, NOW);
  assert.equal(out.meribel.id, 2);
});

test('a pinned camera wins, even a stale one', () => {
  const resorts = RESORTS.map((r) => (r.id === 'meribel' ? { ...r, webcams: [9] } : r));
  const out = pickWebcams([cam(1, 'meribel'), cam(9, 'meribel', { updated: '2026-11-01T00:00:00Z', cats: ['city'] })], resorts, NOW);
  assert.equal(out.meribel.id, 9);
});

test('slim keeps what the terms need: a windy.com link and the image size', () => {
  const s = slim(cam(7, 'valthorens'), at('valthorens'));
  assert.equal(s.link, 'https://windy.com/webcams/7');
  assert.deepEqual([s.image.width, s.image.height], [400, 224]);
  assert.equal(s.distanceKm, 0);
  assert.equal(slim({ webcamId: 8, images: { current: {} } }, at('valthorens')), null);
});

test('the request covers Les 3 Vallées and asks for every part the page uses', () => {
  const u = new URL(webcamsUrl());
  assert.equal(u.searchParams.get('bbox'), '45.47,6.72,45.24,6.44');
  assert.deepEqual(u.searchParams.getAll('include').sort(), ['categories', 'images', 'location', 'player', 'urls']);
  for (const r of RESORTS) {
    const [n, e, s, w] = u.searchParams.get('bbox').split(',').map(Number);
    assert.ok(r.village.lat < n && r.village.lat > s && r.village.lon < e && r.village.lon > w, r.id);
  }
});
