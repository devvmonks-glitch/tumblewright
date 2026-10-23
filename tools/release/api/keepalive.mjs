// Vercel cron (daily, see vercel.json): pings the Supabase project so the free plan doesn't pause it
// after a week without use. The game uses that project's realtime channel for matchmaking.
const SUPA_URL = 'https://bblyrpmuvkqngrjvqian.supabase.co';
const SUPA_KEY = 'sb_publishable_115sboDtRpYXdDl7_bGTRA_NO-EphQB';   // public (publishable) key, same one the game ships with

export default async function handler(req, res) {
  try {
    const r = await fetch(SUPA_URL + '/auth/v1/settings', { headers: { apikey: SUPA_KEY } });   // a real API request on the project
    return res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e && e.message || e) });
  }
}
