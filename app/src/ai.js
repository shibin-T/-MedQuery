// AI engines for the app.
//   "claude": Claude through the Anthropic API, with the user's own API key.
//   "ollama": the free Ollama app on a computer on the same network (open models).
// Both return parsed JSON, the same shape the website uses.
import Anthropic from "@anthropic-ai/sdk";
import { parseJSONLoose } from "./core";

export const CLAUDE_MODEL = "claude-opus-5-5";
const SYSTEM = "You are MedQuery, a careful medical information assistant. Be accurate and cautious, use plain language, never invent facts, studies, identifiers, phone numbers or sources, never give personal doses, and always follow the requested output format exactly. Reply with ONE valid JSON value and nothing else.";

const err = (code, message) => Object.assign(new Error(message || code), { code });

export function engineReady(settings) {
  if (settings.engine === "claude") return !!settings.apiKey;
  if (settings.engine === "ollama") return !!(settings.ollamaUrl && settings.ollamaModel);
  return false;
}
export function engineLabel(settings) {
  return settings.engine === "ollama" ? "Ollama · " + settings.ollamaModel : "Claude";
}

/**
 * Ask the AI for JSON.
 * @param attachments [{kind:"image", mediaType, base64} | {kind:"pdf", base64}]
 * @param effort "low" for quick lookups, "medium" for full answers and reports
 */
export async function askJSON(settings, prompt, { attachments = [], signal, maxTokens = 8000, effort = "medium" } = {}) {
  if (!engineReady(settings)) throw err("no_engine", "Set up an AI engine in Settings first.");
  return settings.engine === "ollama" ? askOllama(settings, prompt, attachments, signal) : askClaude(settings, prompt, attachments, signal, maxTokens, effort);
}

async function askClaude(settings, prompt, attachments, signal, maxTokens, effort) {
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const content = [
    ...attachments.map(a => a.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } }
      : { type: "image", source: { type: "base64", media_type: a.mediaType || "image/jpeg", data: a.base64 } }),
    { type: "text", text: prompt }
  ];
  let res;
  try {
    res = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: SYSTEM,
      output_config: { effort },
      // If a safety check declines, the API retries on a fallback model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }]
    }, { signal });
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError || signal?.aborted) throw err("cancelled");
    if (e instanceof Anthropic.AuthenticationError) throw err("bad_key", "The Claude API key was not accepted. Check it in Settings.");
    if (e instanceof Anthropic.PermissionDeniedError) throw err("bad_key", "This API key isn't allowed to use " + CLAUDE_MODEL + ".");
    if (e instanceof Anthropic.RateLimitError) throw err("rate_limited", "Too many requests right now. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) throw err("bad_request", e.message);
    if (e instanceof Anthropic.APIConnectionError) throw err("offline", "Couldn't reach Claude. Check your internet connection.");
    if (e instanceof Anthropic.APIError) throw err("api_error", "Claude returned an error (" + e.status + "). Try again.");
    throw err("api_error", String(e?.message || e));
  }
  if (res.stop_reason === "refusal") throw err("refused", "This question can't be answered here. Try rephrasing it as a general medical question.");
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  try { return parseJSONLoose(text); }
  catch { throw err("invalid_json", res.stop_reason === "max_tokens" ? "The answer was too long and got cut off. Try the quick version." : "The answer came back incomplete. Try again."); }
}

async function askOllama(settings, prompt, attachments, signal) {
  if (attachments.some(a => a.kind === "pdf")) throw err("no_pdf", "Ollama can't read PDFs. Use a photo of the report, or switch to Claude in Settings.");
  const images = attachments.filter(a => a.kind === "image").map(a => a.base64);
  let r;
  try {
    r = await fetch(settings.ollamaUrl.replace(/\/+$/, "") + "/api/chat", {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.ollamaModel, stream: false, format: "json", think: false, options: { temperature: 0.2, num_ctx: 8192 },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt, ...(images.length ? { images } : {}) }] })
    });
  } catch (e) {
    if (signal?.aborted) throw err("cancelled");
    throw err("offline", "Can't reach Ollama at " + settings.ollamaUrl + ". Is it running on that computer, on the same Wi-Fi?");
  }
  if (!r.ok) throw err("api_error", "Ollama error " + r.status);
  const j = await r.json();
  return parseJSONLoose(j?.message?.content || "");
}

export async function ollamaModels(url) {
  const r = await fetch(url.replace(/\/+$/, "") + "/api/tags");
  if (!r.ok) throw new Error("Ollama answered " + r.status);
  return ((await r.json()).models || []).map(m => m.name);
}
