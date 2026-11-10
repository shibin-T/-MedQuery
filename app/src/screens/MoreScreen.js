// More tab: settings, about MedQuery, privacy and the medical disclaimer
import React from "react";
import { View, Text, Linking, Pressable } from "react-native";
import { useTheme } from "../theme";
import { Card, H, P, Bullets } from "../components/ui";
import SettingsPanel from "../components/SettingsPanel";
import { TRUSTED_PUBLISHERS } from "../core";

export default function MoreScreen({ settings, onSave }) {
  const t = useTheme();
  const pubs = [...new Map(TRUSTED_PUBLISHERS.map(p => [p.name, p])).values()];
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink }} accessibilityRole="header">Settings</Text>
      <SettingsPanel settings={settings} onSave={onSave} />
      <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink, marginTop: 8 }} accessibilityRole="header">About MedQuery</Text>
      <Card>
        <P>MedQuery is a search engine for medical questions: diseases, tests and their normal values, medicines and how they are taken, and any health question.</P>
        <Bullets items={[
          "Search: quick answers by default, a detailed version on request, colour-coded by importance.",
          "Sources: every answer lists the real articles behind it, with direct links.",
          "Best Care: hospitals near you ranked for the condition you searched, with directions and phone numbers.",
          "Scan: photograph or upload a lab report to have each value explained.",
          "Care: your emergency number and the nearest hospitals, any time.",
          "Saved: keep answers for reading offline."
        ]} />
      </Card>
      <Card>
        <H>Where answers come from</H>
        <P muted style={{ fontSize: 13 }}>Articles are fetched live from free, trusted publishers:</P>
        <Bullets items={pubs.map(p => p.name + " (" + p.owner + ")")} />
        <P muted style={{ fontSize: 13 }}>Hospitals and maps come from OpenStreetMap (© OpenStreetMap contributors). Rankings are a guide, not an official quality rating.</P>
      </Card>
      <Card>
        <H>Privacy</H>
        <Bullets items={[
          "Settings, saved answers and recent searches stay on this device.",
          "Your Claude API key is kept in the device's secure storage and sent only to Anthropic.",
          "Searches go to your chosen AI engine and to the public article and map services above.",
          "Lab reports are sent only to your AI engine; personal details are not used or kept."
        ]} />
      </Card>
      <Card accent={t.critical}>
        <H>Medical disclaimer</H>
        <P>MedQuery gives general health information for learning and reference. It is not medical advice and does not diagnose. Answers can be incomplete or wrong. Always talk to a qualified doctor, and never delay or ignore medical advice because of something you read here. In an emergency, call your local emergency number.</P>
      </Card>
      <Pressable onPress={() => Linking.openURL("https://github.com/shibin-T/-MedQuery")} accessibilityRole="link"><Text style={{ color: t.accent, textAlign: "center" }}>MedQuery is open source (MIT) ↗</Text></Pressable>
    </View>
  );
}
