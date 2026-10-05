// GET  ?week_of=YYYY-MM-DD  → [{mga_name, weekly_alp, weekly_hires}]
// POST {admin_key, week_of, stats:[{mga_name, weekly_alp, weekly_hires}]}
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

export default async function handler(req, res) {
  const KEY       = process.env.SUPABASE_SERVICE_KEY;
  const ADMIN_KEY = process.env.ADMIN_KEY || 'waisman2026';
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  // ── GET ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { week_of } = req.query;
    if (!week_of) return res.status(400).json({ error: 'week_of required' });

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/alptoberfest_mga_stats?week_of=eq.${week_of}&select=mga_name,weekly_alp,weekly_hires&limit=50`,
      { headers: hdrs }
    );
    if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(Array.isArray(data) ? data : []);
  }

  // ── POST ──────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { admin_key, week_of, stats } = req.body || {};

    if (admin_key !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!week_of || !Array.isArray(stats) || stats.length === 0) {
      return res.status(400).json({ error: 'week_of and stats[] required' });
    }

    const now = new Date().toISOString();
    const records = stats
      .filter(s => s.mga_name)
      .map(s => ({
        week_of,
        mga_name:     String(s.mga_name).trim(),
        weekly_alp:   Math.round(Number(s.weekly_alp)   || 0),
        weekly_hires: Number(s.weekly_hires) || 0,
        updated_at:   now,
      }));

    if (!records.length) return res.status(400).json({ error: 'No valid records' });

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/alptoberfest_mga_stats?on_conflict=week_of,mga_name`,
      {
        method: 'POST',
        headers: {
          ...hdrs,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(records),
      }
    );

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: 'Save failed', detail: err.slice(0, 200) });
    }
    return res.status(200).json({ success: true, saved: records.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
