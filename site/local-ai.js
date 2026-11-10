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

// ---------- robust JSON from a small model ----------
export function parseJSONLoose(text) {
  let t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  const a2 = t.indexOf("["), b2 = t.lastIndexOf("]");
  const pick = (a >= 0 && (a2 < 0 || a < a2)) ? t.slice(a, b + 1) : a2 >= 0 ? t.slice(a2, b2 + 1) : "";
  if (!pick) throw Object.assign(new Error("no JSON in reply"), { code: "invalid_json", text: t });
  const repaired = pick.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
  try { return JSON.parse(repaired); } catch { throw Object.assign(new Error("bad JSON"), { code: "invalid_json", text: t }); }
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
// GROUNDING: look things up in free official sources before answering
// ---------------------------------------------------------------------------
const clip = (s, n) => { s = String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };
async function getJSON(url, ms = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(r.status); return await r.json(); }
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

// Gather sources for a query. Returns { sources:[{source,title,url,year,text}], context } (context fits a small model)
export async function ground(term, kind) {
  const tasks = [];
  if (kind === "drug") tasks.push(groundDrug(term).then(r => r.items));
  else if (kind === "test") tasks.push(groundTest(term).then(r => r.items));
  else tasks.push(groundDisease(term).then(r => r.items));
  tasks.push(groundResearch(term));
  const results = await Promise.allSettled(tasks);
  const sources = results.flatMap(r => r.status === "fulfilled" ? r.value : []).filter(s => s.text).slice(0, 4);
  let budget = 5200;
  const context = sources.map((s, i) => {
    const t = s.text.slice(0, Math.max(300, Math.floor(budget / sources.length)));
    return `[S${i + 1}] ${s.source} — ${s.title}${s.year ? " (" + s.year + ")" : ""}\n${t}`;
  }).join("\n\n");
  return { sources, context };
}

// Compact prompts for small models (≈4k-token window): one kind at a time, fewer fields
const KIND_SCHEMA = {
  disease: `"definition":"1-2 plain sentences","symptoms":{"common":["..."],"uncommon":["..."]},"causes":["..."],"tests":[{"name":"","why":""}],"homeRemedies":{"applicable":true or false (true only for simple self-limiting illnesses),"note":"","items":[{"name":"","how":"","allergens":["common allergens in it, or empty"]}]},"prevention":["..."],"treatments":[{"option":"","route":"how a medicine is given, e.g. Oral tablet; '' if not a medicine","note":""}]`,
  test: `"purpose":"","specimen":"","preparation":"","components":[{"name":"","normal":"typical adult range","unit":"","depends":true or false}],"factors":["age","sex","pregnancy","fasting" (only those that change the ranges)],"highLow":[{"finding":"","meaning":""}]`,
  drug: `"drug":{"class":"","howItWorks":"","administration":{"routes":["e.g. Oral tablet"],"how":"how and when it is taken, no personal doses"},"uses":["..."],"commonSideEffects":["..."],"seriousSideEffects":["..."],"cautions":["..."],"interactions":["..."]}`,
  question: `"answer":"direct plain answer","points":["..."]`
};
export function answerPrompt({ q, kind, context, detail, langNote, followUp }) {
  const size = detail ? "DETAILED: lists up to 6 items, 1 sentence each; add 2-3 'details' sections." : "QUICK: very short and simple, lists of 3-4 short phrases, 'details': [].";
  return `SOURCES (free official and open-access references):
${context || "(No sources could be retrieved.)"}

TASK: Answer the medical query "${q.slice(0, 300)}"${followUp ? ` as a follow-up to "${followUp}"` : ""}. It is a ${kind}.
RULES: Use ONLY facts stated in the SOURCES. If the sources do not cover a field, leave it empty ("" or []) rather than guessing. Plain language for non-medical readers. Never give personal doses. Name any medicine with how it is given. If the sources are missing or thin, set "confidence":"low" and explain in "uncertainty". ${size}${langNote || ""}
Reply with ONE JSON object:
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
