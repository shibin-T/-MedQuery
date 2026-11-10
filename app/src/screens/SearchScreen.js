// Search tab: search bar with suggestions, then the answer with its Sources and Best Care
// on separate tabs so each fits a phone screen.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme, KIND_LABEL } from "../theme";
import { Card, H, P, Btn, Input, Chip, Loading, Segmented, s, str } from "../components/ui";
import AnswerView from "../components/AnswerView";
import SourcesCard from "../components/SourcesCard";
import BestCareCard from "../components/BestCareCard";
import { runSearch, suggestions, indexHit } from "../search";
import { engineReady, engineLabel } from "../ai";
import { findArticles } from "../core";
import { savedId, shareAnswer } from "../saved";

// A small picture for each body system in the built-in index
const SYS_ICON = { endo: "🩸", repro: "⚥", heart: "❤️", drop: "💧", lung: "🫁", brain: "🧠", microbe: "🦠", immune: "🛡️", liver: "🫀", kidney: "🫘", skin: "✋", gut: "🍽️", bone: "🦴", mind: "💭", eye: "👁️", dna: "🧬", tube: "🧪", ask: "❓", pill: "💊" };
const EXAMPLES = ["Dengue fever", "Hemoglobin A1c (HbA1c)", "Metformin", "Asthma", "Is paracetamol safe in pregnancy?"];

export default function SearchScreen({ settings, onSettings, onCall, request, saved, onToggleSave, onLocated, onOpenMore, onToast, scrollTop }) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [run, setRun] = useState(null);
  const [res, setRes] = useState({ status: "idle" });
  const [articles, setArticles] = useState({ loading: false, list: [], term: "" });
  const [condition, setCondition] = useState("");
  const [tab, setTab] = useState("answer");
  const ctl = useRef(null);

  useEffect(() => { if (request?.q) search(request.q, request.mode || "auto"); }, [request?.n]);

  const loadArticles = (term, kind) => {
    setArticles({ loading: true, list: [], term });
    findArticles(term, kind || "disease").then(list => setArticles({ loading: false, list, term })).catch(() => setArticles({ loading: false, list: [], term }));
  };

  async function search(text, mode = "auto", opts = {}) {
    text = str(text); if (!text) return;
    const r = { q: text, mode, detail: !!opts.detail, followUp: opts.followUp || null };
    setRun(r); setFocus(false); setTab("answer"); scrollTop?.();
    if (!opts.followUp) setQ(text);
    if (!opts.detail && !opts.followUp) onSettings(st => ({ ...st, recent: [text, ...(st.recent || []).filter(x => x.toLowerCase() !== text.toLowerCase())].slice(0, 12) }));
    ctl.current?.abort(); const my = ctl.current = new AbortController();
    if (!opts.keepSide) { setArticles({ loading: true, list: [], term: indexHit(text)?.term.split(" (")[0] || text }); setCondition(""); }
    if (!engineReady(settings)) {
      // No AI engine: still show the trusted articles and the hospital finder
      const hit = indexHit(text);
      setRes({ status: "error", code: "no_engine", msg: "Add an AI engine in More › Settings to get answers. Sources and Best Care still work without one." });
      if (hit?.kind === "disease") setCondition(hit.term.split(" (")[0]);
      loadArticles(hit ? hit.term.split(" (")[0] : text, hit?.kind);
      return;
    }
    setRes({ status: "loading", msg: "Understanding your search…" });
    try {
      const out = await runSearch({ ...r, settings, signal: my.signal, onStatus: msg => { if (my === ctl.current) setRes({ status: "loading", msg }); } });
      if (my !== ctl.current) return;
      out.answer.engineNote = engineLabel(settings);
      setRes({ status: "done", d: out.answer, articles: out.articles });
      if (!opts.followUp) { setArticles({ loading: false, list: out.articles, term: out.answer.title }); setCondition(out.answer.kind === "disease" ? out.answer.title : ""); }
    } catch (e) {
      if (my !== ctl.current) return;
      setRes({ status: "error", msg: e.code === "cancelled" ? "Search stopped. Run it again whenever you like." : e.message || "The search didn't finish. Try again.", code: e.code });
      setArticles(a => ({ ...a, loading: false }));
    }
  }
  const go = text => { const h = indexHit(text); search(h ? h.term : text, h ? h.kind : "auto"); };
  const home = () => { ctl.current?.abort(); setRun(null); setRes({ status: "idle" }); setQ(""); setCondition(""); };

  const sugg = focus ? (str(q) ? suggestions(q) : (settings.recent || []).slice(0, 6).map(x => ({ term: x, recent: true }))) : [];
  const d = res.d;
  const isSaved = d && saved.some(x => x.id === savedId(d));
  const tabs = [["answer", "Answer"], ["src", "Sources" + (articles.list.length ? " · " + articles.list.length : "")], ...(condition ? [["care", "Best Care"]] : [])];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={home} accessibilityRole="link" accessibilityLabel="MedQuery home" style={{ flex: 1 }}>
          <Text style={{ fontSize: run ? 26 : 38, fontWeight: "900", color: t.ink, letterSpacing: -1 }}>Med<Text style={{ color: t.accent }}>Query</Text></Text>
        </Pressable>
        {engineReady(settings) ? <Text style={[s.small, { color: t.muted }]}>AI: {engineLabel(settings)}</Text> : <Chip title="⚠ Set up AI" onPress={onOpenMore} />}
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Input style={{ flex: 1, fontSize: 17 }} value={q} onChangeText={setQ} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 200)}
            placeholder="Disease, test, medicine or question" returnKeyType="search" onSubmitEditing={() => go(q)} accessibilityLabel="Search MedQuery" autoCorrect={false} clearButtonMode="while-editing" />
          <Btn title="Search" onPress={() => go(q)} />
        </View>
        {sugg.length ? <Card style={{ gap: 0, paddingVertical: 2 }}>
          {sugg.map(x => (
            <Pressable key={x.term} onPress={() => (x.recent ? go(x.term) : search(x.term, x.kind))} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 9, opacity: pressed ? 0.6 : 1, flexDirection: "row", gap: 10, alignItems: "center" })}>
              <Text style={{ fontSize: 20, width: 26, textAlign: "center" }}>{x.recent ? "↺" : SYS_ICON[x.sys] || "•"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>{x.term}</Text>
                <Text numberOfLines={1} style={[s.small, { color: t.muted }]}>{x.recent ? "Recent search" : KIND_LABEL[x.kind] + (x.note ? " · " + x.note : "")}</Text>
              </View>
            </Pressable>))}
        </Card> : null}
      </View>

      {!run ? <>
        <P muted>Search a disease, test or medicine, or ask any health question. Every answer lists the real articles behind it, and the best hospitals for a condition near you.</P>
        <H>Try</H>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>{EXAMPLES.map(x => <Chip key={x} title={x} onPress={() => go(x)} />)}</View>
      </> : null}

      {run ? <>
        <Segmented items={tabs} value={tabs.some(x => x[0] === tab) ? tab : "answer"} onChange={setTab} />
        {tab === "answer" ? <>
          {res.status === "loading" ? <Card><H>Searching</H><Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>{run.q}</Text><Loading text={res.msg} /><Btn small kind="ghost" title="Stop" onPress={() => ctl.current?.abort()} style={{ alignSelf: "flex-start" }} /></Card> : null}
          {res.status === "error" ? <Card><H>No answer</H><P>{res.msg}</P>
            {res.code === "no_engine" || res.code === "bad_key" ? <Btn title="Open settings" onPress={onOpenMore} /> : <Btn kind="ghost" title="Try again" onPress={() => search(run.q, run.mode, { detail: run.detail, followUp: run.followUp, keepSide: true })} />}</Card> : null}
          {res.status === "done" ? <AnswerView d={d} detail={!!run.detail} settings={settings} onSettings={onSettings}
            onToggleDetail={() => search(run.followUp ? run.followUp.title : run.q, run.mode, { detail: !run.detail, keepSide: true })}
            onSearch={(x, k) => search(x, k || "auto")} onFollowUp={x => search(x, "auto", { followUp: { title: d.title, summary: d.summary }, keepSide: true })}
            saved={isSaved} onSave={() => onToggleSave(d, articles.list, run.detail)}
            onShare={async () => { const how = await shareAnswer(d, articles.list); if (how === "copied") onToast("Answer copied. Paste it anywhere to share."); }} /> : null}
        </> : null}
        {tab === "src" ? <SourcesCard articles={articles.list} loading={articles.loading} term={articles.term} onRetry={() => loadArticles(articles.term, d?.kind)} /> : null}
        {tab === "care" && condition ? <BestCareCard key={condition} condition={condition} settings={settings} onSettings={onSettings} onCall={onCall} onLocated={onLocated} /> : null}
        {res.status === "done" && tab === "answer" ? <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn small kind="ghost" style={{ flex: 1 }} title={"📚 Sources" + (articles.list.length ? " (" + articles.list.length + ")" : "")} onPress={() => { setTab("src"); scrollTop?.(); }} />
          {condition ? <Btn small kind="ghost" style={{ flex: 1 }} title="🏥 Best Care" onPress={() => { setTab("care"); scrollTop?.(); }} /> : null}
        </View> : null}
      </> : null}
    </View>
  );
}
