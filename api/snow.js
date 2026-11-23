// GET /api/snow — the full report the page renders.
// CDN-cached for 30 minutes, so however often the page is opened the upstream
// APIs see at most ~2 calls an hour. ?fresh=1 skips the cache (the ↻ button).

import { getReport } from '../lib/snow.js';

export default async function handler(req, res) {
  try {
    const report = await getReport();
    const fresh = new URL(req.url, 'http://x').searchParams.has('fresh');
    // Don't let the CDN hold on to a half-failed report for long.
    const maxAge = report.errors.length ? 120 : 1800;
    res.setHeader(
      'Cache-Control',
      fresh ? 'no-store' : `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=3600`,
    );
    res.status(200).json(report);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: e.message || 'Failed to build the snow report' });
  }
}
