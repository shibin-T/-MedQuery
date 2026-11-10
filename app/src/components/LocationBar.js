// Location input + "use my current location"
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, Input, str } from "./ui";

export default function LocationBar({ settings, onSettings, onFind, onGps }) {
  const [text, setText] = useState(settings.location || "");
  const submit = () => { const v = str(text); if (!v) return; if (v !== settings.location) onSettings({ ...settings, location: v }); onFind({ text: v }); };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Input style={{ flex: 1 }} value={text} onChangeText={setText} placeholder="Your city or area, e.g. Edappally, Kochi" onSubmitEditing={submit} returnKeyType="search" accessibilityLabel="Your location" />
        <Btn title="Find" onPress={submit} />
      </View>
      <Btn kind="ghost" small title="📍 Use my current location" onPress={onGps} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}
