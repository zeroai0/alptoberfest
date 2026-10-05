// Returns all agents with MTD net ALP + summed PR hires + ref sales for ticket calc
// MTD ALP from pbl_agent_recap (latest October period)
// PR hires + ref sales summed from alptoberfest_weekly_stats
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    // 1. Get latest October MTD report period
    const periodRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pbl_agent_recap?agency=in.(WO,WP)&period_type=eq.mtd&report_period=gte.2026-10-01&select=report_period&order=report_period.desc&limit=1`,
      { headers: hdrs }
    );
    const periodRows = periodRes.ok ? await periodRes.json() : [];
    const latestPeriod = periodRows[0]?.report_period;
    if (!latestPeriod) return res.status(200).json([]);

    // 2. Fetch all agent MTD net ALP for that period
    const alpRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pbl_agent_recap?period_type=eq.mtd&report_period=eq.${latestPeriod}&agency=in.(WO,WP)&is_rga_mga_only=eq.false&select=agent_name,lvl1_net,agency&limit=500`,
      { headers: hdrs }
    );
    const alpRows = alpRes.ok ? await alpRes.json() : [];

    // 3. Fetch all manual weekly stats (sum pr_hires + ref_sales per agent across all weeks)
    const statsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/alptoberfest_weekly_stats?select=agent_name,pr_hires,ref_sales&limit=1000`,
      { headers: hdrs }
    );
    const statsRows = statsRes.ok ? await statsRes.json() : [];

    // Aggregate hires + refs per agent
    const statsMap = {};
    if (Array.isArray(statsRows)) {
      statsRows.forEach(s => {
        const key = (s.agent_name || '').toLowerCase().trim();
        if (!statsMap[key]) statsMap[key] = { hires: 0, refs: 0 };
        statsMap[key].hires += Number(s.pr_hires) || 0;
        statsMap[key].refs  += Number(s.ref_sales) || 0;
      });
    }

    // Build leaderboard rows
    const result = [];
    if (Array.isArray(alpRows)) {
      alpRows.forEach(row => {
        const alp = Number(row.lvl1_net) || 0;
        if (alp <= 0) return; // skip agents with no ALP
        const key = (row.agent_name || '').toLowerCase().trim();
        const { hires = 0, refs = 0 } = statsMap[key] || {};
        result.push({
          name:   row.agent_name,
          org:    row.agency,
          alp,
          hires,
          refs,
          // spread tickets added later — stored separately per week
          spread: 0,
        });
      });
    }

    // Sort by total tickets descending
    result.sort((a, b) => {
      const tA = a.alp + a.spread + a.hires * 500 + a.refs * 250;
      const tB = b.alp + b.spread + b.hires * 500 + b.refs * 250;
      return tB - tA;
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
