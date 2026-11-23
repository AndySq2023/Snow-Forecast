// GET /api/alert — run by the Vercel cron in vercel.json (daily, 06:00 UTC = 7am in
// France in winter). If any resort passes a threshold, pushes one notification to
// the ntfy topic in NTFY_TOPIC; install the ntfy app and subscribe to that topic.
//
//   ?dry=1   report what would be sent, send nothing
//   ?test=1  send a test notification even if nothing passes a threshold
//
// When CRON_SECRET is set, Vercel sends it as a Bearer token and every call must
// carry it — otherwise anyone could make your phone buzz.

import { getReport } from '../lib/snow.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const params = new URL(req.url, 'http://x').searchParams;
  const dry = params.has('dry');
  const test = params.has('test');
  const report = await getReport();
  const lines = report.alerts.map((a) => a.text);
  if (test && !lines.length) lines.push('Test: alerts are working. No resort is over a threshold right now.');

  const topic = process.env.NTFY_TOPIC;
  let sent = false;
  if (lines.length && topic && !dry) {
    const site = process.env.SITE_URL || `https://${req.headers.host}`;
    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      body: lines.join('\n'),
      headers: {
        Title: report.alerts.some((a) => a.kind === 'fresh') ? 'Fresh snow in Les 3 Vallées' : 'Snow on the way to Les 3 Vallées',
        Tags: 'snowflake',
        Click: site,
      },
    });
    if (!r.ok) return res.status(502).json({ error: `ntfy: HTTP ${r.status}`, lines });
    sent = true;
  }

  res.status(200).json({ sent, topicConfigured: Boolean(topic), lines, errors: report.errors });
}
