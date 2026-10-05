// Returns current October MTD net ALP for WO and WP
// Pulls from pbl_agency_summary, most recent MTD row in October
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing service key' });

  const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/pbl_agency_summary?agency=in.(WO,WP)&period_type=eq.mtd&report_period=gte.2026-10-01&select=agency,gross,report_period&order=report_period.desc&limit=10`,
      { headers: hdrs }
    );
    const rows = r.ok ? await r.json() : [];

    // Take the most recent row per agency
    const result = { wo: 0, wp: 0 };
    const seen = {};
    if (Array.isArray(rows)) {
      rows.forEach(row => {
        const ag = (row.agency || '').toUpperCase();
        if (!seen[ag] && (ag === 'WO' || ag === 'WP')) {
          seen[ag] = true;
          if (ag === 'WO') result.wo = Number(row.gross) || 0;
          if (ag === 'WP') result.wp = Number(row.gross) || 0;
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
