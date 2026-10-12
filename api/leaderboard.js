// Returns all agents with contest Gross ALP from agent_stats
// + summed PR hires + ref sales from alptoberfest_weekly_stats
// Per competition week: use Mon UPL (official) if > 0, else HT (mid-week). Never both.
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

// Mon UPL is uploaded the following Monday and stored under that Monday's week_of.
// HT is entered Thursday of the competition week and stored under that week's Monday week_of.
// So monday_alp and ht_alp live in DIFFERENT week_of rows for the same competition week.
//
// Competition week pairings:
// mon_upl_date = week_of where monday_alp lives (uploaded the following Monday)
// ht_date      = week_of where ht_alp lives (the competition week's own Monday)
// For MTD gross: use mon_upl (official) if > 0, else fall back to ht (mid-week preview).
// NEVER sum both — they represent the same week's business.
const COMPETITION_WEEKS = [
  { mon_upl_date: '2026-10-05', ht_date: '2026-09-28' },  // Week 1
  { mon_upl_date: '2026-10-12', ht_date: '2026-10-05' },  // Week 2
  { mon_upl_date: '2026-10-19', ht_date: '2026-10-12' },  // Week 3
  { mon_upl_date: '2026-10-26', ht_date: '2026-10-19' },  // Week 4
  { mon_upl_date: '2026-11-02', ht_date: '2026-10-26' },  // Week 5
];
const ALL_DATES = [...new Set([
  ...COMPETITION_WEEKS.map(w => w.mon_upl_date),
  ...COMPETITION_WEEKS.map(w => w.ht_date),
])];

// HQ full name → leaderboard display name (for manual stats lookup)
// Manual stats are saved using the leaderboard display name
const HQ_TO_DISPLAY = {
  'alexis nichols':   'lexi nichols',
  'alexander stemle': 'alex stemle',
  'anna sorin':       'anya sorin',
  'ginevra renzetti': 'gigi renzetti',
  'benjamin shortridge': 'ben shortridge',
};

function manualKey(hqName) {
  const k = (hqName || '').toLowerCase().trim();
  return HQ_TO_DISPLAY[k] || k;
}

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    // 1. Fetch all relevant rows in one query (monday_alp + ht_alp per row)
    const dateFilter = ALL_DATES.map(w => `week_of.eq.${w}`).join(',');
    const rawRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?or=(${dateFilter})&select=agent_id,agency,week_of,monday_alp,ht_alp&limit=5000`,
      { headers: hdrs }
    );
    const rawRows = rawRes.ok ? await rawRes.json() : [];

    // Index rows by agent_id + week_of for fast lookup
    // rowIndex[agent_id][week_of] = { monday_alp, ht_alp, agency }
    const rowIndex = {};
    if (Array.isArray(rawRows)) {
      rawRows.forEach(r => {
        if (!r.agent_id || !r.week_of) return;
        if (!rowIndex[r.agent_id]) rowIndex[r.agent_id] = {};
        rowIndex[r.agent_id][r.week_of] = {
          monday_alp: Number(r.monday_alp) || 0,
          ht_alp:     Number(r.ht_alp)     || 0,
          agency:     r.agency,
        };
      });
    }

    // For each agent, sum MTD gross ALP:
    // Per competition week: use mon_upl (official) if > 0, else ht (mid-week fallback).
    // Never add both — they represent the same week's business.
    const agentAlp = {};  // agent_id → { alp, org }
    const allAgentIds = Object.keys(rowIndex);
    allAgentIds.forEach(agentId => {
      let total = 0;
      let org = '';
      COMPETITION_WEEKS.forEach(({ mon_upl_date, ht_date }) => {
        const monRow = rowIndex[agentId][mon_upl_date];
        const htRow  = rowIndex[agentId][ht_date];
        const monAlp = monRow ? monRow.monday_alp : 0;
        const htAlp  = htRow  ? htRow.ht_alp      : 0;
        // Mon UPL is official — if present use it; otherwise fall back to HT
        total += monAlp > 0 ? monAlp : htAlp;
        if (!org) org = (monRow && monRow.agency) || (htRow && htRow.agency) || '';
      });
      agentAlp[agentId] = { alp: total, org };
    });

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
      const { hires = 0, refs = 0 } = manualMap[manualKey(name)] || manualMap[name.toLowerCase().trim()] || {};
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
