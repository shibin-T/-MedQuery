// MedQuery core: shared, platform-neutral logic
// ---------------------------------------------------------------------------
// Used by BOTH the website (site/index.html, site/local-ai.js) and the
// React Native app (app/). It only needs `fetch` and `AbortController`, so it
// runs in browsers, in React Native (iOS, Android, web) and in Node 18+.
//
//   findArticles(term, kind)   real articles from trusted open sources, each with a
//                              DIRECT link to the article (never a search page)
//   ground(term, kind)         the same articles, packed as context for an AI
//   specialtyFor(condition)    which medical specialty treats a condition
//   findBestCare(...)          the best hospitals near a place for a condition,
//                              ranked, with directions and phone numbers
//   emergencyFor(place)        local emergency numbers
// ---------------------------------------------------------------------------

// ---------- small helpers ----------
export const str = v => (v == null ? "" : String(v)).trim();
export const clip = (s, n) => {
  s = String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;
};
const linkSignal = (outer, ctl) => { if (!outer) return; if (outer.aborted) ctl.abort(); else outer.addEventListener?.("abort", () => ctl.abort(), { once: true }); };
export async function getJSON(url, { ms = 10000, signal, headers, method, body } = {}) {
  const ctl = new AbortController(); linkSignal(signal, ctl);
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: method || "GET", body, signal: ctl.signal, headers: { Accept: "application/json", ...(headers || {}) } });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}

// Robust JSON from any model reply
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

// ===========================================================================
// 1. TRUSTED OPEN-ACCESS ARTICLES
// ---------------------------------------------------------------------------
// Only these publishers are used. All are free to read, run by public bodies or
// peer-reviewed, and reachable through free public APIs:
//   - MedlinePlus (US National Library of Medicine): patient guides
//   - StatPearls on NCBI Bookshelf (NLM): peer-reviewed clinical chapters
//   - Cochrane systematic reviews: free abstract and plain-language summary
//   - Open-access practice guidelines and systematic reviews in PubMed Central
//   - FDA drug labels on DailyMed (NLM) for medicines
// Every result links straight to the article itself.
// ===========================================================================
export const TRUSTED_PUBLISHERS = [
  { id: "medlineplus", name: "MedlinePlus", owner: "US National Library of Medicine", kind: "Patient guide" },
  { id: "statpearls", name: "StatPearls (NCBI Bookshelf)", owner: "US National Library of Medicine", kind: "Clinical reference" },
  { id: "cochrane", name: "Cochrane Library", owner: "Cochrane", kind: "Systematic review" },
  { id: "guideline", name: "PubMed Central", owner: "US National Library of Medicine", kind: "Practice guideline" },
  { id: "review", name: "PubMed Central", owner: "US National Library of Medicine", kind: "Systematic review" },
  { id: "dailymed", name: "DailyMed", owner: "US FDA / National Library of Medicine", kind: "Official drug label" }
];
const PUB = Object.fromEntries(TRUSTED_PUBLISHERS.map(p => [p.id, p]));
// Domains that count as trusted when a link comes from an AI instead of a live lookup
export const TRUSTED_DOMAINS = ["medlineplus.gov", "ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "europepmc.org", "cochranelibrary.com", "dailymed.nlm.nih.gov", "who.int", "cdc.gov", "nih.gov", "nice.org.uk", "nhs.uk", "fda.gov", "icmr.gov.in", "mohfw.gov.in", "doi.org"];
export function isTrustedUrl(u) {
  try { const h = new URL(u).hostname.replace(/^www\./, ""); return /^https:/.test(u) && TRUSTED_DOMAINS.some(d => h === d || h.endsWith("." + d)); } catch { return false; }
}
// Turn identifiers into direct article links
export const pmcUrl = id => "https://pmc.ncbi.nlm.nih.gov/articles/" + String(id).toUpperCase().replace(/^(?!PMC)/, "PMC") + "/";
export const bookUrl = id => "https://www.ncbi.nlm.nih.gov/books/" + id + "/";
export const doiUrl = doi => "https://doi.org/" + String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
export const pubmedUrl = pmid => "https://pubmed.ncbi.nlm.nih.gov/" + pmid + "/";

const article = (pub, o) => ({
  publisher: PUB[pub].name, owner: PUB[pub].owner, type: o.type || PUB[pub].kind, source: PUB[pub].name + " (" + PUB[pub].owner + ")",
  title: clip(o.title, 220), url: o.url, year: str(o.year), authors: clip(o.authors || "", 120), journal: str(o.journal), text: o.text || "", pub
});

// --- MedlinePlus Connect: plain-language topic pages for an ICD-10, LOINC or RxNorm code
const CODE_SYSTEMS = { icd10: "2.16.840.1.113883.6.90", loinc: "2.16.840.1.113883.6.1", rxnorm: "2.16.840.1.113883.6.88" };
async function medlinePlus(system, code, signal) {
  const url = `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=${CODE_SYSTEMS[system]}&mainSearchCriteria.v.c=${encodeURIComponent(code)}&knowledgeResponseType=application/json`;
  const j = await getJSON(url, { signal });
  return (j?.feed?.entry || []).slice(0, 2).map(e => {
    const href = e.link?.[0]?.href || "";
    return /^https:\/\/(www\.)?medlineplus\.gov\//.test(href) ? article("medlineplus", { title: e.title?._value || "MedlinePlus", url: href, text: clip(e.summary?._value, 1600) }) : null;
  }).filter(Boolean);
}
async function medlinePlusFor(term, kind, signal) {
  try {
    if (kind === "drug") {
      const rx = await getJSON(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(term)}&search=2`, { signal });
      const id = rx?.idGroup?.rxnormId?.[0]; return id ? await medlinePlus("rxnorm", id, signal) : [];
    }
    if (kind === "test") {
      const j = await getJSON(`https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search?terms=${encodeURIComponent(term)}&df=LOINC_NUM,text&maxList=3`, { signal });
      for (const c of (j?.[3] || []).map(r => r[0]).filter(Boolean)) { const r = await medlinePlus("loinc", c, signal).catch(() => []); if (r.length) return r; }
      return [];
    }
    const j = await getJSON(`https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(term)}&df=primary_name&ef=icd10cm_codes&maxList=3`, { signal });
    for (const c of (j?.[2]?.icd10cm_codes || []).map(c => String(c).split(",")[0]).filter(Boolean)) { const r = await medlinePlus("icd10", c, signal).catch(() => []); if (r.length) return r; }
  } catch {}
  return [];
}

// --- Europe PMC: one free API that indexes StatPearls, Cochrane and PubMed Central
const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const esc = s => String(s).replace(/["\\]/g, " ").trim();
async function europePMC(query, { size = 3, sort = "CITED desc", signal } = {}) {
  const j = await getJSON(`${EPMC}?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${size}&sort=${encodeURIComponent(sort)}`, { signal });
  return j?.resultList?.result || [];
}
const authorsOf = r => { const a = str(r.authorString); if (!a) return ""; const parts = a.split(",").map(str).filter(Boolean); return parts.length > 3 ? parts.slice(0, 3).join(", ") + " et al." : parts.join(", "); };
async function statPearls(term, signal) {
  // NCBI Bookshelf chapters appear in Europe PMC with source NBK and an "NBK123456" id; StatPearls first
  const rs = (await europePMC(`TITLE:"${esc(term)}" AND SRC:NBK`, { size: 6, sort: "P_PDATE_D desc", signal })).filter(r => /^NBK\d+$/.test(r.id));
  const isSP = r => /statpearls/i.test(JSON.stringify(r.bookOrReportDetails || {}) + " " + (r.journalTitle || ""));
  rs.sort((a, b) => isSP(b) - isSP(a));
  return rs.slice(0, 2).map(r => {
    const book = str(r.bookOrReportDetails?.publisher) || (isSP(r) ? "StatPearls" : "NCBI Bookshelf");
    return article("statpearls", { title: r.title, url: bookUrl(r.id), year: r.pubYear, authors: authorsOf(r), journal: isSP(r) ? "StatPearls" : book, text: clip(r.abstractText, 1200), type: isSP(r) ? "Clinical reference" : "Clinical reference book" });
  });
}
async function cochrane(term, signal) {
  const rs = await europePMC(`TITLE_ABS:"${esc(term)}" AND JOURNAL:"Cochrane Database Syst Rev"`, { size: 2, sort: "P_PDATE_D desc", signal });
  return rs.map(r => {
    const url = r.pmcid ? pmcUrl(r.pmcid) : r.doi ? doiUrl(r.doi) : r.pmid ? pubmedUrl(r.pmid) : "";
    return url ? article("cochrane", { title: r.title, url, year: r.pubYear, authors: authorsOf(r), journal: "Cochrane Database of Systematic Reviews", text: clip(r.abstractText, 1000), type: r.pmcid ? "Systematic review (free full text)" : "Systematic review (free summary)" }) : null;
  }).filter(Boolean);
}
async function openAccess(term, pubType, signal) {
  const rs = await europePMC(`TITLE:"${esc(term)}" AND OPEN_ACCESS:y AND PUB_TYPE:"${pubType}" AND PUB_YEAR:[2012 TO 2100]`, { size: 4, signal });
  return rs.filter(r => /^PMC\d+$/.test(str(r.pmcid))).slice(0, 2).map(r => article(pubType === "practice-guideline" ? "guideline" : "review", {
    title: r.title, url: pmcUrl(r.pmcid), year: r.pubYear, authors: authorsOf(r), journal: str(r.journalInfo?.journal?.title || r.journalTitle), text: clip(r.abstractText, 900),
    type: pubType === "practice-guideline" ? "Practice guideline (free full text)" : "Systematic review (free full text)"
  }));
}

// --- FDA drug label (openFDA) -> the label's own page on DailyMed
async function dailyMed(term, signal) {
  const q = encodeURIComponent(`openfda.generic_name:"${esc(term)}"+openfda.brand_name:"${esc(term)}"`);
  const j = await getJSON(`https://api.fda.gov/drug/label.json?search=${q}&limit=1`, { signal });
  const L = j?.results?.[0]; if (!L?.set_id) return [];
  const f = k => clip((L[k] || []).join(" "), 420);
  const route = (L.openfda?.route || []).join(", ");
  const name = L.openfda?.brand_name?.[0] || L.openfda?.generic_name?.[0] || term;
  return [article("dailymed", {
    title: name + " prescribing information (FDA label)", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=" + encodeURIComponent(L.set_id), year: str(L.effective_time).slice(0, 4),
    text: [route && "Route: " + route, f("indications_and_usage") && "Uses: " + f("indications_and_usage"), f("dosage_and_administration") && "How it is given: " + f("dosage_and_administration"),
      (f("warnings_and_cautions") || f("warnings")) && "Warnings: " + (f("warnings_and_cautions") || f("warnings")), f("contraindications") && "Do not use: " + f("contraindications"),
      f("adverse_reactions") && "Side effects: " + f("adverse_reactions"), f("drug_interactions") && "Interactions: " + f("drug_interactions")].filter(Boolean).join("\n")
  })];
}

// Clean a search into the medical term itself ("what is dengue fever?" -> "dengue fever")
export function cleanTerm(term) {
  return str(term).replace(/\(.*?\)/g, " ").replace(/^(what|how|why|when|is|are|can|does|do|should)\b.*?\b(is|are|of|for|about|cause|causes|treat|treated|with)\b\s+/i, "").replace(/[?!.]+$/, "").replace(/\s+/g, " ").trim() || str(term);
}
const ORDER = { guideline: 0, cochrane: 1, statpearls: 2, dailymed: 3, review: 4, medlineplus: 5 };
/**
 * Real articles about a topic, each with a direct link.
 * @param {string} term  the condition, test or medicine
 * @param {"disease"|"test"|"drug"|"question"} kind
 * @returns {Promise<Array<{publisher,owner,type,source,title,url,year,authors,journal,text}>>}
 */
export async function findArticles(term, kind = "disease", { signal, limit = 7 } = {}) {
  const t = cleanTerm(term); if (!t) return [];
  const jobs = [medlinePlusFor(t, kind, signal), statPearls(t, signal)];
  if (kind === "drug") jobs.push(dailyMed(t, signal));
  if (kind !== "test") jobs.push(cochrane(t, signal), openAccess(t, "practice-guideline", signal));
  jobs.push(openAccess(t, kind === "test" ? "review" : "systematic-review", signal));
  const settled = await Promise.allSettled(jobs);
  const seen = new Set(), out = [];
  for (const a of settled.flatMap(r => r.status === "fulfilled" ? r.value : [])) {
    if (!a?.url || !isTrustedUrl(a.url)) continue;
    const key = a.url.toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push(a);
  }
  out.sort((a, b) => (ORDER[a.pub] ?? 9) - (ORDER[b.pub] ?? 9));
  // keep variety: at most two from one publisher
  const per = {}, picked = [];
  for (const a of out) { per[a.pub] = (per[a.pub] || 0) + 1; if (per[a.pub] <= 2) picked.push(a); }
  return picked.slice(0, limit);
}

// Links an AI named itself (used only when live lookups are impossible). Kept only when
// they point at a trusted publisher; marked so the page can say they were not checked live.
export function articlesFromAI(evidence) {
  const out = [];
  for (const x of Array.isArray(evidence) ? evidence : []) {
    if (!x || typeof x !== "object") continue;
    let url = "";
    if (/^PMC\d+$/i.test(str(x.pmcid))) url = pmcUrl(str(x.pmcid));
    else if (/^NBK\d+$/i.test(str(x.nbk))) url = bookUrl(str(x.nbk).toUpperCase());
    else if (/^\d{5,9}$/.test(str(x.pmid))) url = pubmedUrl(str(x.pmid));
    else if (/^10\.\d{4,9}\/\S+$/.test(str(x.doi))) url = doiUrl(str(x.doi));
    else if (isTrustedUrl(str(x.url))) url = str(x.url);
    if (!url || !str(x.title)) continue;
    out.push({ publisher: str(x.source) || new URL(url).hostname.replace(/^www\./, ""), owner: "", type: str(x.type) || "Article", source: str(x.source), title: clip(x.title, 220), url, year: str(x.year), authors: "", journal: "", text: "", unverified: true });
  }
  return out.slice(0, 6);
}

/** Articles plus a compact context block an AI can answer from. */
export async function ground(term, kind, { signal, budget = 5200 } = {}) {
  const articles = await findArticles(term, kind === "question" ? "disease" : kind, { signal });
  const withText = articles.filter(a => a.text).slice(0, 5);
  const context = withText.map((s, i) => {
    const t = s.text.slice(0, Math.max(300, Math.floor(budget / withText.length)));
    return `[S${i + 1}] ${s.source} — ${s.title}${s.year ? " (" + s.year + ")" : ""}\n${t}`;
  }).join("\n\n");
  return { sources: articles, context };
}

// ===========================================================================
// 2. BEST CARE FOR A CONDITION
// ---------------------------------------------------------------------------
// Live hospital data from OpenStreetMap (free, no keys). Each place is scored for
// the condition: does it list the right specialty, is it a large or teaching
// hospital, does it run a 24-hour emergency department, and how far away is it.
// ===========================================================================
export const SPECIALTIES = [
  { name: "Cardiology", osm: ["cardiology", "cardiac_surgery", "cardiothoracic_surgery"], words: ["heart", "cardiac", "cardio"], match: /heart|cardi|myocard|coronary|angina|arrhythm|atrial|hypertension|blood pressure|valve|aort|palpitation|cholesterol|statin/i },
  { name: "Oncology", osm: ["oncology", "radiotherapy", "haematology"], words: ["cancer", "oncology", "tumour", "tumor"], match: /cancer|tumou?r|carcinoma|lymphoma|leuk(a)?emia|melanoma|sarcoma|myeloma|oncolog|chemotherap|metasta/i },
  { name: "Neurology", osm: ["neurology", "neurosurgery"], words: ["neuro", "brain", "spine"], match: /stroke|epilep|seizure|migraine|headache|parkinson|alzheimer|dementia|multiple sclerosis|neuropath|brain|nerve|meningitis|vertigo/i },
  { name: "Nephrology", osm: ["nephrology", "dialysis"], words: ["kidney", "nephro", "dialysis", "renal"], match: /kidney|renal|nephr|ckd|dialysis|creatinine|kft|rft/i },
  { name: "Urology", osm: ["urology"], words: ["urology", "uro"], match: /urinary|bladder|prostat|kidney stone|uti|incontinence|psa/i },
  { name: "Endocrinology", osm: ["endocrinology", "diabetology"], words: ["diabet", "endocrin", "thyroid"], match: /diabet|thyroid|tsh|hba1c|insulin|metformin|endocrin|hormone|cushing|addison|obesity|semaglutide|levothyrox/i },
  { name: "Pulmonology", osm: ["pneumology", "pulmonology", "respiratory", "tuberculosis"], words: ["chest", "lung", "pulmo", "respiratory", "tb"], match: /asthma|copd|pneumon|tubercul|\btb\b|lung|bronch|respirat|breath|inhaler|salbutamol|cough|covid/i },
  { name: "Gastroenterology", osm: ["gastroenterology", "hepatology"], words: ["gastro", "liver", "digestive", "hepato"], match: /liver|hepat|gerd|reflux|ulcer|crohn|colitis|ibs|bowel|gastr|pancrea|gallstone|jaundice|cirrhosis|lft|masld/i },
  { name: "Orthopaedics", osm: ["orthopaedics", "orthopedics", "trauma", "rheumatology"], words: ["ortho", "bone", "joint", "spine"], match: /fracture|arthritis|osteo|back pain|joint|knee|hip|spine|sprain|gout|tendon|ligament|rheumat|lupus/i },
  { name: "Ophthalmology", osm: ["ophthalmology"], words: ["eye", "vision", "netra", "ophthal"], match: /\beye|cataract|glaucoma|conjunctivitis|retina|vision|macular|myopia/i, clinicsOk: true },
  { name: "Obstetrics & gynaecology", osm: ["gynaecology", "obstetrics", "gynecology"], words: ["women", "maternity", "mother", "gynae", "gyne"], match: /pregnan|ovar|uter|menstru|pcos|pcod|endometrios|cervic|menopaus|fertility|gyn|obstetric|breastfeed/i },
  { name: "Paediatrics", osm: ["paediatrics", "pediatrics", "neonatology"], words: ["child", "children", "kids", "paediatric", "pediatric"], match: /child|infant|baby|newborn|paediatr|pediatr|kawasaki|measles|chickenpox/i },
  { name: "Dermatology", osm: ["dermatology"], words: ["skin", "derma"], match: /skin|eczema|dermat|psoriasis|acne|rash|fungal|vitiligo|urticaria/i, clinicsOk: true },
  { name: "Psychiatry", osm: ["psychiatry", "psychology"], words: ["mental", "psych", "behaviour", "behavior"], match: /depress|anxiety|schizo|bipolar|mental|psych|adhd|autism|insomnia|addiction|suicid|panic|ocd|ptsd/i },
  { name: "ENT", osm: ["otolaryngology", "otorhinolaryngology", "ent"], words: ["ent", "ear", "nose", "throat"], match: /\bear\b|nose|throat|sinus|tonsil|hearing|ent\b|otitis|laryng/i, clinicsOk: true },
  { name: "Infectious diseases", osm: ["infectious_diseases", "tropical_medicine"], words: ["infectious", "fever"], match: /hiv|dengue|malaria|typhoid|infection|sepsis|cholera|hepatitis b|hepatitis c|chikungunya|leptospir|rabies/i },
  { name: "Dentistry", osm: ["dentist", "dental_oral_maxillo_facial_surgery", "orthodontics"], words: ["dental", "dentist", "teeth"], match: /tooth|teeth|dental|gum|cavity|gingiv/i, clinicsOk: true }
];
const GENERAL = { name: "General & emergency medicine", osm: ["general", "emergency", "internal"], words: [], match: /.^/ };
/** Which specialty treats this condition (falls back to general & emergency medicine). */
export function specialtyFor(condition) {
  const s = str(condition);
  return SPECIALTIES.find(x => x.match.test(s)) || GENERAL;
}

// ---- geocoding (OpenStreetMap Nominatim: max 1 request a second)
let lastNominatim = 0;
async function nominatim(path, { lang = "en", signal } = {}) {
  const wait = Math.max(0, lastNominatim + 1100 - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait));
  lastNominatim = Date.now();
  return getJSON("https://nominatim.openstreetmap.org" + path + "&accept-language=" + encodeURIComponent(lang), { ms: 12000, signal });
}
/** Place text -> { lat, lon, label, country, countryCode } (or null) */
export async function geocode(text, opts) {
  const g = await nominatim("/search?format=jsonv2&addressdetails=1&limit=1&q=" + encodeURIComponent(text), opts);
  if (!g?.length) return null;
  return { lat: +g[0].lat, lon: +g[0].lon, label: g[0].display_name || text, country: g[0].address?.country || "", countryCode: g[0].address?.country_code || "" };
}
/** Coordinates (from the device) -> { lat, lon, label, country, countryCode } */
export async function reverseGeocode(lat, lon, opts) {
  try {
    const g = await nominatim(`/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lon}`, opts);
    const a = g?.address || {};
    const label = [a.suburb || a.neighbourhood || a.village, a.city || a.town || a.county, a.state].filter(Boolean).join(", ") || g?.display_name || "your location";
    return { lat, lon, label, country: a.country || "", countryCode: a.country_code || "" };
  } catch { return { lat, lon, label: "your location", country: "", countryCode: "" }; }
}

const R_EARTH = 6371, rad = d => d * Math.PI / 180;
export const kmBetween = (a, b) => { const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.sqrt(h)); };
export const fmtKm = km => km == null ? "" : km < 1 ? "≈ " + Math.max(100, Math.round(km * 10) * 100) + " m" : "≈ " + (km < 10 ? km.toFixed(1) : Math.round(km)) + " km";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
/** Hospitals and clinics around a point, from OpenStreetMap. */
export async function placesAround(origin, { radiusM = 15000, specialty = GENERAL, signal } = {}) {
  const { lat, lon } = origin;
  const specRe = specialty.osm.filter(x => !["general", "emergency", "internal"].includes(x)).join("|");
  const q = `[out:json][timeout:25];(nwr["amenity"~"^(hospital|clinic)$"](around:${radiusM},${lat},${lon});nwr["healthcare"~"^(hospital|clinic)$"](around:${radiusM},${lat},${lon});${specRe ? `nwr["healthcare:speciality"~"${specRe}"](around:${radiusM},${lat},${lon});` : ""});out center tags 400;`;
  let data = null;
  for (const url of OVERPASS) {
    try { data = await getJSON(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, ms: 30000, signal }); break; } catch (e) { if (signal?.aborted) throw e; }
  }
  if (!data) throw Object.assign(new Error("map service unreachable"), { code: "places_unreachable" });
  const seen = new Set(), places = [];
  for (const e of data.elements || []) {
    const t = e.tags || {}, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon, name = t["name:en"] || t.name;
    if (la == null || !name) continue;
    const key = name.toLowerCase() + Math.round(la * 1000); if (seen.has(key)) continue; seen.add(key);
    const address = t["addr:full"] || [t["addr:housenumber"] && t["addr:street"] ? t["addr:housenumber"] + " " + t["addr:street"] : t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ");
    const op = ((t["operator:type"] || "") + " " + (t.operator || "")).toLowerCase();
    const phones = [t["contact:phone"], t.phone, t["contact:mobile"], t["emergency:phone"]].filter(Boolean).join(";").split(/[;,]/).map(str).filter(p => p.replace(/\D/g, "").length >= 5);
    places.push({
      id: e.type + "/" + e.id, name, address, lat: la, lon: lo, km: kmBetween(origin, { lat: la, lon: lo }),
      phone: phones[0] || "", phones: [...new Set(phones)].slice(0, 3), website: t["contact:website"] || t.website || "",
      er: t.emergency === "yes", gov: /public|government|govt|municipal|district|state|national/.test(op), priv: /private|commercial/.test(op),
      beds: parseInt(t.beds, 10) || 0, specialities: (t["healthcare:speciality"] || "").toLowerCase().split(/[;,]/).map(str).filter(Boolean),
      isHospital: (t.amenity || t.healthcare) === "hospital", dest: [name, address].filter(Boolean).join(", "), osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`
    });
  }
  return places;
}

const MAJOR = /medical college|institute|aiims|university|teaching|general hospital|district hospital|government hospital|civil hospital|super ?-?speciality|super ?-?specialty|multi ?-?speciality|multi ?-?specialty|medical cent(er|re)|memorial|infirmary|royal|national/i;
/** Score and explain each place for a specialty. Higher is better. */
export function rankForCondition(places, specialty = GENERAL) {
  const general = specialty === GENERAL;
  return places.map(p => {
    const why = []; let score = 0;
    const lname = p.name.toLowerCase();
    const specHit = !general && p.specialities.some(s => specialty.osm.includes(s));
    const nameHit = !general && specialty.words.some(w => new RegExp("\\b" + w, "i").test(lname));
    if (specHit) { score += 40; why.push("Lists " + specialty.name.toLowerCase()); }
    if (nameHit) { score += specHit ? 10 : 30; if (!specHit) why.push("Specialist centre for " + specialty.name.toLowerCase()); }
    if (p.isHospital) { score += 15; } else if (!(specialty.clinicsOk && (specHit || nameHit))) score -= 10;
    if (MAJOR.test(p.name)) { score += 12; why.push(/college|institute|aiims|university|teaching/i.test(p.name) ? "Teaching / specialist institute" : "Major hospital"); }
    if (p.beds) { score += Math.min(15, p.beds / 40); if (p.beds >= 100) why.push(p.beds + " beds"); }
    if (p.specialities.length >= 4) { score += 5; why.push("Many specialties"); }
    if (p.er) { score += 8; why.push("24-hour emergency"); }
    if (p.phone) score += 3;
    if (p.website) score += 2;
    score -= Math.min(30, p.km * 1.1);
    return { ...p, score: Math.round(score * 10) / 10, why, specialtyMatch: specHit || nameHit };
  }).sort((a, b) => b.score - a.score);
}

/**
 * The best places near a location for a condition.
 * @param {{text?:string, lat?:number, lon?:number}} where  typed place, or device coordinates
 * @param {string} condition  e.g. "Asthma"
 * @returns {Promise<{origin, specialty, places, country, countryCode}>}
 */
export async function findBestCare(where, condition, { signal, lang = "en", radiusM = 20000, limit = 8 } = {}) {
  const origin = where?.lat != null && where?.lon != null ? await reverseGeocode(where.lat, where.lon, { lang, signal }) : await geocode(str(where?.text), { lang, signal });
  const specialty = specialtyFor(condition);
  if (!origin) return { origin: null, specialty, places: [], country: "", countryCode: "" };
  let places = await placesAround(origin, { radiusM, specialty, signal });
  if (places.filter(p => p.isHospital).length < 3 && radiusM < 40000) places = await placesAround(origin, { radiusM: 40000, specialty, signal }); // rural: look wider
  const ranked = rankForCondition(places, specialty).slice(0, limit);
  return { origin, specialty, places: ranked, country: origin.country, countryCode: origin.countryCode };
}

/** Prompt for an AI to re-rank REAL candidates (it may not add places or numbers). */
export function bestCarePrompt(condition, specialty, originLabel, candidates) {
  const list = candidates.slice(0, 15).map((p, i) => `${i + 1}. ${p.name} | ${p.address || "address unknown"} | ${fmtKm(p.km)} | ${p.isHospital ? "hospital" : "clinic"}${p.beds ? " | " + p.beds + " beds" : ""}${p.specialities.length ? " | lists: " + p.specialities.join(", ") : ""}${p.er ? " | 24h emergency" : ""}`).join("\n");
  return `A patient near "${originLabel}" is looking for the best place to be treated for "${condition}" (specialty: ${specialty.name}).
Here are REAL facilities from a live map, numbered:
${list}

Pick up to 6 that are best for this condition, best first. Prefer places widely known for ${specialty.name.toLowerCase()} care (specialist departments, teaching hospitals, recognised centres), then capability and size, then distance. Use ONLY the numbered places; never add a place, address or phone number.
Reply with ONLY JSON: {"picks":[{"n":1,"why":"one short reason, under 18 words"}],"note":"one short caution, or ''"}`;
}

// ===========================================================================
// 3. EMERGENCY NUMBERS [country, general, ambulance]
// ===========================================================================
export const EMERGENCY = {
  in: ["India", "112", "108"], us: ["United States", "911", "911"], gb: ["United Kingdom", "999", "999"], ca: ["Canada", "911", "911"], au: ["Australia", "000", "000"], nz: ["New Zealand", "111", "111"],
  ie: ["Ireland", "112", "112"], de: ["Germany", "112", "112"], fr: ["France", "112", "15"], es: ["Spain", "112", "112"], it: ["Italy", "112", "118"], nl: ["Netherlands", "112", "112"],
  ae: ["United Arab Emirates", "999", "998"], sa: ["Saudi Arabia", "911", "997"], qa: ["Qatar", "999", "999"], sg: ["Singapore", "999", "995"], my: ["Malaysia", "999", "999"],
  pk: ["Pakistan", "15", "1122"], bd: ["Bangladesh", "999", "999"], np: ["Nepal", "100", "102"], lk: ["Sri Lanka", "119", "1990"], jp: ["Japan", "110", "119"], cn: ["China", "110", "120"],
  ph: ["Philippines", "911", "911"], id: ["Indonesia", "112", "118"], za: ["South Africa", "112", "10177"], ke: ["Kenya", "999", "999"], ng: ["Nigeria", "112", "112"], br: ["Brazil", "190", "192"], mx: ["Mexico", "911", "911"]
};
const COUNTRY_WORDS = { india: "in", "united states": "us", usa: "us", "united kingdom": "gb", uk: "gb", england: "gb", scotland: "gb", wales: "gb", canada: "ca", australia: "au", "new zealand": "nz", ireland: "ie", germany: "de", france: "fr", spain: "es", italy: "it", netherlands: "nl", uae: "ae", "united arab emirates": "ae", dubai: "ae", "saudi arabia": "sa", qatar: "qa", singapore: "sg", malaysia: "my", pakistan: "pk", bangladesh: "bd", nepal: "np", "sri lanka": "lk", japan: "jp", china: "cn", philippines: "ph", indonesia: "id", "south africa": "za", kenya: "ke", nigeria: "ng", brazil: "br", mexico: "mx" };
const INDIA_PLACES = /\b(mumbai|delhi|bengaluru|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad|kochi|cochin|thiruvananthapuram|trivandrum|kerala|tamil nadu|karnataka|maharashtra|gujarat|jaipur|lucknow|chandigarh|bhopal|indore|nagpur|patna|guwahati|coimbatore|mysuru|mysore|noida|gurgaon|gurugram|kozhikode|calicut|thrissur|madurai|visakhapatnam|vizag|bhubaneswar|goa|surat|vadodara|kanpur|varanasi|dehradun|ranchi|raipur|vellore|manipal|mangaluru|mangalore)\b/i;
/** [country, general number, ambulance number] or null */
export function emergencyFor(place, countryCode) {
  if (countryCode && EMERGENCY[countryCode.toLowerCase()]) return EMERGENCY[countryCode.toLowerCase()];
  const s = str(place).toLowerCase();
  for (const [w, cc] of Object.entries(COUNTRY_WORDS)) if (new RegExp("\\b" + w + "\\b").test(s)) return EMERGENCY[cc];
  if (INDIA_PLACES.test(s)) return EMERGENCY.in;
  return null;
}
export const telHref = n => "tel:" + String(n).replace(/[^\d+]/g, "");

// Directions in the viewer's map app
export const MAP_APPS = {
  google: { label: "Google Maps", url: p => p.lat != null ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${p.lat},${p.lon}` : "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(p.dest) },
  apple: { label: "Apple Maps", url: p => p.lat != null ? `https://maps.apple.com/?dirflg=d&daddr=${p.lat},${p.lon}&q=${encodeURIComponent(p.name)}` : "https://maps.apple.com/?dirflg=d&daddr=" + encodeURIComponent(p.dest) },
  waze: { label: "Waze", url: p => p.lat != null ? `https://waze.com/ul?navigate=yes&ll=${p.lat},${p.lon}` : "https://waze.com/ul?navigate=yes&q=" + encodeURIComponent(p.dest) },
  osm: { label: "OpenStreetMap", url: (p, o) => p.lat != null && o ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${o.lat},${o.lon};${p.lat},${p.lon}` : "https://www.openstreetmap.org/search?query=" + encodeURIComponent(p.dest) }
};

// ===========================================================================
// 4. PROMPTS shared by every AI engine
// ===========================================================================
// Answer prompt for capable models (Claude): full schema, grounded in the live articles
export function answerPromptFull({ q, mode = "auto", context, sources, detail, langNote = "", followUp }) {
  const hint = mode === "auto" ? "Detect the kind yourself." : "The user picked a suggestion of kind: " + mode + ".";
  const ctx = followUp ? `\nThis is a follow-up to an earlier answer titled "${str(followUp.title)}" (summary: ${str(followUp.summary)}). Answer the follow-up in that context, usually as kind "question".\n` : "";
  const length = detail
    ? `LENGTH: DETAILED version. Fill every field fully (lists up to 8 items, each item one or two sentences) and add 3-5 "details" sections (for diseases: Pathology & pathophysiology, Complications, Outlook, Who is at risk; for tests: How it is done, What can affect results, Follow-up tests; for drugs: Typical dosing (general, "as prescribed"), Monitoring, Pregnancy & breastfeeding). About 700-1000 words.`
    : `LENGTH: QUICK version. Brief and simple, plain words a non-medical reader understands. Each list item is a short phrase (under 10 words). Lists 3-5 items. Summary one or two short sentences. "details": []. About 200-350 words total.`;
  const src = sources ? `\nTRUSTED SOURCES retrieved live for this query (prefer these; they are shown to the reader as "Verify at the source"):\n${sources}\n` : "";
  return `You are MedQuery, a medical reference engine. Base every statement STRICTLY on trusted, free-to-read medical sources: the TRUSTED SOURCES below first, then other open-access evidence (PubMed Central open-access articles, Cochrane reviews, StatPearls / NCBI Bookshelf, MedlinePlus, WHO, CDC, NICE, NIH, ICMR/MoHFW, FDA DailyMed). If evidence is thin, mixed, preliminary or you are unsure, say so plainly in "uncertainty", lower "confidence", and set "needsResearch" true when more research is needed. Never invent studies, statistics, titles, identifiers or citations. Never give personalised dosing. If the query is not medical, use kind "question" and say MedQuery covers medical topics. If it describes an emergency, fill "urgent".
${hint}${ctx}${src}${context ? "\n" + context + "\n" : ""}
Query: """${str(q).slice(0, 2000)}"""

${length}

Reply with ONLY one JSON object. Always include: "kind" ("disease"|"test"|"drug"|"question"), "title" (the condition, test or medicine name), "aka" (array), "summary", "urgent" (red flags needing urgent care, or ""), "evidence" (array of 2-5 objects for real, free-to-read articles you are confident exist: {"source": publisher or journal, "title": exact article title, "year": "YYYY or ''", "pmcid": "PMC… or ''", "nbk": "NBK… (NCBI Bookshelf / StatPearls) or ''", "doi": "or ''", "url": "direct article URL on medlineplus.gov, ncbi.nlm.nih.gov, who.int, cdc.gov, nice.org.uk or nhs.uk, or ''"}; give an identifier only when you are sure of it), "confidence" ("high"|"moderate"|"low"), "uncertainty" ("" when evidence is clear and consistent; otherwise one plain sentence on what is uncertain or debated), "needsResearch" (true|false), "related" (4-6 related searches), "details" (array of {"heading","body","bullets"}).
Then the fields for that kind:
- disease: "definition" (1-2 plain sentences), "symptoms": {"common": [...], "uncommon": [...]}, "causes": [...], "tests": [{"name","why"}] (screening and confirmatory tests), "homeRemedies": {"applicable": true only for simple, usually self-limiting conditions (e.g. common cold, mild gastroenteritis, minor burns) else false, "note": "one line on when to see a doctor, or why home remedies are not appropriate", "items": [{"name","how": "one-line recipe/method","allergens": [list every known common allergen in it, e.g. milk, egg, peanut, tree nuts, soy, wheat/gluten, sesame, mustard, fish, shellfish, celery, honey (never for infants under 1), citrus, turmeric, ginger, garlic, pollen; [] if none]}]} — only well-established safe remedies, "prevention": [...], "treatments": [{"option","route": "for medicines: how it is given (route + form, e.g. Oral tablet, IV injection, Inhaler, Eye drops); '' for non-medicine treatments","note": "short","usd": [low, high] typical US cost as numbers,"inr": [low, high] typical Indian cost as numbers,"unit": "e.g. per course, per month, one-time"}].
- test: "purpose", "specimen", "preparation", "components": [{"name","normal": "typical adult normal range","unit": "conventional unit","depends": true if the normal value meaningfully changes with age, sex, pregnancy or another factor}] — list EVERY element/parameter the test reports, "factors": [the factors the ranges depend on, from: "age","sex","pregnancy","fasting"], "highLow": [{"finding": "e.g. High ALT","meaning"}].
- drug: "drug": {"class","howItWorks","administration": {"routes": ["every available route + form"], "how": "1-2 plain sentences on how and when it is taken or given; never personal doses"},"uses": [...],"commonSideEffects": [...],"seriousSideEffects": [...],"cautions": [...],"interactions": [...]}.
- question: "answer" (direct answer, plain text), "points": [...].
MEDICINES: whenever you name a specific medicine anywhere, always state how it is given: route and form.${langNote}`;
}

// Compact prompt for small on-device models: answer ONLY from the retrieved sources
const KIND_SCHEMA = {
  disease: `"definition":"1-2 plain sentences","symptoms":{"common":["..."],"uncommon":["..."]},"causes":["..."],"tests":[{"name":"","why":""}],"homeRemedies":{"applicable":true or false (true only for simple self-limiting illnesses),"note":"","items":[{"name":"","how":"","allergens":["common allergens in it, or empty"]}]},"prevention":["..."],"treatments":[{"option":"","route":"how a medicine is given, e.g. Oral tablet; '' if not a medicine","note":""}]`,
  test: `"purpose":"","specimen":"","preparation":"","components":[{"name":"","normal":"typical adult range","unit":"","depends":true or false}],"factors":["age","sex","pregnancy","fasting" (only those that change the ranges)],"highLow":[{"finding":"","meaning":""}]`,
  drug: `"drug":{"class":"","howItWorks":"","administration":{"routes":["e.g. Oral tablet"],"how":"how and when it is taken, no personal doses"},"uses":["..."],"commonSideEffects":["..."],"seriousSideEffects":["..."],"cautions":["..."],"interactions":["..."]}`,
  question: `"answer":"direct plain answer","points":["..."]`
};
export function answerPrompt({ q, kind, context, detail, langNote, followUp }) {
  const size = detail ? "DETAILED: lists up to 6 items, 1 sentence each; add 2-3 'details' sections." : "QUICK: very short and simple, lists of 3-4 short phrases, 'details': [].";
  return `SOURCES (trusted open-access references):
${context || "(No sources could be retrieved.)"}

TASK: Answer the medical query "${str(q).slice(0, 300)}"${followUp ? ` as a follow-up to "${followUp}"` : ""}. It is a ${kind}.
RULES: Use ONLY facts stated in the SOURCES. If the sources do not cover a field, leave it empty ("" or []) rather than guessing. Plain language for non-medical readers. Never give personal doses. Name any medicine with how it is given. If the sources are missing or thin, set "confidence":"low" and explain in "uncertainty". ${size}${langNote || ""}
Reply with ONE JSON object:
{"kind":"${kind}","title":"","aka":[],"summary":"1-2 sentences","urgent":"warning signs needing urgent care, or ''",${KIND_SCHEMA[kind] || KIND_SCHEMA.question},"details":[],"confidence":"high|moderate|low","uncertainty":"","needsResearch":false,"related":["3-5 related searches"]}`;
}
export function reportPrompt(text, langNote) {
  return `LAB REPORT${text ? ` TEXT (recognised from an uploaded report; may contain personal details and recognition errors):
"""${String(text).slice(0, 7000)}"""` : " (attached above)"}

TASK: Extract ONLY the laboratory test results and explain each in plain language.
PRIVACY: never output names, ages, IDs, phone numbers, addresses, dates, doctor or lab names.
Use the reference range printed in the report; if none, use a widely accepted adult range and set "rangeSource":"standard". If it is not a lab report or values are unreadable, return {"readable":false,"reason":"..."}.
Status: normal, borderline_low/high (within ~10% outside the range), low/high, critical_low/high (far outside or dangerous), unknown.
Keep "meaning" and "inference" under 20 words each. Possible diagnoses are possibilities, not diagnoses.${langNote || ""}
Reply with ONE JSON object:
{"readable":true,"reportType":"","summary":"2 plain sentences","urgent":"","results":[{"test":"","value":"","unit":"","range":"","rangeSource":"report|standard","status":"","meaning":"","inference":"","readCertain":true}],"patterns":[],"possibleDiagnoses":[{"name":"","likelihood":"likely|possible|less likely","why":"","confirm":""}],"nextSteps":[],"caveat":"","confidence":"high|moderate|low"}`;
}
