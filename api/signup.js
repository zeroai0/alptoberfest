// Vercel serverless function — keeps service role key off the frontend
const SUPABASE_URL = 'https://vjcfbccsybkriefnyvhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    full_name, phone, email, org, manager,
    alp_goal, goal_why, prize_picks, prize_idea, tips_read, attendance
  } = req.body;

  if (!full_name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }

  const payload = {
    attendance: attendance || null,
    full_name: full_name.trim(),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    org: org || null,
    manager: manager || null,
    alp_goal: alp_goal ? parseFloat(alp_goal) : null,
    goal_why: goal_why || null,
    prize_picks: Array.isArray(prize_picks) ? prize_picks : (prize_picks ? [prize_picks] : []),
    prize_idea: prize_idea || null,
    tips_read: !!tips_read,
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/alptoberfest_signups`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Failed to save. Try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
}
