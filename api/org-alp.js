// Returns October running Gross ALP tally for WO and WP
// Per competition week: use Mon UPL (official) if > 0, else fall back to HT (mid-week).
// Never sum both — they represent the same week's business written in HQ.
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

// Competition week pairings:
// mon_upl_date = week_of where monday_alp lives (uploaded the following Monday)
// ht_date      = week_of where ht_alp lives (the competition week's own Monday)
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

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    // Fetch all relevant rows in one query
    const dateFilter = ALL_DATES.map(w => `week_of.eq.${w}`).join(',');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_stats?or=(${dateFilter})&select=agent_id,agency,week_of,monday_alp,ht_alp&limit=5000`,
      { headers: hdrs }
    );
    const rows = r.ok ? await r.json() : [];

    // Index by agent_id + week_of
    const rowIndex = {};
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (!r.agent_id || !r.week_of) return;
        if (!rowIndex[r.agent_id]) rowIndex[r.agent_id] = {};
        rowIndex[r.agent_id][r.week_of] = {
          monday_alp: Number(r.monday_alp) || 0,
          ht_alp:     Number(r.ht_alp)     || 0,
          agency:     r.agency,
        };
      });
    }

    // Sum per org: for each week use Mon UPL if available, else HT
    const result = { wo: 0, wp: 0 };
    Object.entries(rowIndex).forEach(([agentId, weeks]) => {
      // Determine org from any available row
      const orgRaw = Object.values(weeks).find(w => w.agency)?.agency || '';
      const org = orgRaw.toUpperCase();
      if (org !== 'WO' && org !== 'WP') return;

      let total = 0;
      COMPETITION_WEEKS.forEach(({ mon_upl_date, ht_date }) => {
        const monAlp = weeks[mon_upl_date] ? weeks[mon_upl_date].monday_alp : 0;
        const htAlp  = weeks[ht_date]      ? weeks[ht_date].ht_alp          : 0;
        total += monAlp > 0 ? monAlp : htAlp;
      });
      result[org.toLowerCase()] += total;
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
