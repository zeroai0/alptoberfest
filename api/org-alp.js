// Returns October running Gross ALP tally for WO and WP
// Sums monday_alp + ht_alp from agent_stats across all October weeks
// Updated every Monday (Mon UPL) and Thursday (HT) as Emily enters data in HQ
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

// October week_of dates (Mon UPL upload dates)
const OCT_WEEKS = ['2026-10-05','2026-10-12','2026-10-19','2026-10-26'];

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    // Fetch all agent_stats rows for October weeks (both orgs)
    const weekFilter = OCT_WEEKS.map(w => `week_of.eq.${w}`).join(',');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?or=(${weekFilter})&select=agency,monday_alp,ht_alp&limit=2000`,
      { headers: hdrs }
    );
    const rows = r.ok ? await r.json() : [];

    // Sum monday_alp + ht_alp per org
    const result = { wo: 0, wp: 0 };
    if (Array.isArray(rows)) {
      rows.forEach(row => {
        const ag = (row.agency || '').toUpperCase();
        const contrib = (Number(row.monday_alp) || 0) + (Number(row.ht_alp) || 0);
        if (ag === 'WO') result.wo += contrib;
        else if (ag === 'WP') result.wp += contrib;
      });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
