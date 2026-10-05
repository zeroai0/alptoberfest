// GET  ?week_of=YYYY-MM-DD  → [{agent_name, weekly_net, pr_hires, ref_sales}]
// POST {admin_key, week_of, stats:[{agent_name, weekly_net, pr_hires, ref_sales}]}
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const ADMIN_KEY = process.env.ADMIN_KEY || 'waisman2026';
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  // ── GET ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { week_of } = req.query;
    if (!week_of) return res.status(400).json({ error: 'week_of required' });

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/alptoberfest_weekly_stats?week_of=eq.${week_of}&select=agent_name,weekly_net,pr_hires,ref_sales&limit=500`,
      { headers: hdrs }
    );
    if (!r.ok) return res.status(500).json({ error: 'Fetch failed' });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
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
      .filter(s => s.agent_name)
      .map(s => ({
        week_of,
        agent_name: String(s.agent_name).trim(),
        weekly_net:  Math.round(Number(s.weekly_net)  || 0),
        pr_hires:    Math.round(Number(s.pr_hires)    || 0),
        ref_sales:   Math.round(Number(s.ref_sales)   || 0),
        updated_at:  now,
      }));

    if (records.length === 0) return res.status(400).json({ error: 'No valid records' });

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/alptoberfest_weekly_stats?on_conflict=week_of,agent_name`,
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
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Save failed', detail: err.slice(0, 200) });
    }
    return res.status(200).json({ success: true, saved: records.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
