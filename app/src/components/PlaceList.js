// Hospital results: sort, list or map, directions, call (with permission), copy, website
import React, { useState } from "react";
import { View, Text, Linking, Pressable, Platform, ScrollView } from "react-native";
import { useTheme } from "../theme";
import { P, Btn, Chip, Segmented, CopyBtn, Loading, s } from "./ui";
import { MAP_APPS, fmtKm } from "../core";
import HospitalMap from "./HospitalMap";

const SORTS = {
  best: ["Best match", (a, b) => a.rank - b.rank],
  near: ["Nearest", (a, b) => a.km - b.km],
  er: ["24-hour first", (a, b) => (b.er - a.er) || a.km - b.km],
  gov: ["Government", (a, b) => (b.gov - a.gov) || a.km - b.km],
  priv: ["Private", (a, b) => (b.priv - a.priv) || a.km - b.km],
  beds: ["Largest", (a, b) => (b.beds - a.beds) || a.km - b.km],
  phone: ["Has phone", (a, b) => (!!b.phone - !!a.phone) || a.km - b.km]
};

export default function PlaceList({ state, general, condition, settings, onSettings, onCall, max = 8 }) {
  const t = useTheme();
  const [sort, setSort] = useState(general ? "near" : "best");
  const [view, setView] = useState("list");
  if (state.status === "loading") return <Loading text={state.msg} />;
  const mapsSearch = where => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((general ? "hospital emergency" : condition + " hospital") + " near " + (where?.text || (where?.lat != null ? where.lat.toFixed(4) + "," + where.lon.toFixed(4) : "")));
  if (state.status === "error") return <><P muted style={{ fontSize: 13 }}>{state.msg}</P><Pressable onPress={() => Linking.openURL(mapsSearch(state.where))} accessibilityRole="link"><Text style={{ color: t.accent }}>Search on Google Maps ↗</Text></Pressable></>;
  if (state.status !== "done") return null;
  const { r } = state;
  // numbers follow the order shown, on the list and the map
  const places = [...state.places].sort((SORTS[sort] || SORTS.best)[1]).slice(0, max).map((p, i) => ({ ...p, rank: i + 1 }));
  const app = MAP_APPS[settings.mapApp] || MAP_APPS.google;
  return (
    <View style={{ gap: 10 }}>
      <P muted style={{ fontSize: 13 }}>{r.origin.label ? "Near " + r.origin.label + ". " : ""}{general ? "" : "Ranked for " + r.specialty.name.toLowerCase() + "."}</P>
      {!state.places.length ? <P muted>No hospitals are mapped near there in OpenStreetMap. Try a nearby town.</P> : <>
        <Segmented items={[["list", "List"], ["map", "Map"]]} value={view} onChange={setView} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {Object.entries(SORTS).filter(([k]) => !(general && k === "best")).map(([k, [label]]) => <Chip key={k} title={label} active={sort === k} onPress={() => setSort(k)} />)}
        </ScrollView>
        {view === "map" ? <HospitalMap origin={r.origin} places={places} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
          <Text style={[s.small, { color: t.muted }]}>Directions in</Text>
          {Object.entries(MAP_APPS).filter(([k]) => k !== "apple" || Platform.OS !== "android").map(([k, v]) => <Chip key={k} title={v.label} active={(settings.mapApp || "google") === k} onPress={() => onSettings({ ...settings, mapApp: k })} />)}
        </ScrollView>
        {places.map(p => (
          <View key={p.id || p.name} style={[s.card, { borderColor: t.rule, backgroundColor: t.paper, gap: 6, padding: 12 }]}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: p.er ? t.critical : t.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{p.rank}</Text></View>
              <Text style={{ flex: 1, color: t.ink, fontWeight: "800", fontSize: 16 }}>{p.name}</Text>
              {p.km != null ? <Text style={[s.small, { color: t.muted, fontWeight: "700" }]}>{fmtKm(p.km)}</Text> : null}
            </View>
            {(p.aiWhy || p.why?.length) ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {p.aiWhy ? <Text style={[s.small, { color: t.ink, borderWidth: 1, borderStyle: "dashed", borderColor: t.accent, borderRadius: 10, paddingHorizontal: 8 }]}>{p.aiWhy}</Text> : null}
              {(p.why || []).slice(0, 3).map(w => <Text key={w} style={[s.small, { color: t.ink, backgroundColor: t.accentSoft, borderRadius: 10, paddingHorizontal: 8, overflow: "hidden" }]}>{w}</Text>)}
            </View> : null}
            {p.address ? <Text style={[s.small, { color: t.ink }]}>{p.address}</Text> : null}
            {p.phone ? <Text style={[s.small, { color: t.ink }]}><Text style={{ color: t.muted }}>{p.er ? "Emergency / main line: " : "Phone: "}</Text><Text style={{ fontWeight: "700" }} selectable>{p.phone}</Text></Text>
              : <Text style={[s.small, { color: t.muted }]}>No phone number in the map data.</Text>}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Btn small title="➤ Directions" onPress={() => Linking.openURL(app.url(p, r.origin))} accessibilityLabel={"Directions to " + p.name + " in " + app.label} />
              {p.phone ? <Btn small kind="danger" title="✆ Call" onPress={() => onCall({ name: p.name, number: p.phone })} accessibilityLabel={"Call " + p.name} /> : null}
              {p.phone ? <CopyBtn text={p.phone} label="Copy number" /> : null}
              {p.website && /^https?:\/\//.test(p.website) ? <Btn small kind="ghost" title="Website ↗" onPress={() => Linking.openURL(p.website)} /> : null}
            </View>
          </View>))}
      </>}
      <P muted style={{ fontSize: 12 }}>{(state.note ? state.note + " " : "") + (state.aiRanked ? "Claude chose the order from live OpenStreetMap hospitals; " : general ? "Live OpenStreetMap data; " : "Ordered by matching specialty, hospital size, teaching status, 24-hour emergency care and distance, from live OpenStreetMap data; ") + "this is not an official quality rating. Call before you travel. Distances are straight-line."}</P>
      <Pressable onPress={() => Linking.openURL(mapsSearch(state.where))} accessibilityRole="link"><Text style={{ color: t.accent }}>See more on Google Maps ↗</Text></Pressable>
    </View>
  );
}
