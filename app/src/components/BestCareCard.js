// "Best Care for {condition}": hospitals near the user ranked for the condition
import React from "react";
import { Text } from "react-native";
import { useTheme } from "../theme";
import { Card, P } from "./ui";
import { specialtyFor } from "../core";
import { useCare } from "../useCare";
import LocationBar from "./LocationBar";
import PlaceList from "./PlaceList";

export default function BestCareCard({ condition, settings, onSettings, onCall, onLocated }) {
  const t = useTheme();
  const care = useCare({ condition, settings, onLocated });
  return (
    <Card accent={t.accent}>
      <Text style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", color: t.muted }} accessibilityRole="header">
        Best Care for <Text style={{ color: t.accent }}>{condition}</Text>
      </Text>
      <P style={{ fontSize: 14 }}>Specialty: <Text style={{ fontWeight: "700" }}>{specialtyFor(condition).name}</Text></P>
      <P muted style={{ fontSize: 13 }}>Enter your location to see the hospitals best suited to treating {condition}, with directions and phone numbers.</P>
      <LocationBar settings={settings} onSettings={onSettings} onFind={care.find} onGps={care.gps} />
      <PlaceList state={care.state} general={false} condition={condition} settings={settings} onSettings={onSettings} onCall={onCall} />
    </Card>
  );
}
