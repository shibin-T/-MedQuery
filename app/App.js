// MedQuery: a smart search engine for medical questions (iPhone, Android and web)
// Five tabs fit everything onto a phone: Search · Scan · Care · Saved · More
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, ToastAndroid } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./src/theme";
import CallDialog from "./src/components/CallDialog";
import SearchScreen from "./src/screens/SearchScreen";
import ScanScreen from "./src/screens/ScanScreen";
import CareScreen from "./src/screens/CareScreen";
import SavedScreen from "./src/screens/SavedScreen";
import MoreScreen from "./src/screens/MoreScreen";
import { loadSettings, saveSettings } from "./src/storage";
import { loadSaved, writeSaved, savedId } from "./src/saved";
import { emergencyFor } from "./src/core";
import { placeCall, callEmergency } from "./src/phone";
import { defaultCurrency } from "./src/currency";

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}

const TABS = [["search", "Search", "🔍"], ["scan", "Scan", "📄"], ["care", "Care", "🏥"], ["saved", "Saved", "★"], ["more", "More", "⋯"]];

function Main() {
  const t = useTheme(); const ins = useSafeAreaInsets();
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState("search");
  const [saved, setSaved] = useState([]);
  const [countryCode, setCountryCode] = useState("");
  const [call, setCall] = useState(null);
  const [request, setRequest] = useState(null); // a search asked for from another tab
  const [toast, setToast] = useState("");
  const scrolls = useRef({});

  useEffect(() => {
    loadSettings().then(st => setSettings({ ...st, currency: st.currency || defaultCurrency() }));
    loadSaved().then(setSaved);
  }, []);
  if (!settings) return <View style={{ flex: 1, backgroundColor: t.paper }} />;

  // accepts a new settings object or an updater function
  const updateSettings = next => setSettings(prev => { const st = typeof next === "function" ? next(prev) : next; saveSettings(st); return st; });
  const em = emergencyFor(settings.location, countryCode) || ["your area", "112", "112"];
  const onLocated = r => r?.countryCode && setCountryCode(r.countryCode);
  const showToast = msg => { if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT); else { setToast(msg); setTimeout(() => setToast(""), 2500); } };
  const searchFromElsewhere = (q, mode) => { setRequest({ q, mode, n: Date.now() }); setTab("search"); };
  const toggleSave = (d, articles, detail) => {
    const id = savedId(d);
    const next = saved.some(x => x.id === id) ? saved.filter(x => x.id !== id) : [{ id, d, articles, detail: !!detail, savedAt: Date.now() }, ...saved];
    setSaved(next); writeSaved(next);
    showToast(next.length > saved.length ? "Saved for offline reading" : "Removed from saved");
  };
  async function doCall(c, remember) {
    setCall(null);
    if (remember) updateSettings(st => ({ ...st, callOk: true }));
    try { const how = await placeCall(c.number); if (how === "dialed") showToast("Calling " + (c.name || c.number) + "…"); } catch { showToast("Couldn't start the call. Dial " + c.number + " yourself."); }
  }
  const requestCall = c => (settings.callOk ? doCall(c, false) : setCall(c));
  const common = { settings, onSettings: updateSettings, onCall: requestCall, onLocated };
  const page = (key, children) => (
    <ScrollView key={key} ref={r => (scrolls.current[key] = r)} style={{ display: tab === key ? "flex" : "none" }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: ins.top + 12, paddingBottom: 96, paddingHorizontal: 16, gap: 14, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      {children}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.paper }}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {page("search", <SearchScreen {...common} request={request} saved={saved} onToggleSave={toggleSave} onOpenMore={() => setTab("more")} onToast={showToast} scrollTop={() => scrolls.current.search?.scrollTo?.({ y: 0, animated: true })} />)}
        {page("scan", <ScanScreen {...common} onOpenMore={() => setTab("more")} onSearch={searchFromElsewhere} />)}
        {page("care", <CareScreen {...common} em={em} />)}
        {page("saved", <SavedScreen saved={saved} onRemove={id => { const n = saved.filter(x => x.id !== id); setSaved(n); writeSaved(n); }} recent={settings.recent || []} onClearRecent={() => updateSettings(st => ({ ...st, recent: [] }))} onSearch={searchFromElsewhere} settings={settings} onSettings={updateSettings} />)}
        {page("more", <MoreScreen settings={settings} onSave={st => { updateSettings(st); showToast("Settings saved"); }} />)}
      </KeyboardAvoidingView>

      {/* Emergency: one tap opens the phone app with the local number (hidden on the Care tab, which has a big one) */}
      {tab !== "care" ? <Pressable onPress={() => callEmergency(em[1])} accessibilityRole="button" accessibilityLabel={"Call emergency services, " + em[1]}
        style={({ pressed }) => ({ position: "absolute", right: 14, bottom: 64 + ins.bottom + 12, backgroundColor: t.critical, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 })}>
        <Text style={{ color: "#fff", fontSize: 16 }}>✆</Text>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>SOS {em[1]}</Text>
      </Pressable> : null}

      {toast ? <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: 64 + ins.bottom + 64, alignItems: "center" }}>
        <Text style={{ backgroundColor: t.ink, color: t.paper, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, overflow: "hidden", fontWeight: "600" }} accessibilityLiveRegion="polite">{toast}</Text>
      </View> : null}

      {/* Bottom tab bar */}
      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.rule, backgroundColor: t.card, paddingBottom: ins.bottom, height: 60 + ins.bottom }}>
        {TABS.map(([k, label, icon]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => { if (on) scrolls.current[k]?.scrollTo?.({ y: 0, animated: true }); setTab(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Text style={{ fontSize: 20, color: on ? t.accent : t.muted, opacity: on ? 1 : 0.75 }}>{icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: on ? "800" : "600", color: on ? t.accent : t.muted }}>{label}</Text>
              {k === "saved" && saved.length ? <View style={{ position: "absolute", top: 6, right: "28%", backgroundColor: t.accent, borderRadius: 8, minWidth: 16, paddingHorizontal: 4 }}><Text style={{ color: t.accentInk, fontSize: 10, fontWeight: "800", textAlign: "center" }}>{saved.length}</Text></View> : null}
            </Pressable>);
        })}
      </View>

      <CallDialog call={call} onCancel={() => setCall(null)} onConfirm={remember => doCall(call, remember)} />
    </View>
  );
}
