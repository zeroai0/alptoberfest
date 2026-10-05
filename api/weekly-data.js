// Fetches Mon UPL ALP + HT ALP from HQ agent_stats for a given week
// Returns: [{name, monday_alp, ht_alp}]
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const { week_of } = req.query;
  if (!week_of) return res.status(400).json({ error: 'week_of required (YYYY-MM-DD)' });

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

    // Fetch agent_stats for the given week (both WO and WP)
    const statsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?week_of=eq.${week_of}&select=agent_id,monday_alp,ht_alp&limit=1000`,
      { headers: hdrs }
    );
    const stats = statsRes.ok ? await statsRes.json() : [];

    const result = [];
    if (Array.isArray(stats)) {
      stats.forEach(s => {
        const name = idToName[s.agent_id];
        if (name) {
          result.push({
            name,
            monday_alp: Number(s.monday_alp) || 0,
            ht_alp: Number(s.ht_alp) || 0,
          });
        }
      });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
