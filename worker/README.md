# MedQuery online AI server

This small server lets MedQuery offer **"Online AI: no download"** on GitHub Pages. Visitors don't install anything and don't need an account. It runs on Cloudflare's free plan and uses Google's open **Gemma 4** model through Cloudflare Workers AI.

Until it's set up, MedQuery's online option uses **Puter** instead (each visitor signs in to a free Puter account).

## What it costs and what it uses
- **Free** on Cloudflare's free plan, up to a daily allowance of AI use shared by all visitors. If it runs out, MedQuery tells visitors to try tomorrow or switch to the downloaded AI. Check the current allowance on Cloudflare's Workers AI pricing page.
- Each visitor is limited to 12 questions a minute, and only your MedQuery site may use the server.
- Search words and short source extracts are sent to Cloudflare to be answered. **Reports are never sent**: MedQuery only reads them on the visitor's device.

## Set it up (about 10 minutes, no coding)
1. Create a free account at **dash.cloudflare.com/sign-up** and verify your email.
2. In the dashboard, open **Workers & Pages → Create → Create Worker** (start from "Hello World"). Name it `medquery-ai` and click **Deploy**.
3. Click **Edit code**, delete everything, paste the contents of [`src/index.js`](src/index.js), and click **Deploy**.
4. Go back to the Worker → **Settings → Bindings → Add → Workers AI**. Set the variable name to `AI` and save. (This gives the Worker access to the AI, with no key.)
5. Copy the Worker's address, which looks like `https://medquery-ai.<your-name>.workers.dev`. Open `https://medquery-ai.<your-name>.workers.dev/health` in a browser: you should see `{"ok":true,...}`.
6. Connect MedQuery: in `site/local-ai.js`, set `export const ONLINE_SERVER = "https://medquery-ai.<your-name>.workers.dev";`, commit, and push. (Or send me the address and I'll do it.)

If your MedQuery site address changes, add it to `ALLOWED_ORIGINS` at the top of `src/index.js` and deploy again.

## For developers
With [Wrangler](https://developers.cloudflare.com/workers/wrangler/): `cd worker && npx wrangler deploy`.

API: `POST /chat` with `{"messages":[{"role":"user","content":"..."}],"max_tokens":1400}` returns a streamed `text/event-stream`. `GET /health` returns `{"ok":true,"model":"..."}`. Errors: `429 {"error":"rate_limited" | "daily_limit"}`, `403` for other websites.
