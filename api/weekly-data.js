// Fetches Mon UPL ALP + HT ALP from HQ agent_stats for a given week
// Returns: [{name, monday_alp, ht_alp}]
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  // week_of      = competition week start (used for ht_alp — entered mid-week)
  // mon_week_of  = following Monday's HQ week (used for monday_alp — uploaded one week later)
  //                If not provided, falls back to week_of (backward compat).
  const { week_of, mon_week_of } = req.query;
  if (!week_of) return res.status(400).json({ error: 'week_of required (YYYY-MM-DD)' });
  const monWeekOf = mon_week_of || week_of;

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    // Fetch agents: id → name (include termed so we can match everyone in competition)
    const agentsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?select=id,name&limit=1000`,
      { headers: hdrs }
    );
    const agents = agentsRes.ok ? await agentsRes.json() : [];
    const idToName = {};
    if (Array.isArray(agents)) {
      agents.forEach(a => { if (a.id && a.name) idToName[a.id] = a.name; });
    }

    // Fetch ht_alp from the competition week (entered Thursday of that week)
    const htRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?week_of=eq.${week_of}&select=agent_id,ht_alp&limit=1000`,
      { headers: hdrs }
    );
    const htRows = htRes.ok ? await htRes.json() : [];

    // Fetch monday_alp from the FOLLOWING Monday's HQ week
    // (Mon UPL is always for the PREVIOUS competition week, stored under the current HQ week)
    const monRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?week_of=eq.${monWeekOf}&select=agent_id,monday_alp&limit=1000`,
      { headers: hdrs }
    );
    const monRows = monRes.ok ? await monRes.json() : [];

    // Build per-agent maps
    const htMap  = {}; // agent_id → ht_alp
    const monMap = {}; // agent_id → monday_alp
    if (Array.isArray(htRows))  htRows.forEach(r  => { htMap[r.agent_id]  = Number(r.ht_alp)     || 0; });
    if (Array.isArray(monRows)) monRows.forEach(r => { monMap[r.agent_id] = Number(r.monday_alp) || 0; });

    // Union all agent_ids seen in either result
    const allIds = new Set([...Object.keys(htMap), ...Object.keys(monMap)]);

    const result = [];
    allIds.forEach(agentId => {
      const name = idToName[agentId];
      if (!name) return;
      result.push({
        name,
        monday_alp: monMap[agentId] || 0,
        ht_alp:     htMap[agentId]  || 0,
      });
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
