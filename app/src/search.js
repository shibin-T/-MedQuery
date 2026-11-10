// The search pipeline, same as the website:
//   1. work out the term and kind (built-in index first)
//   2. fetch real articles from trusted open sources (MedlinePlus, StatPearls,
//      Cochrane, open-access guidelines and reviews, FDA labels)
//   3. ask the AI to answer from them
//   4. "Verify at the source" shows those articles with direct links
import { ground, findArticles, articlesFromAI, answerPromptFull, answerPrompt, cleanTerm, str } from "./core";
import { askJSON } from "./ai";
import { INDEX, ALIASES } from "./termIndex";
import { langNote } from "./lang";

const KINDS = ["disease", "test", "drug", "question"];
const looksLikeQuestion = q => /\?|^(what|how|why|when|is|are|can|does|do|should|which|who)\b/i.test(q.trim());

export function indexHit(q) {
  const t = str(q).toLowerCase();
  const byTerm = name => INDEX.find(x => x.term === name);
  return byTerm(ALIASES[t]) || INDEX.find(x => x.term.toLowerCase() === t) || INDEX.find(x => x.term.toLowerCase().split(" (")[0] === t) || null;
}
export function suggestions(q, limit = 8) {
  const t = str(q).toLowerCase(); if (t.length < 1) return [];
  const starts = [], has = [];
  for (const x of INDEX) { const n = x.term.toLowerCase(); if (n.startsWith(t)) starts.push(x); else if (n.includes(t) || (x.note || "").toLowerCase().includes(t)) has.push(x); }
  const ali = Object.entries(ALIASES).filter(([k]) => k.startsWith(t)).map(([, v]) => INDEX.find(x => x.term === v)).filter(Boolean);
  return [...new Map([...ali, ...starts, ...has].map(x => [x.term, x])).values()].slice(0, limit);
}

const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

/**
 * @returns {Promise<{answer: object, articles: Array}>}
 */
export async function runSearch({ q, mode = "auto", detail = false, followUp = null, settings, signal, onStatus = () => {} }) {
  const hit = mode === "auto" && !looksLikeQuestion(q) ? indexHit(q) : null;
  let kind = mode !== "auto" ? mode : hit?.kind || null;
  let term = hit ? hit.term.split(" (")[0] : cleanTerm(followUp ? followUp.title : q);
  const ln = langNote(settings.lang);

  if (settings.engine === "ollama") {
    // Small open models: classify, then answer ONLY from the retrieved sources
    if (!kind) {
      onStatus("Understanding your search…");
      try {
        const r = await askJSON(settings, `Classify this medical search and extract its main medical term (in English). Search: "${q.slice(0, 200)}". Reply as JSON: {"kind":"disease|test|drug|question","term":"main medical term"}`, { signal, effort: "low", maxTokens: 200 });
        kind = KINDS.includes(r?.kind) ? r.kind : "question"; term = str(r?.term) || term;
      } catch (e) { if (e.code === "cancelled") throw e; kind = looksLikeQuestion(q) ? "question" : "disease"; }
    }
    onStatus("Looking up trusted sources…");
    const g = await ground(followUp ? followUp.title : term, kind, { signal }).catch(() => ({ sources: [], context: "" }));
    onStatus("Writing the answer…");
    const d = await askJSON(settings, answerPrompt({ q, kind, context: g.context, detail, langNote: ln, followUp: followUp?.title || "" }), { signal });
    if (!d || typeof d !== "object") throw Object.assign(new Error("invalid"), { code: "invalid_json" });
    d.kind = KINDS.includes(d.kind) ? d.kind : kind; d.title = str(d.title) || term;
    d.evidence = g.sources.map(x => ({ source: x.source, title: x.title, year: x.year, url: x.url }));
    if (!g.sources.length) { d.confidence = "low"; d.uncertainty = str(d.uncertainty) || "No trusted source could be reached, so this answer comes only from a small AI model and may be wrong."; d.needsResearch = true; }
    return { answer: d, articles: g.sources };
  }

  // Claude: fetch articles first (max ~8 s), then a full answer grounded in them
  onStatus("Finding trusted articles…");
  const g = (await withTimeout(ground(term, kind || "disease", { signal }).catch(() => null), 8000)) || { sources: [], context: "" };
  const srcList = g.sources.map((a, i) => `[S${i + 1}] ${a.publisher} · ${a.type} · "${a.title}"${a.year ? " (" + a.year + ")" : ""} · ${a.url}`).join("\n");
  onStatus(detail ? "Writing the detailed version…" : "Writing a short answer…");
  const d = await askJSON(settings, answerPromptFull({ q, mode: kind || "auto", sources: srcList, context: g.context ? "SOURCE EXCERPTS:\n" + g.context : "", detail, langNote: ln, followUp }), { signal, maxTokens: detail ? 16000 : 8000, effort: detail ? "medium" : "low" });
  if (!d || typeof d !== "object" || !str(d.summary)) throw Object.assign(new Error("invalid"), { code: "invalid_json" });
  d.kind = KINDS.includes(d.kind) ? d.kind : "question";
  d.title = str(d.title) || term;

  // If the answer turned out to be about a different term, fetch articles for that term
  let articles = g.sources;
  const same = a => a.toLowerCase().includes(term.toLowerCase()) || term.toLowerCase().includes(a.toLowerCase());
  if (!followUp && (!articles.length || !same(d.title))) {
    onStatus("Finding articles on " + d.title + "…");
    const more = await withTimeout(findArticles(d.title, d.kind, { signal }).catch(() => []), 9000);
    if (more?.length) articles = more;
  }
  // Evidence inside the answer: live articles, else the AI's own (trusted links only)
  const aiEv = articlesFromAI(d.evidence);
  d.evidence = (articles.length ? articles : aiEv).map(x => ({ source: x.publisher || x.source, title: x.title, year: x.year, url: x.url }));
  return { answer: d, articles: articles.length ? articles : aiEv };
}

// Personal normal ranges for a test (age, sex, pregnancy, fasting)
export async function personalRanges(settings, d, who, signal) {
  const comps = (d.components || []).filter(c => str(c.name));
  const res = await askJSON(settings, `Give standard laboratory reference ranges for the test "${str(d.title)}" for a person with ${who}. Elements: ${comps.map(c => str(c.name) + " (" + str(c.unit) + ")").join("; ")}. Use widely used reference intervals (conventional units as listed). Reply with ONLY a JSON object mapping each element name exactly as given to a short range string, e.g. {"Hemoglobin":"12.0–15.5"}.`, { signal, effort: "low", maxTokens: 2000 });
  const map = {}; for (const [k, v] of Object.entries(res || {})) map[k.toLowerCase()] = str(v);
  return map;
}

// One-line meaning of a medical word
export async function defineWord(settings, word, context, signal) {
  const r = await askJSON(settings, `Explain the medical word or phrase "${str(word).slice(0, 80)}"${context ? ` as used in an answer about ${context}` : ""} in one plain sentence (under 30 words) for a non-medical reader. Reply as JSON: {"word":"","meaning":""}${langNote(settings.lang)}`, { signal, effort: "low", maxTokens: 600 });
  return str(r?.meaning);
}
