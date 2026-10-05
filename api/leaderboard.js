// Returns all agents with contest Gross ALP (from agent_stats monday_alp + ht_alp)
// + summed PR hires + ref sales from alptoberfest_weekly_stats
// ALP source: same as bars — sums all October Mon UPL + HT entries from HQ
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

// October week_of fetch dates
const OCT_WEEKS = ['2026-10-05','2026-10-12','2026-10-19','2026-10-26'];

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    // 1. Fetch all agent_stats for October (gross ALP = monday_alp + ht_alp per agent per week)
    const weekFilter = OCT_WEEKS.map(w => `week_of.eq.${w}`).join(',');
    const statsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?or=(${weekFilter})&select=agent_id,agency,monday_alp,ht_alp&limit=2000`,
      { headers: hdrs }
    );
    const statsRows = statsRes.ok ? await statsRes.json() : [];

    // Sum gross ALP per agent_id
    const agentAlp = {};   // agent_id → { alp, org }
    if (Array.isArray(statsRows)) {
      statsRows.forEach(r => {
        if (!r.agent_id) return;
        const contrib = (Number(r.monday_alp) || 0) + (Number(r.ht_alp) || 0);
        if (!agentAlp[r.agent_id]) agentAlp[r.agent_id] = { alp: 0, org: r.agency };
        agentAlp[r.agent_id].alp += contrib;
      });
    }

    // 2. Get agent names from agents table
    const agentIds = Object.keys(agentAlp);
    if (!agentIds.length) return res.status(200).json([]);

    const batchSize = 200;
    const nameMap = {}; // agent_id → name
    for (let i = 0; i < agentIds.length; i += batchSize) {
      const batch = agentIds.slice(i, i + batchSize);
      const idFilter = batch.map(id => `id.eq.${encodeURIComponent(id)}`).join(',');
      const agRes = await fetch(
        `${SUPABASE_URL}/rest/v1/agents?or=(${idFilter})&select=id,name&limit=${batchSize}`,
        { headers: hdrs }
      );
      const agRows = agRes.ok ? await agRes.json() : [];
      if (Array.isArray(agRows)) agRows.forEach(a => { if (a.id && a.name) nameMap[a.id] = a.name; });
    }

    // 3. Fetch summed manual stats (pr_hires + ref_sales) per agent name
    const manualRes = await fetch(
      `${SUPABASE_URL}/rest/v1/alptoberfest_weekly_stats?select=agent_name,pr_hires,ref_sales&limit=2000`,
      { headers: hdrs }
    );
    const manualRows = manualRes.ok ? await manualRes.json() : [];
    const manualMap = {}; // normalized name → {hires, refs}
    if (Array.isArray(manualRows)) {
      manualRows.forEach(s => {
        const key = (s.agent_name || '').toLowerCase().trim();
        if (!manualMap[key]) manualMap[key] = { hires: 0, refs: 0 };
        manualMap[key].hires += Number(s.pr_hires) || 0;
        manualMap[key].refs  += Number(s.ref_sales) || 0;
      });
    }

    // 4. Build leaderboard rows
    const result = [];
    Object.entries(agentAlp).forEach(([agentId, { alp, org }]) => {
      if (alp <= 0) return;
      const name = nameMap[agentId];
      if (!name) return;
      const key = name.toLowerCase().trim();
      const { hires = 0, refs = 0 } = manualMap[key] || {};
      result.push({ name, org, alp, hires, refs, spread: 0 });
    });

    // Sort by total tickets
    result.sort((a, b) => {
      const tA = a.alp + a.spread + a.hires * 500 + a.refs * 250;
      const tB = b.alp + b.spread + b.hires * 500 + b.refs * 250;
      return tB - tA;
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result.slice(0, 10));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
