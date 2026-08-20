/**
 * /api/ezekiel — the only thing between the public internet and your n8n.
 *
 * Holds three secrets as Vercel environment variables so the browser
 * never sees them:
 *   N8N_BASE_URL        https://enoshprojects.app.n8n.cloud
 *   N8N_WEBHOOK_PATH    ezekiel/ask
 *   N8N_WEBHOOK_SECRET  the value you set on the n8n webhook's Header Auth
 *   EZEKIEL_PASSCODE    what you type on the unlock screen
 */

const ALLOWED_MODES = ['voice', 'chat', 'report'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Use POST.' });
  }

  // --- gate -------------------------------------------------------------
  const expected = process.env.EZEKIEL_PASSCODE;
  if (expected && req.headers['x-ezekiel-pass'] !== expected) {
    return res.status(401).json({ error: 'Passcode rejected.' });
  }

  // --- config -----------------------------------------------------------
  const base = process.env.N8N_BASE_URL;
  if (!base) {
    return res.status(500).json({
      error: 'N8N_BASE_URL is not set in this project\u2019s environment variables.'
    });
  }
  const path = (process.env.N8N_WEBHOOK_PATH || 'ezekiel/ask').replace(/^\/+/, '');

  // --- validate the payload rather than forwarding whatever arrives -----
  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required.' });
  if (message.length > 8000) return res.status(413).json({ error: 'message is too long.' });

  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
    ? body.sessionId.trim().slice(0, 120)
    : 'romin-main';
  const mode = ALLOWED_MODES.indexOf(body.mode) !== -1 ? body.mode : 'chat';
  const segment = body.env === 'test' ? '/webhook-test/' : '/webhook/';
  const target = base.replace(/\/+$/, '') + segment + path;

  // --- forward ----------------------------------------------------------
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['x-ezekiel-key'] = process.env.N8N_WEBHOOK_SECRET;
  }

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 55000);

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ message: message, sessionId: sessionId, mode: mode }),
      signal: controller.signal
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text || '{}');

  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'n8n did not respond within 55 seconds. A long report can exceed this \u2014 try Chat mode, or raise the function maxDuration.'
        : 'Could not reach n8n at ' + base + '. Check N8N_BASE_URL and that the workflow is active.'
    });
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
