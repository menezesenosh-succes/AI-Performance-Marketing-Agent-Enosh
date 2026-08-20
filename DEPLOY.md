# Deploying Ezekiel to Vercel

Static page plus one serverless function. Free tier is enough.

The point of the function: your n8n URL and shared key stay on Vercel's servers. The browser only ever talks to `/api/ezekiel`. Nobody reading the page source learns where your n8n lives.

---

## Before you start — lock the webhook

Right now `ezekiel/ask` accepts anything from anyone. On a public URL that means a stranger can drain your Gemini quota and write junk into `ezekiel_memory`. Fix that first.

1. In n8n, open **Ezekiel API** (the Webhook node).
2. Set **Authentication** to **Header Auth**.
3. Create a credential: **Name** `x-ezekiel-key`, **Value** a long random string. Generate one with `openssl rand -hex 32`.
4. Save and re-activate the workflow.
5. Keep that value — it becomes `N8N_WEBHOOK_SECRET` in step 3 below.

Do this *before* deploying, or there's a window where the endpoint is public and unauthenticated.

---

## Deploy

### Option A — drag and drop, no Git

1. Install the CLI: `npm i -g vercel`
2. From this folder: `vercel`
3. Accept the defaults. It detects the static page and the function on its own — no framework preset needed.
4. Set the environment variables (step 3), then `vercel --prod`.

### Option B — Git, so pushes redeploy

1. Push this folder to a **private** GitHub repo.
2. vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Other**. Leave build command and output directory empty.
4. Add the environment variables before the first deploy, then **Deploy**.

---

## Environment variables

Project → **Settings → Environment Variables**. Add all four to **Production**, **Preview** and **Development**.

| Name | Value |
|---|---|
| `N8N_BASE_URL` | `https://enoshprojects.app.n8n.cloud` |
| `N8N_WEBHOOK_PATH` | `ezekiel/ask` |
| `N8N_WEBHOOK_SECRET` | the header-auth value from step 4 above |
| `EZEKIEL_PASSCODE` | whatever you want to type on the unlock screen |

Changing a variable does not update a running deployment — redeploy after editing.

---

## Check it worked

Open the URL. You should get the unlock screen, then the console. Say *"Good morning Ezekiel."*

If something is off, the console tells you which layer failed rather than making you guess:

| What you see | What it means |
|---|---|
| Passcode rejected | `EZEKIEL_PASSCODE` differs from what you typed, or you edited it without redeploying |
| Could not reach n8n | `N8N_BASE_URL` is wrong, or the workflow is not active |
| Returned 403 | Header Auth is on in n8n but `N8N_WEBHOOK_SECRET` does not match |
| Did not respond within 55 seconds | A long report exceeded the function timeout — use Chat mode, or raise `maxDuration` in `vercel.json` (Pro plans allow more) |

---

## What HTTPS buys you

The microphone genuinely works better here than locally. `getUserMedia` and `SpeechRecognition` both need a secure context, and `file://` is inconsistent about qualifying. On Vercel you get HTTPS by default, so push-to-talk behaves the same on your phone as on your laptop.

Add the URL to your phone's home screen and it opens full-screen like an app.

---

## How protected is this, honestly

The passcode stops drive-by traffic. It is not a real auth system — anyone who has the passcode has full access, and there's no rate limiting or per-user audit.

That's proportionate for a private tool. If Ezekiel later touches live ad spend or gets Level 3 execute permissions, upgrade before that happens:

- **Vercel Deployment Protection** (Settings → Deployment Protection) puts real SSO in front of the whole site. Password protection on production needs a paid plan; check what your plan includes.
- Or put Cloudflare Access in front of the domain and drop the passcode entirely.

The part that already holds up: the n8n key never reaches the browser, the function validates and clamps every field before forwarding, and `mode` is restricted to the three known values so nothing arbitrary reaches your agent.

---

## Files

```
index.html        the console, posting to /api/ezekiel
api/ezekiel.js    the proxy — validates, adds the key, forwards to n8n
vercel.json       60s function timeout, security headers, mic permission
package.json      pins Node 20 and ES modules
.env.example      template for `vercel dev`; the real .env is gitignored
```

Run it locally against the real n8n with `vercel dev` after copying `.env.example` to `.env.local`.
