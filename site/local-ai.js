// MedQuery on-device AI
// ---------------------------------------------------------------------------
// When MedQuery is opened OUTSIDE Claude (for example on GitHub Pages), there is
// no built-in Claude connection. This module provides a replacement with the SAME
// shape the rest of the app already uses:
//
//   const ai = await MQLocal.getSampler();
//   const answer = await ai.json(prompt, { onText, signal });
//
// so search, reports, definitions and translation all keep working, but the AI
// runs free on the visitor's own device:
//   1. "browser": WebLLM runs a small open model on the graphics chip (WebGPU).
//      First use downloads the model once (about 1.5-4 GB); after that it's cached.
//   2. "ollama": the free Ollama app on the visitor's computer runs a bigger model.
//
// Small models make more mistakes, so every answer is GROUNDED: we first look the
// topic up in free official sources (US National Library of Medicine, openFDA,
// Europe PMC open-access research) and tell the model to answer only from them.
// ---------------------------------------------------------------------------

export const BUILD = "2026-11-10.4"; // must match MQ_BUILD in index.html
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.87";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
const SETTINGS_KEY = "medquery.localAI";
const PUTER_URL = "https://js.puter.com/v2/";

// ---------- ONLINE AI (no download) ----------
// Address of MedQuery's own free AI server (a Cloudflare Worker; see worker/README.md).
// Leave empty until it's deployed: the online option then uses Puter instead.
export const ONLINE_SERVER = "";
export const ONLINE_MODEL_LABEL = "Gemma 4 · 26B (Google's open model)";
const PUTER_MODEL = "google/gemma-4-26b-a4b-it";

// Live usage numbers for the resource widget (this visit only)
export const usage = { lookupBytes: 0, onlineBytes: 0, downloadBytes: 0, requests: 0, working: false, lastMs: 0, lastChars: 0, startedAt: 0 };
const TODAY_KEY = "medquery.onlineToday";
export function onlineToday() { try { const t = JSON.parse(localStorage.getItem(TODAY_KEY) || "{}"); return t.day === new Date().toDateString() ? t.n : 0; } catch { return 0; } }
function countOnline() { try { localStorage.setItem(TODAY_KEY, JSON.stringify({ day: new Date().toDateString(), n: onlineToday() + 1 })); } catch {} }
let usageHook = null;
export function onUsage(fn) { usageHook = fn; }
const bump = () => usageHook?.(usage);

// Browser models we offer. Sizes are the one-time download / memory need.
// gb = one-time download and storage; ramGb = approximate memory used while the AI is running (approximate, varies by device)
export const BROWSER_MODELS = [
  { id: "Qwen3.5-4B-q4f16_1-MLC", f32: "Qwen3.5-4B-q4f32_1-MLC", label: "Qwen 3.5 · 4B (recommended for laptops)", short: "Standard", gb: 3.9, ramGb: 4.5, quality: "Good" },
  { id: "Qwen3.5-2B-q4f16_1-MLC", f32: "Qwen3.5-2B-q4f32_1-MLC", label: "Qwen 3.5 · 2B (phones and older laptops)", short: "Light", gb: 2.3, ramGb: 2.8, quality: "Fair" },
  { id: "Qwen3.5-9B-q4f16_1-MLC", f32: null, label: "Qwen 3.5 · 9B (powerful computers only)", short: "Most accurate", gb: 6.5, ramGb: 7.5, quality: "Best" },
  { id: "Qwen3.5-0.8B-q4f16_1-MLC", f32: "Qwen3.5-0.8B-q4f32_1-MLC", label: "Qwen 3.5 · 0.8B (very low memory; least reliable)", short: "Smallest", gb: 1.6, ramGb: 1.9, quality: "Basic" }
];

// ---------- settings (kept on this device only) ----------
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch {}
  return { engine: s.engine || "", model: s.model || "", ollamaUrl: s.ollamaUrl || "http://localhost:11434", ollamaModel: s.ollamaModel || "", ollamaFolder: s.ollamaFolder || "",
    online: { provider: s.online?.provider || "", url: s.online?.url || ONLINE_SERVER }, downloaded: s.downloaded || {}, setup: s.setup || {} };
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

// Pick a sensible default model from what the device reports
export async function suggestModel() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 4; // GB, Chrome only (capped at 8)
  if (mobile || mem < 8) return BROWSER_MODELS[1].id;
  return BROWSER_MODELS[0].id;
}

// ---------- set-up state ----------
// "Set up" means: the chosen AI has been downloaded (or Ollama connected) AND answered a short test.
// engine: "online" | "browser" (downloaded into the browser) | "ollama" (downloaded into the Ollama app)
export function engineReady(kind, s = loadSettings()) {
  if (kind === "online") return !!s.setup.online?.provider;
  if (kind === "ollama") return !!(s.ollamaModel && s.setup.ollama?.model === s.ollamaModel);
  if (kind === "browser") return !!(s.model && s.setup.browser?.model === s.model);
  return false;
}
export function isSetUp(s = loadSettings()) { return engineReady(s.engine, s); }
// Reports never leave the device, so they need an AI that runs here
export function localEngine(s = loadSettings()) { return s.engine === "browser" || s.engine === "ollama" ? (engineReady(s.engine, s) ? s.engine : null) : engineReady("browser", s) ? "browser" : engineReady("ollama", s) ? "ollama" : null; }
// Is the model's data still stored in this browser? (Browsers can delete it to free space.) null = can't tell.
export async function modelOnDisk(modelId) {
  try {
    if (!("caches" in window)) return null;
    const m = BROWSER_MODELS.find(x => x.id === modelId);
    const names = (await caches.keys()).filter(n => /webllm/i.test(n));
    if (!names.length) return null; // no WebLLM storage found under the names we know: can't tell, so don't assume it's gone
    for (const n of names) { const ks = await (await caches.open(n)).keys(); if (ks.some(r => r.url.includes(modelId) || (m?.f32 && r.url.includes(m.f32)))) return true; }
    return false;
  } catch { return null; }
}
// Re-check on page load; if the browser cleared the download, the AI needs setting up again
export async function verifySetup() {
  const s = loadSettings();
  let evicted = false;
  if (s.setup.browser && (await modelOnDisk(s.setup.browser.model)) === false) { delete s.downloaded[s.setup.browser.model]; delete s.setup.browser; saveSettings(s); evicted = true; }
  return { ok: isSetUp(s), evicted };
}
const browserName = () => { const u = navigator.userAgent; return /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "this browser"; };
// What this device offers, in plain terms, for the setup screen
export async function deviceCheck() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const gpu = await webgpuStatus();
  let freeGB = null; try { const e = await navigator.storage?.estimate?.(); if (e?.quota) freeGB = Math.max(0, (e.quota - (e.usage || 0)) / 1e9); } catch {}
  let battery = null; try { if (navigator.getBattery) { const b = await navigator.getBattery(); battery = { charging: b.charging, level: Math.round(b.level * 100) }; } } catch {}
  const c = navigator.connection || {};
  return { mobile, gpu, memGB: navigator.deviceMemory || null, freeGB, battery, saveData: !!c.saveData, cellular: c.type === "cellular", net: c.effectiveType || "", browser: browserName(), cores: navigator.hardwareConcurrency || null };
}

// Can this browser run models on the graphics chip?
export async function webgpuStatus() {
  if (!("gpu" in navigator)) return { ok: false, reason: "This browser doesn't support WebGPU. Use a recent Chrome or Edge, or switch to Ollama." };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "No compatible graphics chip was found. Try Chrome or Edge, or switch to Ollama." };
    return { ok: true, f16: adapter.features.has("shader-f16") };
  } catch (e) { return { ok: false, reason: "WebGPU couldn't start: " + (e?.message || e) }; }
}

// ---------- robust JSON from a small model ----------
// Close a JSON reply that was cut off part-way (small models often run out of room):
// drop the unfinished last value, then add the missing closing quotes and brackets.
function closeTruncated(t) {
  const stack = []; let inStr = false, esc = false, lastSafe = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") { stack.pop(); if (!stack.length) return t.slice(0, i + 1); }
    if (!inStr && (c === "," || c === "{" || c === "[")) lastSafe = i;
  }
  if (lastSafe < 0) return "";
  let body = t.slice(0, lastSafe + 1).replace(/[,\s]+$/, "");
  // recount the open brackets in the kept part
  const st = []; inStr = false; esc = false;
  for (const c of body) { if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === "{" || c === "[") st.push(c); else if (c === "}" || c === "]") st.pop(); }
  return body + st.reverse().map(c => c === "{" ? "}" : "]").join("");
}
export function parseJSONLoose(text) {
  let t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const fix = x => x.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
  const a = t.indexOf("{"), a2 = t.indexOf("[");
  const start = a >= 0 && (a2 < 0 || a < a2) ? a : a2;
  if (start < 0) throw Object.assign(new Error("no JSON in reply"), { code: "invalid_json", text: t });
  const from = t.slice(start), close = from[0] === "{" ? "}" : "]";
  const whole = from.slice(0, from.lastIndexOf(close) + 1);
  if (whole) { try { return JSON.parse(fix(whole)); } catch {} }
  const cut = closeTruncated(from); // the reply was cut off: keep what's complete
  if (cut) { try { const v = JSON.parse(fix(cut)); if (v && typeof v === "object") { v.__truncated = true; return v; } } catch {} }
  throw Object.assign(new Error("bad JSON"), { code: "invalid_json", text: t });
}

// How many characters of source material fit for the current AI (small models have a ~4,000-token memory)
export function sourceBudget(s = loadSettings()) {
  if (s.engine === "browser") return /0\.8B|2B/.test(s.model) ? 2200 : /4B/.test(s.model) ? 3600 : 4500;
  return 6000;
}

// ---------- engines ----------
let webllm = null, engine = null, engineModel = null, loading = null, idleTimer = null;
const IDLE_MS = 10 * 60 * 1000; // free the graphics memory after 10 minutes without use
let stateHook = null;
export function onEngineState(fn) { stateHook = fn; }
export function engineLoaded() { return !!engine; }
export async function freeMemory() { clearTimeout(idleTimer); if (engine) { try { await engine.unload(); } catch {} engine = null; engineModel = null; stateHook?.("sleeping"); } }
function touchIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(freeMemory, IDLE_MS); }

async function loadBrowserEngine(modelId, onProgress) {
  if (engine && engineModel === modelId) return engine;
  if (loading) return loading;
  loading = (async () => {
    const gpu = await webgpuStatus();
    if (!gpu.ok) throw Object.assign(new Error(gpu.reason), { code: "no_webgpu" });
    const m = BROWSER_MODELS.find(x => x.id === modelId) || BROWSER_MODELS[0];
    const id = gpu.f16 || !m.f32 ? m.id : m.f32; // older chips need the f32 build
    webllm ||= await import(/* webpackIgnore: true */ WEBLLM_URL);
    if (engine) { try { await engine.unload(); } catch {} engine = null; }
    engine = await webllm.CreateMLCEngine(id, {
      initProgressCallback: p => { const mb = +(String(p.text || "").match(/(\d+(?:\.\d+)?)\s*MB fetched/i)?.[1] || 0); if (mb) { usage.downloadBytes = mb * 1e6; bump(); } onProgress?.({ progress: p.progress ?? 0, text: p.text || "" }); }
    });
    engineModel = modelId; stateHook?.("loaded");
    return engine;
  })().finally(() => { loading = null; });
  return loading;
}

// Some models fail in WebLLM's strict JSON mode partway through an answer (e.g. "Grammar matcher
// rejected the newly sampled token"). When that happens we retry in plain mode, which our
// parseJSONLoose() can still read, and remember not to use strict mode for that model again.
const JSON_OFF_KEY = "medquery.jsonModeOff";
const jsonOff = id => { try { return !!JSON.parse(localStorage.getItem(JSON_OFF_KEY) || "{}")[id]; } catch { return false; } };
function setJsonOff(id) { try { const m = JSON.parse(localStorage.getItem(JSON_OFF_KEY) || "{}"); m[id] = true; localStorage.setItem(JSON_OFF_KEY, JSON.stringify(m)); } catch {} }
const isCancel = (e, signal) => e?.code === "cancelled" || signal?.aborted;
// Shorten the longest message (the SOURCES block first) when a prompt is too long for a small model
function shrinkMessages(messages, ratio) {
  const i = messages.reduce((best, m, k) => m.content.length > messages[best].content.length ? k : best, 0);
  const c = messages[i].content, at = c.indexOf("SOURCES"), end = c.indexOf("\nTASK:");
  let out;
  if (at >= 0 && end > at) { const src = c.slice(at, end); out = c.slice(0, at) + src.slice(0, Math.floor(src.length * ratio)) + "\n[…sources shortened to fit…]\n" + c.slice(end); }
  else out = c.slice(0, Math.floor(c.length * ratio));
  return messages.map((m, k) => k === i ? { ...m, content: out } : m);
}
async function chatBrowser(messages, { json, onText, signal, maxTokens, onProgress, settings }) {
  const eng = await loadBrowserEngine(settings.model, onProgress);
  touchIdle();
  const strict = json && !jsonOff(settings.model);
  const once = async (msgs, useStrict) => {
    const req = { messages: msgs, temperature: 0.2, max_tokens: maxTokens, frequency_penalty: 0.3, stream: true, extra_body: { enable_thinking: false } };
    if (useStrict) req.response_format = { type: "json_object" };
    let out = "";
    const stream = await eng.chat.completions.create(req);
    for await (const chunk of stream) {
      if (signal?.aborted) { try { eng.interruptGenerate(); } catch {} throw Object.assign(new Error("cancelled"), { code: "cancelled" }); }
      const d = chunk.choices?.[0]?.delta?.content || "";
      if (d) { out += d; onText?.({ text: out, delta: d }); }
    }
    return out;
  };
  // Fit the prompt and the answer into the model's memory (WebLLM's small models: 4,096 tokens; ~3 characters per token)
  const CTX = 4096, est = ms => Math.ceil(ms.reduce((n, m) => n + m.content.length, 0) / 3) + 80;
  let msgs = messages, want = maxTokens || 1400;
  for (let i = 0; i < 3 && CTX - est(msgs) < Math.min(want, 700); i++) msgs = shrinkMessages(msgs, .6);
  maxTokens = Math.max(64, Math.min(want, CTX - est(msgs) - 32));
  let strictNow = strict;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const out = await once(msgs, strictNow && !jsonOff(settings.model));
      touchIdle();
      return out;
    } catch (e) {
      if (isCancel(e, signal)) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
      const msg = String(e?.message || e), name = e?.name || "";
      console.warn("MedQuery on-device AI error:", name, msg);
      try { eng.resetChat?.(); } catch {}
      if (/ContextWindowSizeExceeded|exceed context window/i.test(name + " " + msg)) { msgs = shrinkMessages(msgs, .55); continue; }
      if (strictNow && /grammar|response.?format|json/i.test(name + " " + msg)) { setJsonOff(settings.model); strictNow = false; continue; } // strict JSON mode is broken for this model
      if (strictNow) { strictNow = false; continue; } // unknown error: try once more in plain mode
      if (/DeviceLost|device was lost|device lost|out of memory|OOM/i.test(name + " " + msg)) { await freeMemory(); throw Object.assign(new Error("The graphics chip ran out of memory or was reset."), { code: "device_lost", detail: msg }); }
      throw Object.assign(new Error(msg), { code: "engine_error", detail: (name ? name + ": " : "") + msg });
    }
  }
  throw Object.assign(new Error("The AI couldn't finish the answer after several tries."), { code: "engine_error", detail: "retries exhausted" });
}

// --- Online: MedQuery's server (Cloudflare Worker) ---
export async function serverHealth(url) {
  const r = await fetch(url.replace(/\/+$/, "") + "/health", { cache: "no-store" });
  if (!r.ok) throw new Error("server answered " + r.status);
  return r.json();
}
async function readSSE(r, onText, signal) {
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = "";
  for (;;) {
    if (signal?.aborted) { try { reader.cancel(); } catch {} throw Object.assign(new Error("cancelled"), { code: "cancelled" }); }
    const { done, value } = await reader.read(); if (done) break;
    usage.onlineBytes += value.byteLength;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
      try { const j = JSON.parse(data); const d = j.response ?? j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? ""; if (d) { out += d; onText?.({ text: out, delta: d }); } } catch {}
    }
  }
  return out;
}
async function chatServer(messages, { onText, signal, maxTokens, settings, json }) {
  const body = JSON.stringify({ messages, max_tokens: maxTokens || 1400, json: !!json });
  usage.onlineBytes += body.length;
  let r;
  try { r = await fetch(settings.online.url.replace(/\/+$/, "") + "/chat", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body }); }
  catch (e) { if (signal?.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" }); throw Object.assign(new Error("Couldn't reach MedQuery's online AI. Check your internet."), { code: "online_unreachable" }); }
  if (r.status === 429) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error === "daily_limit" ? "Today's free online AI allowance is used up." : "Too many questions at once. Wait a minute."), { code: j.error === "daily_limit" ? "daily_limit" : "rate_limited" }); }
  if (!r.ok) throw Object.assign(new Error("The online AI had a problem (" + r.status + ")."), { code: "online_error" });
  countOnline();
  return readSSE(r, onText, signal);
}
// --- Online: Puter (each visitor signs in to a free Puter account, which covers their usage) ---
function loadScriptOnce(src, test) { return test() ? Promise.resolve() : new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("could not load " + src)); document.head.append(el); }); }
export async function puterReady() { await loadScriptOnce(PUTER_URL, () => !!window.puter); return window.puter; }
export async function puterSignedIn() { try { const p = await puterReady(); return !!(await p.auth.isSignedIn()); } catch { return false; } }
export async function puterSignIn() { const p = await puterReady(); return p.auth.signIn(); } // must be called from a click (it opens a pop-up)
export async function puterSignOut() { try { const p = await puterReady(); await p.auth.signOut(); } catch {} }
export async function puterUser() { try { const p = await puterReady(); return (await p.auth.getUser())?.username || ""; } catch { return ""; } }
async function chatPuter(messages, { onText, signal, maxTokens }) {
  const p = await puterReady();
  if (!(await p.auth.isSignedIn())) throw Object.assign(new Error("Sign in to Puter to use the online AI."), { code: "puter_signin" });
  usage.onlineBytes += JSON.stringify(messages).length;
  const resp = await p.ai.chat(messages, { model: PUTER_MODEL, stream: true, max_tokens: maxTokens || 1400, temperature: 0.2 });
  countOnline();
  let out = "";
  for await (const part of resp) {
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    const t = part?.text || ""; if (t) { out += t; usage.onlineBytes += t.length; onText?.({ text: out, delta: t }); }
  }
  return out;
}
const chatOnline = (messages, args) => args.settings.online.provider === "puter" ? chatPuter(messages, args) : chatServer(messages, args);

export async function ollamaModels(url) {
  const r = await fetch(url.replace(/\/+$/, "") + "/api/tags");
  if (!r.ok) throw new Error("Ollama answered " + r.status);
  const j = await r.json();
  return (j.models || []).map(m => ({ name: m.name, gb: m.size ? +(m.size / 1e9).toFixed(1) : null }));
}

// ---------- one-time setup ----------
// Downloads (or connects) the chosen AI, then checks it with a tiny test answer.
// engine: "online" | "browser" | "ollama". Returns { reply } from a tiny test question, used to confirm the installation.
export async function setup({ engine, provider, onProgress } = {}) {
  const s = loadSettings();
  if (!s.model) s.model = await suggestModel();
  const test = [{ role: "system", content: "Reply with one word." }, { role: "user", content: "Say OK." }];
  let reply = "";
  if (engine === "online") {
    s.online.provider = provider || (s.online.url ? "server" : "puter");
    onProgress?.({ progress: .4, text: "Connecting to the online AI" });
    if (s.online.provider === "server") await serverHealth(s.online.url);
    reply = await chatOnline(test, { settings: s, maxTokens: 8 });
    s.setup.online = { provider: s.online.provider, at: Date.now() };
  } else if (engine === "ollama") {
    const models = await ollamaModels(s.ollamaUrl);
    if (!models.some(m => m.name === s.ollamaModel)) throw Object.assign(new Error("That model isn't installed in Ollama yet."), { code: "ollama_model_missing" });
    onProgress?.({ progress: .5, text: "Testing Ollama" });
    reply = await chatOllama(test, { settings: s });
    s.setup.ollama = { model: s.ollamaModel, at: Date.now(), gb: models.find(m => m.name === s.ollamaModel)?.gb || null };
  } else {
    try { await navigator.storage?.persist?.(); } catch {} // ask the browser not to delete the download when space is low
    const eng = await loadBrowserEngine(s.model, onProgress);
    onProgress?.({ progress: 1, text: "Testing the AI" });
    const r = await eng.chat.completions.create({ messages: test, max_tokens: 8, temperature: 0, extra_body: { enable_thinking: false } });
    if (!r?.choices?.length) throw Object.assign(new Error("The AI loaded but didn't answer the test."), { code: "test_failed" });
    reply = r.choices[0]?.message?.content || "";
    // Also check strict JSON mode (used for answers); if it fails on this model, answers use plain mode instead
    try {
      const j = await eng.chat.completions.create({ messages: [{ role: "user", content: 'Reply with this JSON: {"ok": true}' }], max_tokens: 16, temperature: 0, response_format: { type: "json_object" }, extra_body: { enable_thinking: false } });
      JSON.parse(j?.choices?.[0]?.message?.content || "x");
    } catch (e) { console.warn("Strict JSON mode unavailable for", s.model, e); setJsonOff(s.model); try { eng.resetChat?.(); } catch {} }
    s.downloaded[s.model] = true; s.setup.browser = { model: s.model, at: Date.now() };
    touchIdle();
  }
  s.engine = engine;
  saveSettings(s);
  return { reply: String(reply).replace(/<think>[\s\S]*?<\/think>/g, "").trim().slice(0, 40) };
}
export function useEngine(kind) { const s = loadSettings(); if (!engineReady(kind, s)) return false; s.engine = kind; saveSettings(s); return true; }
export async function forgetEngine(kind) {
  const s = loadSettings();
  if (kind === "online") { if (s.online.provider === "puter") await puterSignOut(); delete s.setup.online; }
  if (kind === "ollama") delete s.setup.ollama;
  if (s.engine === kind) s.engine = ["online", "browser", "ollama"].find(k => k !== kind && engineReady(k, s)) || "";
  saveSettings(s);
}
// Delete the downloaded AI from this browser to free storage
export async function removeAI(modelId) {
  await freeMemory();
  const m = BROWSER_MODELS.find(x => x.id === modelId);
  try {
    for (const n of (await caches.keys()).filter(n => /webllm/i.test(n))) {
      const c = await caches.open(n);
      for (const r of await c.keys()) if (r.url.includes(modelId) || (m?.f32 && r.url.includes(m.f32))) await c.delete(r);
    }
  } catch {}
  const s = loadSettings(); delete s.downloaded[modelId]; if (s.setup.browser?.model === modelId) delete s.setup.browser;
  if (s.engine === "browser") s.engine = ["online", "ollama"].find(k => engineReady(k, s)) || "";
  saveSettings(s);
}

// Turn the app's input (a string, or chat turns) into chat messages
function toMessages(input, system) {
  const msgs = [{ role: "system", content: system }];
  if (typeof input === "string") msgs.push({ role: "user", content: input });
  else for (const t of input || []) msgs.push({ role: t.role, content: String(t.content) });
  return msgs;
}
const SYSTEM = "You are MedQuery, a careful medical information assistant. Be accurate and cautious, use plain language, never invent facts, studies, phone numbers or sources, never give personal doses, and always follow the requested output format exactly.";

// The sampler: same calling shape as Claude's built-in connection
// options.localOnly: use only an AI that runs on this device (for reports)
export async function getSampler(hooks = {}, options = {}) {
  const call = async (input, opts = {}, json = false) => {
    const settings = loadSettings();
    if (!settings.model) { settings.model = await suggestModel(); saveSettings(settings); }
    const kind = options.localOnly ? localEngine(settings) : settings.engine;
    const messages = toMessages(input, SYSTEM + (json ? " Reply with ONE valid JSON value and nothing else." : ""));
    const args = { json, onText: opts.onText, signal: opts.signal, maxTokens: opts.maxTokens, settings,
      onProgress: p => hooks.onProgress?.(p) };
    if (!kind || !engineReady(kind, settings)) { hooks.needSetup?.(options.localOnly ? "local" : ""); throw Object.assign(new Error("The AI isn't set up yet"), { code: "ai_not_ready" }); }
    usage.working = true; usage.startedAt = Date.now(); usage.requests++; bump();
    try {
      const out = kind === "online" ? await chatOnline(messages, args) : kind === "ollama" ? await chatOllama(messages, args) : await chatBrowser(messages, args);
      usage.lastMs = Date.now() - usage.startedAt; usage.lastChars = out.length;
      return out;
    } catch (e) { if (e?.code === "puter_signin") hooks.needSetup?.("signin"); throw e; }
    finally { usage.working = false; bump(); }
  };
  const fn = async (input, opts) => ({ text: (await call(input, opts, false)).replace(/<think>[\s\S]*?<\/think>/g, "").trim(), truncated: false });
  fn.json = async (input, opts) => {
    const out = await call(input, opts, true);
    try { return parseJSONLoose(out); }
    catch (e) { const t = String(out || "").replace(/\s+/g, " ").trim(); e.detail = (t ? "reply began: “" + t.slice(0, 90) + (t.length > 90 ? "…" : "") + "” (" + t.length + " characters)" : "the AI's reply was empty"); e.text = out; throw e; }
  };
  fn.limits = async () => ({ maxPromptBytes: 24000 }); // no direct images: photos go through on-device text recognition
  fn.engine = "local";
  fn.describe = () => describeEngine(options.localOnly ? localEngine() : loadSettings().engine);
  return fn;
}

export function describeEngine(kind, s = loadSettings()) {
  if (kind === "online") return "Online AI · " + ONLINE_MODEL_LABEL.split(" (")[0] + (s.online.provider === "puter" ? " via Puter" : "");
  if (kind === "ollama") return "Ollama · " + (s.ollamaModel || "no model chosen");
  return (BROWSER_MODELS.find(m => m.id === s.model)?.label.split(" (")[0] || "Downloaded AI") + " on this device";
}

// ---------------------------------------------------------------------------
// GROUNDING: look things up in free official sources before answering
// ---------------------------------------------------------------------------
const clip = (s, n) => { s = String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };
async function getJSON(url, ms = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(r.status); const t = await r.text(); usage.lookupBytes += t.length + url.length; bump(); return JSON.parse(t); }
  finally { clearTimeout(t); }
}
// MedlinePlus Connect returns plain-language summaries for a code (ICD-10, LOINC or RxNorm)
const CODE_SYSTEMS = { icd10: "2.16.840.1.113883.6.90", loinc: "2.16.840.1.113883.6.1", rxnorm: "2.16.840.1.113883.6.88" };
async function medlinePlus(system, code) {
  const url = `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=${CODE_SYSTEMS[system]}&mainSearchCriteria.v.c=${encodeURIComponent(code)}&knowledgeResponseType=application/json`;
  const j = await getJSON(url);
  return (j?.feed?.entry || []).slice(0, 2).map(e => ({
    source: "MedlinePlus (US National Library of Medicine)", title: e.title?._value || "MedlinePlus",
    url: e.link?.[0]?.href || "https://medlineplus.gov", year: "", text: clip(e.summary?._value, 1600)
  }));
}
async function groundDisease(term) {
  const j = await getJSON(`https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(term)}&df=primary_name&ef=icd10cm_codes&maxList=3`);
  const codes = (j?.[2]?.icd10cm_codes || []).map(c => String(c).split(",")[0]).filter(Boolean);
  const name = j?.[3]?.[0]?.[0] || term;
  for (const c of codes) { try { const r = await medlinePlus("icd10", c); if (r.length) return { name, items: r }; } catch {} }
  return { name, items: [] };
}
async function groundTest(term) {
  const j = await getJSON(`https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search?terms=${encodeURIComponent(term)}&df=LOINC_NUM,text&maxList=3`);
  const codes = (j?.[3] || []).map(r => r[0]).filter(Boolean);
  for (const c of codes) { try { const r = await medlinePlus("loinc", c); if (r.length) return { items: r }; } catch {} }
  return { items: [] };
}
async function groundDrug(term) {
  const items = [];
  try {
    const rx = await getJSON(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(term)}&search=2`);
    const id = rx?.idGroup?.rxnormId?.[0]; if (id) items.push(...await medlinePlus("rxnorm", id));
  } catch {}
  try {
    const q = encodeURIComponent(`openfda.generic_name:"${term}"+openfda.brand_name:"${term}"`);
    const j = await getJSON(`https://api.fda.gov/drug/label.json?search=${q}&limit=1`);
    const L = j?.results?.[0];
    if (L) {
      const f = k => clip((L[k] || []).join(" "), 420);
      const route = (L.openfda?.route || []).join(", ");
      items.push({ source: "openFDA drug label (US FDA)", title: (L.openfda?.brand_name?.[0] || term) + " label",
        url: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=" + encodeURIComponent(term), year: "",
        text: [route && "Route: " + route, f("indications_and_usage") && "Uses: " + f("indications_and_usage"), f("dosage_and_administration") && "How it is given: " + f("dosage_and_administration"),
          (f("warnings_and_cautions") || f("warnings")) && "Warnings: " + (f("warnings_and_cautions") || f("warnings")), f("contraindications") && "Do not use: " + f("contraindications"),
          f("adverse_reactions") && "Side effects: " + f("adverse_reactions"), f("drug_interactions") && "Interactions: " + f("drug_interactions")].filter(Boolean).join("\n") });
    }
  } catch {}
  return { items };
}
async function groundResearch(term) {
  const q = encodeURIComponent(`(TITLE_ABS:"${term}") AND OPEN_ACCESS:y AND (PUB_TYPE:"review" OR PUB_TYPE:"systematic-review" OR PUB_TYPE:"practice-guideline")`);
  const j = await getJSON(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&resultType=core&pageSize=2&sort=CITED%20desc`);
  return (j?.resultList?.result || []).filter(r => r.abstractText).map(r => ({
    source: (r.journalInfo?.journal?.title || r.journalTitle || "Open-access journal") + " (via Europe PMC)", title: clip(r.title, 160),
    url: r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : `https://europepmc.org/article/${r.source}/${r.id}`,
    year: String(r.pubYear || ""), text: clip(r.abstractText, 900)
  }));
}

// UK Biobank: the raw data needs an approved research application, so we use its published,
// open-access findings (studies that analysed UK Biobank data), found through Europe PMC.
async function groundBiobank(term) {
  const q = encodeURIComponent(`(TITLE_ABS:"${term}") AND (TITLE_ABS:"UK Biobank") AND OPEN_ACCESS:y`);
  const j = await getJSON(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&resultType=core&pageSize=1&sort=CITED%20desc`);
  return (j?.resultList?.result || []).filter(r => r.abstractText).map(r => ({
    source: "UK Biobank study · " + (r.journalInfo?.journal?.title || r.journalTitle || "open-access journal"), title: clip(r.title, 160),
    url: r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : `https://europepmc.org/article/${r.source}/${r.id}`,
    year: String(r.pubYear || ""), text: clip(r.abstractText, 700)
  }));
}
// 1000 Genomes Project: population allele frequencies for a genetic variant (rsID), via Ensembl's open API
const POPS = { ALL: "all", AFR: "African", AMR: "admixed American", EAS: "East Asian", EUR: "European", SAS: "South Asian" };
async function groundGenomes(text) {
  const ids = [...new Set((String(text).match(/\brs\d{2,12}\b/gi) || []).map(x => x.toLowerCase()))].slice(0, 2);
  const out = [];
  for (const id of ids) {
    const j = await getJSON(`https://rest.ensembl.org/variation/human/${id}?pops=1;content-type=application/json`).catch(() => null);
    if (!j || j.error) continue;
    const freqs = (j.populations || []).filter(p => /^1000GENOMES:phase_3:(ALL|AFR|AMR|EAS|EUR|SAS)$/.test(p.population));
    const byPop = {};
    for (const p of freqs) { const k = p.population.split(":").pop(); if (j.minor_allele ? p.allele === j.minor_allele : !byPop[k]) byPop[k] = `${p.allele} ${(p.frequency * 100).toFixed(1)}%`; }
    const lines = Object.entries(POPS).filter(([k]) => byPop[k]).map(([k, v]) => `${v}: ${byPop[k]}`);
    const clin = (j.clinical_significance || []).join(", ");
    out.push({ source: "1000 Genomes Project (via Ensembl)", title: `Variant ${j.name}`, url: `https://www.ensembl.org/Homo_sapiens/Variation/Population?v=${j.name}`, year: "",
      text: clip(`Variant ${j.name}: ${(j.mappings?.[0]?.allele_string) || ""} ${j.most_severe_consequence ? "(" + j.most_severe_consequence.replace(/_/g, " ") + ")" : ""}. ` +
        (j.minor_allele ? `Minor allele ${j.minor_allele}, global frequency ${j.MAF != null ? (j.MAF * 100).toFixed(1) + "%" : "unknown"}. ` : "") +
        (lines.length ? `1000 Genomes phase 3 allele frequency by population: ${lines.join("; ")}. ` : "") + (clin ? `Clinical significance (ClinVar): ${clin}.` : ""), 700) });
  }
  return out;
}
// HealthData.gov: the US government's open health-data catalogue. Dataset descriptions are pointers,
// not answers, so they are shown as links and not given to the AI as facts.
async function findDatasets(term) {
  const j = await getJSON(`https://api.us.socrata.com/api/catalog/v1?domains=healthdata.gov&q=${encodeURIComponent(term)}&only=dataset&limit=3`, 7000);
  return (j?.results || []).map(r => ({ source: "HealthData.gov dataset", title: clip(r.resource?.name || "Dataset", 140), url: r.permalink || r.link || `https://healthdata.gov/d/${r.resource?.id}`, year: String(r.resource?.data_updated_at || r.resource?.updatedAt || "").slice(0, 4) })).filter(d => d.url);
}

// MeSH (Medical Subject Headings, US National Library of Medicine): the standard medical vocabulary,
// with an expert-written definition ("scope note") for each term. Via NCBI E-utilities.
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils", EU_TAG = "&tool=MedQuery&retmode=json";
export async function meshDefine(term) {
  const k = "mesh:" + term.toLowerCase(), hit = cacheGet(k); if (hit) return hit;
  const ids = (await getJSON(`${EUTILS}/esearch.fcgi?db=mesh&retmax=1&term=${encodeURIComponent(term)}${EU_TAG}`, 6000))?.esearchresult?.idlist || [];
  if (!ids.length) return null;
  const doc = (await getJSON(`${EUTILS}/esummary.fcgi?db=mesh&id=${ids[0]}${EU_TAG}`, 6000))?.result?.[ids[0]];
  if (!doc?.ds_scopenote) return null;
  const r = { term: (doc.ds_meshterms || [])[0] || term, definition: clip(doc.ds_scopenote, 500), url: `https://www.ncbi.nlm.nih.gov/mesh/${ids[0]}` };
  cacheSet(k, r); return r;
}
async function groundMesh(term) {
  const r = await meshDefine(term); if (!r) return [];
  return [{ source: "MeSH (US National Library of Medicine)", title: r.term, url: r.url, year: "", text: "Definition: " + r.definition }];
}
// Mondo Disease Ontology (merges Orphanet, OMIM, NCIt and others; strong on rare diseases), via EMBL-EBI's Ontology Lookup Service
async function groundMondo(term) {
  const j = await getJSON(`https://www.ebi.ac.uk/ols4/api/search?q=${encodeURIComponent(term)}&ontology=mondo&rows=1&fieldList=label,description,obo_id`, 7000);
  const d = j?.response?.docs?.[0]; const desc = [].concat(d?.description || [])[0];
  if (!d || !desc) return [];
  return [{ source: "Mondo Disease Ontology (incl. Orphanet rare diseases)", title: d.label, url: `https://monarchinitiative.org/${d.obo_id}`, year: "", text: clip(desc, 600) }];
}
// Cochrane systematic reviews: among the most trusted summaries of treatment evidence (abstracts are free)
async function groundCochrane(term) {
  const q = encodeURIComponent(`(TITLE_ABS:"${term}") AND JOURNAL:"Cochrane Database Syst Rev"`);
  const j = await getJSON(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&resultType=core&pageSize=1&sort=P_PDATE_D%20desc`);
  return (j?.resultList?.result || []).filter(r => r.abstractText).map(r => ({
    source: "Cochrane systematic review", title: clip(r.title, 160), url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`,
    year: String(r.pubYear || ""), text: clip(r.abstractText, 800) }));
}
// ChEMBL (EMBL-EBI): how far a medicine has got in development. Phase 4 = approved; 1-3 = still in clinical trials.
export async function drugStatus(term) {
  const j = await getJSON(`https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=${encodeURIComponent(term)}&limit=1`, 7000);
  const m = j?.molecules?.[0]; if (!m) return null;
  const phase = m.max_phase == null ? null : parseFloat(m.max_phase);
  const status = m.withdrawn_flag ? "withdrawn" : phase >= 4 ? "approved" : phase > 0 ? "experimental" : "research";
  return { name: m.pref_name || term, phase, status, firstApproval: m.first_approval || null, url: `https://www.ebi.ac.uk/chembl/explore/compound/${m.molecule_chembl_id}`, source: "ChEMBL (EMBL-EBI)" };
}
// ClinicalTrials.gov: active trials of treatments that are still EXPERIMENTAL. Shown as-is (tagged), not rewritten by the AI.
const PHASE = { EARLY_PHASE1: "Early phase 1", PHASE1: "Phase 1", PHASE2: "Phase 2", PHASE3: "Phase 3", PHASE4: "Phase 4", NA: "" };
const STATUS = { RECRUITING: "Recruiting", ACTIVE_NOT_RECRUITING: "Active, not recruiting", NOT_YET_RECRUITING: "Not yet recruiting", ENROLLING_BY_INVITATION: "By invitation" };
export async function findTrials(term, kind) {
  const by = kind === "drug" ? "query.intr" : "query.cond";
  const base = `https://clinicaltrials.gov/api/v2/studies?${by}=${encodeURIComponent(term)}&filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING&filter.advanced=${encodeURIComponent("AREA[StudyType]INTERVENTIONAL AND (AREA[Phase]PHASE1 OR AREA[Phase]PHASE2 OR AREA[Phase]PHASE3 OR AREA[Phase]EARLY_PHASE1)")}&pageSize=4&sort=LastUpdatePostDate:desc`;
  const j = await getJSON(base + "&fields=NCTId,BriefTitle,Phase,OverallStatus,InterventionName,InterventionType", 9000).catch(() => null) || await getJSON(base, 9000);
  return (j?.studies || []).map(st => {
    const ps = st.protocolSection || {};
    const nct = ps.identificationModule?.nctId;
    return nct && {
      nct, title: clip(ps.identificationModule?.briefTitle, 180), url: `https://clinicaltrials.gov/study/${nct}`,
      phase: (ps.designModule?.phases || []).map(x => PHASE[x] ?? x).filter(Boolean).join("/"),
      status: STATUS[ps.statusModule?.overallStatus] || (ps.statusModule?.overallStatus || "").replace(/_/g, " ").toLowerCase(),
      interventions: (ps.armsInterventionsModule?.interventions || []).filter(i => !/PLACEBO/i.test(i.type) && !/placebo/i.test(i.name)).map(i => i.name).slice(0, 3)
    };
  }).filter(Boolean);
}

// Gather sources for a query. Returns { sources:[{source,title,url,year,text}], datasets, trials, drug, context } (context fits a small model)
export async function ground(term, kind, fullQuery = "", budget = 5400) {
  const tasks = [groundGenomes(term + " " + fullQuery), groundMesh(term)];
  if (kind === "drug") tasks.push(groundDrug(term).then(r => r.items));
  else if (kind === "test") tasks.push(groundTest(term).then(r => r.items));
  else tasks.push(groundDisease(term).then(r => r.items));
  if (kind !== "test") tasks.push(groundCochrane(term));
  tasks.push(groundResearch(term));
  if (kind === "disease") tasks.push(groundMondo(term));
  if (kind !== "test") tasks.push(groundBiobank(term));
  const ds = findDatasets(term).catch(() => []);
  const trials = kind === "test" ? Promise.resolve([]) : findTrials(term, kind).catch(() => []);
  const drug = kind === "drug" ? drugStatus(term).catch(() => null) : Promise.resolve(null);
  const results = await Promise.allSettled(tasks);
  const sources = results.flatMap(r => r.status === "fulfilled" ? r.value : []).filter(s => s.text).slice(0, 6);
  const dr = await drug;
  if (dr) sources.push({ source: dr.source, title: dr.name, url: dr.url, year: "", text: `Development stage: ${dr.status === "approved" ? "approved (phase 4)" + (dr.firstApproval ? ", first approved " + dr.firstApproval : "") : dr.status === "withdrawn" ? "withdrawn from the market" : dr.status === "experimental" ? "EXPERIMENTAL: highest stage reached is clinical trial phase " + dr.phase + "; not approved" : "research compound, not approved"}.` });
  const keep = sources.slice(0, Math.max(2, Math.floor(budget / 450))); // fewer sources for small AIs
  const context = keep.map((s, i) => {
    const t = s.text.slice(0, Math.max(220, Math.floor(budget / keep.length)));
    return `[S${i + 1}] ${s.source} — ${s.title}${s.year ? " (" + s.year + ")" : ""}\n${t}`;
  }).join("\n\n");
  return { sources, datasets: await ds, trials: await trials, drug: dr, context };
}

// Compact prompts for small models (≈4k-token window): one kind at a time, fewer fields
const KIND_SCHEMA = {
  disease: `"definition":"1-2 plain sentences","symptoms":{"common":["..."],"uncommon":["..."]},"causes":["..."],"tests":[{"name":"","why":""}],"homeRemedies":{"applicable":true or false (true only for simple self-limiting illnesses),"note":"","items":[{"name":"","how":"","allergens":["common allergens in it, or empty"]}]},"prevention":["..."],"treatments":[{"option":"","route":"how a medicine is given, e.g. Oral tablet; '' if not a medicine","experimental":false,"note":""}]`,
  test: `"purpose":"","specimen":"","preparation":"","components":[{"name":"","normal":"typical adult range","unit":"","depends":true or false}],"factors":["age","sex","pregnancy","fasting" (only those that change the ranges)],"highLow":[{"finding":"","meaning":""}]`,
  drug: `"drug":{"class":"","howItWorks":"","administration":{"routes":["e.g. Oral tablet"],"how":"how and when it is taken, no personal doses"},"uses":["..."],"commonSideEffects":["..."],"seriousSideEffects":["..."],"cautions":["..."],"interactions":["..."]}`,
  question: `"answer":"direct plain answer","points":["..."]`
};
export function answerPrompt({ q, kind, context, detail, langNote, followUp, compact }) {
  if (compact) return `SOURCES:
${(context || "(none)").slice(0, 1500)}

Answer the medical question "${q.slice(0, 200)}" in plain language, using only the SOURCES. Keep it short.
Reply with ONLY this JSON and nothing else (start with {):
{"title":"","summary":"2 short sentences","points":["4 short key facts"],"confidence":"low"}`;
  const size = detail ? "DETAILED: lists up to 6 items, 1 sentence each; add 2-3 'details' sections." : "QUICK: very short and simple, lists of 3-4 short phrases, 'details': [].";
  return `SOURCES (free official and open-access references):
${context || "(No sources could be retrieved.)"}

TASK: Answer the medical query "${q.slice(0, 300)}"${followUp ? ` as a follow-up to "${followUp}"` : ""}. It is a ${kind}.
RULES: Use ONLY facts stated in the SOURCES. If the sources do not cover a field, leave it empty ("" or []) rather than guessing. Plain language for non-medical readers. Never give personal doses. Name any medicine with how it is given. Anything not approved for routine use (only in clinical trials, early research) is EXPERIMENTAL: set "experimental":true or start the item with "Experimental: ". If the sources are missing or thin, set "confidence":"low" and explain in "uncertainty". ${size}${langNote || ""}
Reply with ONLY one JSON object (start with {, no other text):
{"kind":"${kind}","title":"","aka":[],"summary":"1-2 sentences","urgent":"warning signs needing urgent care, or ''",${KIND_SCHEMA[kind] || KIND_SCHEMA.question},"details":[],"confidence":"high|moderate|low","uncertainty":"","needsResearch":false,"related":["3-5 related searches"]}`;
}
export function reportPrompt(text, langNote) {
  return `LAB REPORT TEXT (recognised from an uploaded report; may contain personal details and recognition errors):
"""${String(text).slice(0, 7000)}"""

TASK: Extract ONLY the laboratory test results and explain each in plain language.
PRIVACY: never output names, ages, IDs, phone numbers, addresses, dates, doctor or lab names.
Use the reference range printed in the text; if none, use a widely accepted adult range and set "rangeSource":"standard". If the text is not a lab report or values are unreadable, return {"readable":false,"reason":"..."}.
Status: normal, borderline_low/high (within ~10% outside the range), low/high, critical_low/high (far outside or dangerous), unknown.
Keep "meaning" and "inference" under 20 words each. Possible diagnoses are possibilities, not diagnoses.${langNote || ""}
Reply with ONE JSON object:
{"readable":true,"reportType":"","summary":"2 plain sentences","urgent":"","results":[{"test":"","value":"","unit":"","range":"","rangeSource":"report|standard","status":"","meaning":"","inference":"","readCertain":true}],"patterns":[],"possibleDiagnoses":[{"name":"","likelihood":"likely|possible|less likely","why":"","confirm":""}],"nextSteps":[],"caveat":"","confidence":"high|moderate|low"}`;
}

// ---------------------------------------------------------------------------
// On-device text recognition (OCR) for report photos and scanned PDFs
// ---------------------------------------------------------------------------
let ocrWorker = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("could not load " + src)); document.head.append(s); }); }
export async function ocr(blobs, onProgress) {
  if (!window.Tesseract) await loadScript(TESSERACT_URL);
  ocrWorker ||= await window.Tesseract.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") onProgress?.(m.progress || 0); } });
  let text = "";
  for (const b of [].concat(blobs)) { const { data } = await ocrWorker.recognize(b); text += (data?.text || "") + "\n"; }
  return text.trim();
}

// ---------------------------------------------------------------------------
// Care near you from OpenStreetMap (no AI needed)
// Speed tricks:
//  - If we already have coordinates (pasted map link, GPS, pin on the map), skip address lookup.
//  - Address lookup uses Photon (fast, made for type-ahead), falling back to Nominatim.
//  - Hospital data: ask several Overpass servers at once and use the first answer ("race").
//  - Search a small area first; widen only if too few places are found.
//  - Remember results for a day, keyed by rounded coordinates.
// ---------------------------------------------------------------------------
const PHOTON = "https://photon.komoot.io";
const OVERPASS_SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const CACHE_KEY = "medquery.osmCache", DAY = 864e5;
const cacheRead = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } };
function cacheGet(k) { const c = cacheRead()[k]; return c && Date.now() - c.t < DAY ? c.v : null; }
function cacheSet(k, v) { try { const c = cacheRead(); c[k] = { t: Date.now(), v }; const keys = Object.keys(c).sort((a, b) => c[b].t - c[a].t); for (const old of keys.slice(40)) delete c[old]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} }

let lastNominatim = 0;
async function nominatim(path) {
  const wait = Math.max(0, lastNominatim + 1100 - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait));
  lastNominatim = Date.now();
  return getJSON("https://nominatim.openstreetmap.org" + path + "&accept-language=" + encodeURIComponent(navigator.language || "en"), 12000);
}
const photonLabel = p => { const q = p.properties || {}; return [q.name, q.street && (q.housenumber ? q.housenumber + " " + q.street : q.street), q.district || q.locality, q.city || q.county, q.state, q.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "); };
// Address suggestions while typing (optionally biased toward a known position)
export async function suggest(q, near) {
  if (!q || q.trim().length < 3) return [];
  const bias = near ? `&lat=${near.lat}&lon=${near.lon}` : "";
  const j = await getJSON(`${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=5${bias}`, 5000);
  return (j?.features || []).map(f => ({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: photonLabel(f), country: f.properties?.country || "", countryCode: (f.properties?.countrycode || "").toLowerCase() }));
}
export async function geocode(q) {
  const c = cacheGet("g:" + q.toLowerCase()); if (c) return c;
  let r = null;
  try { r = (await suggest(q))[0] || null; } catch {}
  if (!r) { try { const g = await nominatim("/search?format=jsonv2&addressdetails=1&limit=1&q=" + encodeURIComponent(q)); if (g?.length) r = { lat: +g[0].lat, lon: +g[0].lon, label: g[0].display_name, country: g[0].address?.country || "", countryCode: g[0].address?.country_code || "" }; } catch {} }
  if (r) cacheSet("g:" + q.toLowerCase(), r);
  return r;
}
export async function reverse(lat, lon) {
  const k = `r:${lat.toFixed(4)},${lon.toFixed(4)}`; const c = cacheGet(k); if (c) return c;
  let r = null;
  try { const j = await getJSON(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&limit=1`, 5000); const f = j?.features?.[0]; if (f) r = { label: photonLabel(f), country: f.properties?.country || "", countryCode: (f.properties?.countrycode || "").toLowerCase() }; } catch {}
  if (!r) { try { const a = await nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=17&lat=${lat}&lon=${lon}`); if (a && !a.error) r = { label: a.display_name, country: a.address?.country || "", countryCode: a.address?.country_code || "" }; } catch {} }
  if (r) cacheSet(k, r);
  return r;
}
async function overpassRace(query, ms = 14000) {
  const ctls = OVERPASS_SERVERS.map(() => new AbortController());
  const timer = setTimeout(() => ctls.forEach(c => c.abort()), ms);
  try {
    return await Promise.any(OVERPASS_SERVERS.map(async (url, i) => {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctls[i].signal });
      if (!r.ok) throw new Error("overpass " + r.status);
      const j = await r.json();
      ctls.forEach((c, k) => { if (k !== i) c.abort(); }); // first answer wins; stop the others
      return j;
    }));
  } finally { clearTimeout(timer); }
}
const R = 6371, rad = d => d * Math.PI / 180;
const kmBetween = (a, b) => { const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
function parseElements(els, origin, specialtyWords) {
  const seen = new Set(), places = [];
  for (const e of els || []) {
    const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, name = t["name:en"] || t.name;
    if (lat == null || !name) continue;
    const key = name.toLowerCase() + Math.round(lat * 1000); if (seen.has(key)) continue; seen.add(key);
    const addr = t["addr:full"] || [t["addr:housenumber"] && t["addr:street"] ? t["addr:housenumber"] + " " + t["addr:street"] : t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ");
    const op = ((t["operator:type"] || "") + " " + (t.operator || "")).toLowerCase();
    const specs = (t["healthcare:speciality"] || "").toLowerCase();
    places.push({
      name, address: addr, lat, lon, exact: true, km: kmBetween(origin, { lat, lon }),
      phone: (t["contact:phone"] || t.phone || "").split(/[;,]/)[0].trim(), phoneLabel: t.emergency === "yes" ? "emergency" : "main line",
      er: t.emergency === "yes", gov: /public|government|govt|municipal|district|state|national/.test(op), priv: /private|commercial/.test(op),
      beds: parseInt(t.beds, 10) || 0, match: specialtyWords.some(w => specs.includes(w) || name.toLowerCase().includes(w)),
      department: specs.split(";")[0] || "", dest: [name, addr].filter(Boolean).join(", "), isHospital: (t.amenity || t.healthcare) === "hospital"
    });
  }
  return places.sort((a, b) => a.km - b.km);
}
// where: a text address OR { lat, lon, label?, country? }
export async function findPlaces(where, specialtyWords = []) {
  let loc = typeof where === "object" && where && isFinite(where.lat) ? { ...where } : await geocode(String(where || ""));
  if (!loc) return { origin: null, places: [], country: "" };
  const origin = { lat: +loc.lat, lon: +loc.lon };
  if (!loc.country) { const rv = await reverse(origin.lat, origin.lon).catch(() => null); if (rv) Object.assign(loc, { country: rv.country, countryCode: rv.countryCode, label: loc.label || rv.label }); }
  const key = `p:${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}`;
  let els = cacheGet(key);
  if (!els) {
    const q = r => `[out:json][timeout:12];(nwr["amenity"~"^(hospital|clinic)$"](around:${r},${origin.lat},${origin.lon});nwr["healthcare"~"^(hospital|clinic)$"](around:${r},${origin.lat},${origin.lon}););out center tags qt 80;`;
    let data = await overpassRace(q(6000)).catch(() => null);
    if (!data || (data.elements || []).length < 3) data = await overpassRace(q(20000)).catch(() => data); // widen only when needed
    if (!data) throw Object.assign(new Error("hospital data servers unreachable"), { code: "osm_unreachable" });
    els = (data.elements || []).map(e => ({ type: e.type, id: e.id, lat: e.lat, lon: e.lon, center: e.center, tags: e.tags }));
    cacheSet(key, els);
  }
  const places = parseElements(els, origin, specialtyWords);
  return { origin, places: places.slice(0, 12), country: loc.country || "", countryCode: loc.countryCode || "", label: loc.label || "" };
}

// Leaflet (open-source map library), loaded only when the map is opened
let leafletReady = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletReady ||= new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.append(css);
    const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = () => res(window.L); s.onerror = () => { leafletReady = null; rej(new Error("map library failed to load")); }; document.head.append(s);
  });
  return leafletReady;
}
