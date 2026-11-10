// MedQuery: a smart search engine for medical questions (iOS, Android and web)
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, ToastAndroid, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, KIND_LABEL } from "./src/theme";
import { Card, H, P, Btn, Input, Chip, Loading, s, str } from "./src/components/ui";
import AnswerView from "./src/components/AnswerView";
import SourcesCard from "./src/components/SourcesCard";
import BestCareCard from "./src/components/BestCareCard";
import CallDialog from "./src/components/CallDialog";
import ReportScanner from "./src/components/ReportScanner";
import SettingsModal from "./src/components/SettingsModal";
import { loadSettings, saveSettings, DEFAULTS } from "./src/storage";
import { runSearch, suggestions, indexHit } from "./src/search";
import { engineReady, engineLabel } from "./src/ai";
import { emergencyFor, findArticles } from "./src/core";
import { placeCall, callEmergency } from "./src/phone";
import { defaultCurrency } from "./src/currency";

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}

const ERRORS = {
  no_engine: "Set up an AI engine in Settings to get answers. Articles and hospitals still work without one.",
  cancelled: "Search stopped. Run it again whenever you like."
};

function Main() {
  const t = useTheme(); const ins = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState("home"); // home | answer | report
  const [run, setRun] = useState(null);      // { q, mode, detail, followUp }
  const [res, setRes] = useState({ status: "idle" });
  const [articles, setArticles] = useState({ loading: false, list: [], term: "" });
  const [condition, setCondition] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [call, setCall] = useState(null);
  const ctl = useRef(null); const scroll = useRef(null);

  useEffect(() => { loadSettings().then(st => setSettings({ ...st, currency: st.currency || defaultCurrency() })); }, []);
  if (!settings) return <View style={{ flex: 1, backgroundColor: t.paper }} />;

  const updateSettings = st => { setSettings(st); saveSettings(st); };
  const em = emergencyFor(settings.location, countryCode) || ["your area", "112", "112"];

  async function search(text, mode = "auto", opts = {}) {
    text = str(text); if (!text) return;
    const r = { q: text, mode, detail: !!opts.detail, followUp: opts.followUp || null };
    setRun(r); setView("answer"); setFocus(false); setQ(opts.followUp ? q : text);
    if (!opts.detail && !opts.followUp) updateSettings({ ...settings, recent: [text, ...settings.recent.filter(x => x.toLowerCase() !== text.toLowerCase())].slice(0, 8) });
    scroll.current?.scrollTo?.({ y: 0, animated: true });
    ctl.current?.abort(); const my = ctl.current = new AbortController();
    if (!opts.keepSide) { setArticles({ loading: true, list: [], term: indexHit(text)?.term.split(" (")[0] || text }); setCondition(""); }
    if (!engineReady(settings)) {
      // No AI: still show the trusted articles and the hospital finder
      const hit = indexHit(text);
      setRes({ status: "error", msg: ERRORS.no_engine });
      if (hit?.kind === "disease") setCondition(hit.term.split(" (")[0]);
      findArticles(hit ? hit.term : text, hit?.kind || "disease").then(list => setArticles({ loading: false, list, term: text })).catch(() => setArticles({ loading: false, list: [], term: text }));
      return;
    }
    setRes({ status: "loading", msg: "Understanding your search…" });
    try {
      const out = await runSearch({ ...r, settings, signal: my.signal, onStatus: msg => { if (my === ctl.current) setRes({ status: "loading", msg }); } });
      if (my !== ctl.current) return;
      out.answer.engineNote = engineLabel(settings);
      setRes({ status: "done", d: out.answer });
      if (!opts.followUp) { setArticles({ loading: false, list: out.articles, term: out.answer.title }); setCondition(out.answer.kind === "disease" ? out.answer.title : ""); }
    } catch (e) {
      if (my !== ctl.current) return;
      setRes({ status: "error", msg: ERRORS[e.code] || e.message || "The search didn't finish. Try again.", code: e.code });
      setArticles(a => ({ ...a, loading: false }));
    }
  }

  async function doCall(c, remember) {
    setCall(null);
    if (remember) updateSettings({ ...settings, callOk: true });
    try { const how = await placeCall(c.number); if (how === "dialed" && Platform.OS === "android") ToastAndroid.show("Calling " + (c.name || c.number) + "…", ToastAndroid.SHORT); } catch {}
  }
  const requestCall = c => (settings.callOk ? doCall(c, false) : setCall(c));

  const sugg = focus ? (str(q) ? suggestions(q) : settings.recent.map(x => ({ term: x, recent: true }))) : [];
  const side = view === "answer" ? <>
    <SourcesCard articles={articles.list} loading={articles.loading} term={articles.term} onRetry={() => { setArticles(a => ({ ...a, loading: true })); findArticles(articles.term, res.d?.kind || "disease").then(list => setArticles({ loading: false, list, term: articles.term })).catch(() => setArticles(a => ({ ...a, loading: false }))); }} />
    {condition ? <BestCareCard key={"best-" + condition} condition={condition} settings={settings} onSettings={updateSettings} onCall={requestCall} onLocated={r => setCountryCode(r.countryCode)} /> : null}
  </> : view === "report" && condition ? <BestCareCard key={"best-" + condition} condition={condition} settings={settings} onSettings={updateSettings} onCall={requestCall} onLocated={r => setCountryCode(r.countryCode)} /> : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.paper }}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: ins.top + 12, paddingBottom: ins.bottom + 100, paddingHorizontal: 16, gap: 14, maxWidth: 1200, width: "100%", alignSelf: "center" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable onPress={() => { ctl.current?.abort(); setView("home"); setRes({ status: "idle" }); setQ(""); setCondition(""); }} accessibilityRole="link" accessibilityLabel="MedQuery home" style={{ flex: 1 }}>
              <Text style={{ fontSize: view === "home" ? 40 : 28, fontWeight: "900", color: t.ink, letterSpacing: -1 }}>Med<Text style={{ color: t.accent }}>Query</Text></Text>
            </Pressable>
            <Btn small kind="ghost" title="⚙︎ Settings" onPress={() => setShowSettings(true)} />
          </View>
          {view === "home" ? <P muted>Search a disease, test or medicine, or ask any health question. Answers come with the real articles behind them.</P> : null}

          {/* Search */}
          <View style={{ gap: 6, zIndex: 5 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Input style={{ flex: 1, fontSize: 17 }} value={q} onChangeText={setQ} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 200)}
                placeholder="Search a disease, test, medicine, or ask a question" returnKeyType="search" onSubmitEditing={() => { const h = indexHit(q); search(h ? h.term : q, h ? h.kind : "auto"); }}
                accessibilityLabel="Search MedQuery" autoCorrect={false} />
              <Btn title="Search" onPress={() => { const h = indexHit(q); search(h ? h.term : q, h ? h.kind : "auto"); }} />
            </View>
            {sugg.length ? <Card style={{ gap: 0, paddingVertical: 4 }}>
              {sugg.map(x => (
                <Pressable key={x.term} onPress={() => x.recent ? search(x.term) : search(x.term, x.kind)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 10, opacity: pressed ? 0.6 : 1, flexDirection: "row", gap: 8, alignItems: "center" })}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.recent ? t.muted : t[x.kind] || t.accent }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>{x.term}</Text>
                    {x.note ? <Text style={[s.small, { color: t.muted }]}>{KIND_LABEL[x.kind]} · {x.note}</Text> : x.recent ? <Text style={[s.small, { color: t.muted }]}>Recent search</Text> : null}
                  </View>
                </Pressable>))}
            </Card> : null}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip title="📄 Scan a lab report" active={view === "report"} onPress={() => { ctl.current?.abort(); setView("report"); setCondition(""); }} />
              {!engineReady(settings) ? <Chip title="⚠ Set up the AI engine" onPress={() => setShowSettings(true)} /> : <Text style={[s.small, { color: t.muted, alignSelf: "center" }]}>AI: {engineLabel(settings)}</Text>}
            </View>
          </View>

          {/* Body */}
          {view === "home" ? <>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {["Dengue fever", "Hemoglobin A1c (HbA1c)", "Metformin", "Asthma", "Is paracetamol safe in pregnancy?"].map(x => <Chip key={x} title={x} onPress={() => { const h = indexHit(x); search(h ? h.term : x, h ? h.kind : "auto"); }} />)}
            </View>
            <BestCareCard key="care-near" condition="" settings={settings} onSettings={updateSettings} onCall={requestCall} onLocated={r => setCountryCode(r.countryCode)} />
          </> : null}

          {view !== "home" ? (
            <View style={{ flexDirection: wide ? "row" : "column", gap: 14, alignItems: "flex-start" }}>
              <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", gap: 14 }}>
                {view === "report" ? <ReportScanner settings={settings} onOpenSettings={() => setShowSettings(true)} onSearch={(x, k) => search(x, k)}
                  onDiagnosis={dx => { setCondition(dx); if (dx) { setArticles({ loading: true, list: [], term: dx }); findArticles(dx, "disease").then(list => setArticles({ loading: false, list, term: dx })).catch(() => setArticles({ loading: false, list: [], term: dx })); } }} /> : null}
                {view === "report" && condition ? <SourcesCard articles={articles.list} loading={articles.loading} term={articles.term} /> : null}
                {view === "answer" && res.status === "loading" ? <Card><H>Searching</H><Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>{run?.followUp ? run.q : run?.q}</Text><Loading text={res.msg} /><Btn small kind="ghost" title="Stop" onPress={() => ctl.current?.abort()} style={{ alignSelf: "flex-start" }} /></Card> : null}
                {view === "answer" && res.status === "error" ? <Card><H>No answer</H><P>{res.msg}</P>
                  <View style={{ flexDirection: "row", gap: 8 }}>{res.code === "no_engine" || res.code === "bad_key" ? <Btn title="Open settings" onPress={() => setShowSettings(true)} /> : <Btn kind="ghost" title="Try again" onPress={() => search(run.q, run.mode, { detail: run.detail, followUp: run.followUp, keepSide: true })} />}</View></Card> : null}
                {view === "answer" && res.status === "done" ? <AnswerView d={res.d} detail={!!run?.detail} settings={settings} onSettings={updateSettings}
                  onToggleDetail={() => search(run.followUp ? run.followUp.title : run.q, run.mode, { detail: !run.detail, keepSide: true })}
                  onSearch={(x, k) => search(x, k || "auto")} onFollowUp={x => search(x, "auto", { followUp: { title: res.d.title, summary: res.d.summary }, keepSide: true })} /> : null}
              </View>
              {side ? <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", gap: 14 }}>{side}</View> : null}
            </View>) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Emergency: one tap opens the phone app with the local emergency number */}
      <Pressable onPress={() => callEmergency(em[1])} accessibilityRole="button" accessibilityLabel={"Call emergency services, " + em[1]}
        style={({ pressed }) => ({ position: "absolute", right: 16, bottom: ins.bottom + 16, backgroundColor: t.critical, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.85 : 1, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 })}>
        <Text style={{ color: "#fff", fontSize: 20 }}>✆</Text>
        <View><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Emergency {em[1]}</Text><Text style={{ color: "#fff", fontSize: 11 }}>{em[2] !== em[1] ? "Ambulance " + em[2] : "Tap to call"}</Text></View>
      </Pressable>

      <CallDialog call={call} onCancel={() => setCall(null)} onConfirm={remember => doCall(call, remember)} />
      <SettingsModal visible={showSettings} settings={settings} onClose={() => setShowSettings(false)} onSave={st => { updateSettings(st); setShowSettings(false); }} />
    </View>
  );
}
