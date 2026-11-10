// "Best Care for {condition}": hospitals near the user ranked for the condition,
// with directions and phone numbers. With no condition it lists the nearest
// hospitals with 24-hour emergency care ("Care near you").
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Linking, Pressable, Platform } from "react-native";
import * as Location from "expo-location";
import { useTheme } from "../theme";
import { Card, H, P, Btn, Input, Chip, Loading, s, str } from "./ui";
import { findBestCare, specialtyFor, bestCarePrompt, MAP_APPS, fmtKm } from "../core";
import { askJSON, engineReady } from "../ai";
import { langNote } from "../lang";

export default function BestCareCard({ condition, settings, onSettings, onCall, onLocated }) {
  const t = useTheme();
  const general = !str(condition);
  const [text, setText] = useState(settings.location || "");
  const [state, setState] = useState({ status: "idle" });
  const ctl = useRef(null);
  const spec = specialtyFor(condition || "");

  async function find(where) {
    ctl.current?.abort(); const my = ctl.current = new AbortController();
    setState({ status: "loading", msg: general ? "Finding hospitals with 24-hour emergency care…" : "Finding the best hospitals for " + condition + "…" });
    try {
      const r = await findBestCare(where, general ? "" : condition, { signal: my.signal, limit: 15 });
      if (my.signal.aborted) return;
      if (!r.origin) { setState({ status: "error", msg: "Couldn't find that place. Try adding the city or country." }); return; }
      onLocated?.(r);
      let places = general ? [...r.places].sort((a, b) => (b.er - a.er) || (b.isHospital - a.isHospital) || a.km - b.km) : r.places, note = "", aiRanked = false;
      // Claude re-ranks the REAL candidates for this condition (it cannot add places or numbers)
      if (!general && places.length > 1 && settings.engine === "claude" && engineReady(settings)) {
        setState({ status: "loading", msg: "Comparing " + places.length + " hospitals for " + condition + "…" });
        try {
          const res = await askJSON(settings, bestCarePrompt(condition, r.specialty, r.origin.label, places) + langNote(settings.lang), { signal: my.signal, effort: "low", maxTokens: 3000 });
          const picks = (res?.picks || []).map(x => ({ i: (+x.n) - 1, why: str(x.why) })).filter(x => places[x.i]);
          if (picks.length) { const used = new Set(picks.map(x => x.i)); places = [...picks.map(x => ({ ...places[x.i], aiWhy: x.why })), ...places.filter((_, i) => !used.has(i))]; note = str(res?.note); aiRanked = true; }
        } catch (e) { if (my.signal.aborted) return; }
      }
      setState({ status: "done", r, places: places.slice(0, 8), note, aiRanked, where });
    } catch (e) {
      if (my.signal.aborted) return;
      setState({ status: "error", msg: "Couldn't reach the map service right now. Check your connection and try again.", where });
    }
  }
  useEffect(() => { if (settings.location) find({ text: settings.location }); return () => ctl.current?.abort(); }, [condition]);

  const submit = () => { const v = str(text); if (!v) return; if (v !== settings.location) onSettings({ ...settings, location: v }); find({ text: v }); };
  const gps = async () => {
    setState({ status: "loading", msg: "Asking for your location…" });
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") { setState({ status: "error", msg: "Location permission was not given. Type your area instead." }); return; }
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 600000 })) || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      find({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch { setState({ status: "error", msg: "Couldn't get your location. Type your area instead." }); }
  };
  const app = MAP_APPS[settings.mapApp] || MAP_APPS.google;
  const mapsSearch = where => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((general ? "hospital emergency" : condition + " hospital") + " near " + (where?.text || (where?.lat != null ? where.lat.toFixed(4) + "," + where.lon.toFixed(4) : "")));

  return (
    <Card accent={t.accent}>
      <Text style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", color: t.muted }} accessibilityRole="header">
        {general ? "Care near you" : "Best Care for "}{general ? "" : <Text style={{ color: t.accent }}>{condition}</Text>}
      </Text>
      {!general ? <P style={{ fontSize: 14 }}>Specialty: <Text style={{ fontWeight: "700" }}>{spec.name}</Text></P> : null}
      <P muted style={{ fontSize: 13 }}>{general ? "Your location shows the nearest hospitals with 24-hour emergency care." : "Enter your location to see the hospitals best suited to treating " + condition + ", with directions and phone numbers."}</P>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Input style={{ flex: 1 }} value={text} onChangeText={setText} placeholder="Your city or area, e.g. Edappally, Kochi" onSubmitEditing={submit} returnKeyType="search" accessibilityLabel="Your location" autoComplete="postal-address-locality" />
        <Btn title="Find" onPress={submit} />
      </View>
      <Btn kind="ghost" small title="📍 Use my current location" onPress={gps} style={{ alignSelf: "flex-start" }} />
      {state.status === "loading" ? <Loading text={state.msg} /> : null}
      {state.status === "error" ? <><P muted style={{ fontSize: 13 }}>{state.msg}</P><Pressable onPress={() => Linking.openURL(mapsSearch(state.where))}><Text style={{ color: t.accent }}>Search on Google Maps ↗</Text></Pressable></> : null}
      {state.status === "done" ? <>
        <P muted style={{ fontSize: 13 }}>{state.r.origin.label ? "Near " + state.r.origin.label + ". " : ""}{general ? "Nearest first, 24-hour emergency first." : "Ranked for " + state.r.specialty.name.toLowerCase() + "."}</P>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Text style={[s.small, { color: t.muted }]}>Directions in</Text>
          {Object.entries(MAP_APPS).filter(([k]) => k !== "apple" || Platform.OS !== "android").map(([k, v]) => <Chip key={k} title={v.label} active={(settings.mapApp || "google") === k} onPress={() => onSettings({ ...settings, mapApp: k })} />)}
        </View>
        {!state.places.length ? <P muted>No hospitals are mapped near there in OpenStreetMap. Try a nearby town.</P> : null}
        {state.places.map((p, i) => (
          <View key={p.id || p.name} style={[s.card, { borderColor: t.rule, backgroundColor: t.paper, gap: 6 }]}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: t.accentInk, fontWeight: "800", fontSize: 12 }}>{i + 1}</Text></View>
              <Text style={{ flex: 1, color: t.ink, fontWeight: "800", fontSize: 16 }}>{p.name}</Text>
              {p.km != null ? <Text style={[s.small, { color: t.muted, fontWeight: "700" }]}>{fmtKm(p.km)}</Text> : null}
            </View>
            {(p.aiWhy || p.why?.length) ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {p.aiWhy ? <Text style={[s.small, { color: t.ink, borderWidth: 1, borderStyle: "dashed", borderColor: t.accent, borderRadius: 10, paddingHorizontal: 8 }]}>{p.aiWhy}</Text> : null}
              {(p.why || []).slice(0, 3).map(w => <Text key={w} style={[s.small, { color: t.ink, backgroundColor: t.accentSoft, borderRadius: 10, paddingHorizontal: 8, overflow: "hidden" }]}>{w}</Text>)}
            </View> : null}
            <Text style={[s.small, { color: t.ink }]}>{p.address || "Address not listed. Use Directions to find it."}</Text>
            {p.phone ? <Text style={[s.small, { color: t.ink }]}><Text style={{ color: t.muted }}>{p.er ? "Emergency / main line: " : "Phone: "}</Text><Text style={{ fontWeight: "700" }} selectable>{p.phone}</Text></Text>
              : <Text style={[s.small, { color: t.muted }]}>No phone number in the map data. Check the hospital's listing in your map app.</Text>}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Btn small title="➤ Directions" onPress={() => Linking.openURL(app.url(p, state.r.origin))} accessibilityLabel={"Directions to " + p.name + " in " + app.label} />
              {p.phone ? <Btn small kind="danger" title="✆ Call" onPress={() => onCall({ name: p.name, number: p.phone })} accessibilityLabel={"Call " + p.name} /> : null}
              {p.website && /^https?:\/\//.test(p.website) ? <Btn small kind="ghost" title="Website ↗" onPress={() => Linking.openURL(p.website)} /> : null}
            </View>
          </View>))}
        <P muted style={{ fontSize: 12 }}>{(state.note ? state.note + " " : "") + (state.aiRanked ? "Claude chose the order from live OpenStreetMap hospitals; " : general ? "Live OpenStreetMap data; " : "Ordered by matching specialty, hospital size, teaching status, 24-hour emergency care and distance, from live OpenStreetMap data; ") + "this is not an official quality rating. Call before you travel. Distances are straight-line."}</P>
        <Pressable onPress={() => Linking.openURL(mapsSearch(state.where))} accessibilityRole="link"><Text style={{ color: t.accent }}>See more on Google Maps ↗</Text></Pressable>
      </> : null}
    </Card>
  );
}
