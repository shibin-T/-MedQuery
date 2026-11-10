// MedQuery online AI server (a Cloudflare Worker)
// ---------------------------------------------------------------------------
// MedQuery's web page can't keep a secret key, so it can't call an AI service directly.
// This tiny server sits in between: the page sends a question here, and the Worker asks
// Cloudflare's Workers AI (Google's open Gemma 4 model) and streams the answer back.
// No key is needed: the "AI" binding below gives this Worker access to Workers AI.
//
// Free plan: Cloudflare gives a free daily allowance of AI use. When it runs out,
// MedQuery tells visitors to try tomorrow or switch to the downloaded AI.
// ---------------------------------------------------------------------------

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

// Only these websites may use this server (so others can't use up your free allowance)
const ALLOWED_ORIGINS = [
  "https://shibin-t.github.io",
  "http://localhost:8000", // for testing on your own computer
];

// Simple per-visitor limit: at most 12 questions per minute from one internet address
const PER_MINUTE = 12;
const recent = new Map(); // best effort: each Cloudflare server keeps its own count

function tooMany(ip) {
  const now = Date.now(), list = (recent.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return list.length > PER_MINUTE;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) => Response.json(obj, { status, headers: cors });
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, model: MODEL });
    if (request.method !== "POST" || url.pathname !== "/chat") return json({ error: "not_found" }, 404);
    if (!allowed) return json({ error: "forbidden" }, 403);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (tooMany(ip)) return json({ error: "rate_limited" }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
    const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-8).map(m => ({
      role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
      content: String(m.content || "").slice(0, 24000),
    }));
    if (!messages.length) return json({ error: "bad_request" }, 400);
    const max_tokens = Math.min(Math.max(+body.max_tokens || 1400, 8), 2500);

    try {
      const stream = await env.AI.run(MODEL, { messages, max_tokens, temperature: 0.2, stream: true });
      return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    } catch (e) {
      const msg = String(e?.message || e);
      const limit = /neuron|quota|limit|7505|429|exceeded/i.test(msg);
      return json({ error: limit ? "daily_limit" : "model_error", detail: msg.slice(0, 200) }, limit ? 429 : 502);
    }
  },
};
