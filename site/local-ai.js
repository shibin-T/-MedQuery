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

import { parseJSONLoose, ground, answerPrompt, reportPrompt, geocode, placesAround } from "./medquery-core.js";
export { parseJSONLoose, ground, answerPrompt, reportPrompt, findArticles, findBestCare, specialtyFor } from "./medquery-core.js";

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.87";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
const SETTINGS_KEY = "medquery.localAI";

// Browser models we offer. Sizes are the one-time download / memory need.
export const BROWSER_MODELS = [
  { id: "Qwen3.5-4B-q4f16_1-MLC", f32: "Qwen3.5-4B-q4f32_1-MLC", label: "Qwen 3.5 · 4B (recommended for laptops)", gb: 3.9, quality: "Good" },
  { id: "Qwen3.5-2B-q4f16_1-MLC", f32: "Qwen3.5-2B-q4f32_1-MLC", label: "Qwen 3.5 · 2B (phones and older laptops)", gb: 2.3, quality: "Fair" },
  { id: "Qwen3.5-9B-q4f16_1-MLC", f32: null, label: "Qwen 3.5 · 9B (powerful computers only)", gb: 6.5, quality: "Best" },
  { id: "Qwen3.5-0.8B-q4f16_1-MLC", f32: "Qwen3.5-0.8B-q4f32_1-MLC", label: "Qwen 3.5 · 0.8B (very low memory; least reliable)", gb: 1.6, quality: "Basic" }
];

// ---------- settings (kept on this device only) ----------
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch {}
  return { engine: s.engine || "browser", model: s.model || "", ollamaUrl: s.ollamaUrl || "http://localhost:11434", ollamaModel: s.ollamaModel || "", downloaded: s.downloaded || {} };
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

// Pick a sensible default model from what the device reports
export async function suggestModel() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 4; // GB, Chrome only (capped at 8)
  if (mobile || mem < 8) return BROWSER_MODELS[1].id;
  return BROWSER_MODELS[0].id;
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

// ---------- engines ----------
let webllm = null, engine = null, engineModel = null, loading = null;

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
      initProgressCallback: p => onProgress?.({ progress: p.progress ?? 0, text: p.text || "" })
    });
    engineModel = modelId;
    return engine;
  })().finally(() => { loading = null; });
  return loading;
}

async function chatBrowser(messages, { json, onText, signal, maxTokens, onProgress, settings }) {
  const eng = await loadBrowserEngine(settings.model, onProgress);
  const req = { messages, temperature: 0.2, max_tokens: maxTokens || 1400, stream: true, extra_body: { enable_thinking: false } };
  if (json) req.response_format = { type: "json_object" };
  let out = "";
  let stream;
  try { stream = await eng.chat.completions.create(req); }
  catch (e) { if (json) { delete req.response_format; stream = await eng.chat.completions.create(req); } else throw e; }
  for await (const chunk of stream) {
    if (signal?.aborted) { try { eng.interruptGenerate(); } catch {} throw Object.assign(new Error("cancelled"), { code: "cancelled" }); }
    const d = chunk.choices?.[0]?.delta?.content || "";
    if (d) { out += d; onText?.({ text: out, delta: d }); }
  }
  return out;
}

async function chatOllama(messages, { json, onText, signal, settings }) {
  const base = settings.ollamaUrl.replace(/\/+$/, "");
  let r;
  try {
    r = await fetch(base + "/api/chat", { method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.ollamaModel, messages, stream: true, format: json ? "json" : undefined, think: false, options: { temperature: 0.2, num_ctx: 8192 } }) });
  } catch (e) {
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    throw Object.assign(new Error("Can't reach Ollama at " + base + ". Is it running, and allowed for this site?"), { code: "ollama_unreachable" });
  }
  if (!r.ok) throw Object.assign(new Error("Ollama error " + r.status + ": " + (await r.text()).slice(0, 200)), { code: "ollama_error" });
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      try { const j = JSON.parse(line); const d = j.message?.content || ""; if (d) { out += d; onText?.({ text: out, delta: d }); } } catch {}
    }
  }
  return out;
}

export async function ollamaModels(url) {
  const r = await fetch(url.replace(/\/+$/, "") + "/api/tags");
  if (!r.ok) throw new Error("Ollama answered " + r.status);
  const j = await r.json();
  return (j.models || []).map(m => ({ name: m.name, gb: m.size ? +(m.size / 1e9).toFixed(1) : null }));
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
export async function getSampler(hooks = {}) {
  const call = async (input, opts = {}, json = false) => {
    const settings = loadSettings();
    if (!settings.model) { settings.model = await suggestModel(); saveSettings(settings); }
    const messages = toMessages(input, SYSTEM + (json ? " Reply with ONE valid JSON value and nothing else." : ""));
    const args = { json, onText: opts.onText, signal: opts.signal, maxTokens: opts.maxTokens, settings,
      onProgress: p => hooks.onProgress?.(p) };
    if (settings.engine === "browser" && !settings.downloaded[settings.model]) {
      const ok = await hooks.confirmDownload?.(settings);
      if (!ok) throw Object.assign(new Error("download declined"), { code: "not_granted" });
    }
    const text = settings.engine === "ollama" ? await chatOllama(messages, args) : await chatBrowser(messages, args);
    if (settings.engine === "browser" && !settings.downloaded[settings.model]) { settings.downloaded[settings.model] = true; saveSettings(settings); }
    return text;
  };
  const fn = async (input, opts) => ({ text: (await call(input, opts, false)).replace(/<think>[\s\S]*?<\/think>/g, "").trim(), truncated: false });
  fn.json = async (input, opts) => parseJSONLoose(await call(input, opts, true));
  fn.limits = async () => ({ maxPromptBytes: 24000 }); // no direct images: photos go through on-device text recognition
  fn.engine = "local";
  fn.describe = () => { const s = loadSettings(); return s.engine === "ollama" ? "Ollama · " + (s.ollamaModel || "no model chosen") : (BROWSER_MODELS.find(m => m.id === s.model)?.label.split(" (")[0] || "Browser model"); };
  return fn;
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
// Care near you from OpenStreetMap (no AI needed): nearest hospitals and clinics
// (the condition-specific "Best Care" ranking lives in medquery-core.js)
// ---------------------------------------------------------------------------
export async function findPlaces(locText, specialtyWords = []) {
  const o = await geocode(locText, { lang: navigator.language || "en" });
  if (!o) return { origin: null, places: [], countryCode: "", country: "" };
  const places = (await placesAround(o, { radiusM: 8000 })).map(p => ({
    ...p, phoneLabel: p.er ? "emergency" : "main line", department: p.specialities[0] || "",
    match: specialtyWords.some(w => p.specialities.join(" ").includes(w) || p.name.toLowerCase().includes(w))
  }));
  places.sort((a, b) => a.km - b.km);
  return { origin: { lat: o.lat, lon: o.lon }, places: places.slice(0, 12), countryCode: o.countryCode, country: o.country, label: o.label };
}
