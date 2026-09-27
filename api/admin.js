const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASS = process.env.ADMIN_PASS || 'waisman2026';

export default async function handler(req, res) {
  const { pass } = req.query;
  if (pass !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/alptoberfest_signups?select=*&order=submitted_at.desc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  const data = await r.json();
  return res.status(200).json(data);
}
