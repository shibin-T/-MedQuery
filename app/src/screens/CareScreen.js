// Care tab: emergency numbers and the nearest hospitals with 24-hour care
import React from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../theme";
import { Card, H, P, CopyBtn } from "../components/ui";
import { useCare } from "../useCare";
import LocationBar from "../components/LocationBar";
import PlaceList from "../components/PlaceList";
import { callEmergency } from "../phone";

export default function CareScreen({ settings, onSettings, onCall, em, onLocated }) {
  const t = useTheme();
  const care = useCare({ condition: "", settings, onLocated });
  const [country, general, amb] = em;
  return (
    <View style={{ gap: 14 }}>
      <Card accent={t.critical}>
        <H>Emergency · {country}</H>
        <Pressable onPress={() => callEmergency(general)} accessibilityRole="button" accessibilityLabel={"Call emergency services " + general}
          style={({ pressed }) => ({ backgroundColor: t.critical, borderRadius: 14, padding: 16, flexDirection: "row", gap: 12, alignItems: "center", opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ color: "#fff", fontSize: 30 }}>✆</Text>
          <View style={{ flex: 1 }}><Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Call {general}</Text><Text style={{ color: "#fff" }}>Police, fire and medical emergencies</Text></View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {amb && amb !== general ? <Pressable onPress={() => callEmergency(amb)} accessibilityRole="button" accessibilityLabel={"Call ambulance " + amb} style={{ borderWidth: 1.5, borderColor: t.critical, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ color: t.critical, fontWeight: "800" }}>🚑 Ambulance {amb}</Text></Pressable> : null}
          <CopyBtn text={general} label="Copy number" />
        </View>
        <P muted style={{ fontSize: 12 }}>{country === "your area" ? "Enter your area below to show the right number for your country. " : ""}Emergency calls open your phone app straight away, without asking first.</P>
      </Card>
      <Card>
        <H>Hospitals near you</H>
        <P muted style={{ fontSize: 13 }}>Nearest hospitals and clinics, with 24-hour emergency care marked in red. Search a condition to see the best hospitals for it.</P>
        <LocationBar settings={settings} onSettings={onSettings} onFind={care.find} onGps={care.gps} />
        <PlaceList state={care.state} general settings={settings} onSettings={onSettings} onCall={onCall} max={12} />
      </Card>
    </View>
  );
}
