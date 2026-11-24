// GET /api/webcams — one live Windy webcam per resort.
// Kept apart from /api/snow because free-tier image URLs expire ~10 minutes after
// the API call: the CDN may hold this for 4 minutes at most.

import { getWebcams } from '../lib/webcams.js';

export default async function handler(req, res) {
  const apiKey = process.env.WINDY_WEBCAMS_KEY;
  if (!apiKey) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json({ configured: false, webcams: {} });
  }
  try {
    const webcams = await getWebcams({ apiKey });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=240');
    res.status(200).json({ configured: true, generatedAt: new Date().toISOString(), webcams });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ configured: true, error: e.message || 'Webcams unavailable', webcams: {} });
  }
}
