// Asks permission before MedQuery calls a hospital ("don't ask again" remembers the choice)
import React, { useState } from "react";
import { Modal, View, Text, Switch, Platform } from "react-native";
import { useTheme } from "../theme";
import { Btn, P, s } from "./ui";

export default function CallDialog({ call, onCancel, onConfirm }) {
  const t = useTheme();
  const [remember, setRemember] = useState(false);
  if (!call) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }}>
        <View style={[s.card, { backgroundColor: t.card, borderColor: t.ink, gap: 14, maxWidth: 480, width: "100%", alignSelf: "center" }]} accessibilityViewIsModal>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink }} accessibilityRole="header">Call {call.name || call.number}?</Text>
          <P>{Platform.OS === "android"
            ? "MedQuery will dial " + call.number + " for you. The first time, Android asks you to allow MedQuery to make calls; if you don't, your phone app opens with the number ready."
            : "MedQuery will open your phone app to call " + call.number + "."} Normal call charges apply.</P>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Switch value={remember} onValueChange={setRemember} accessibilityLabel="Don't ask again on this device" />
            <Text style={{ color: t.ink, flex: 1 }}>Don't ask again on this device</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="ghost" title="Cancel" onPress={onCancel} />
            <Btn kind="danger" title="✆ Call now" onPress={() => onConfirm(remember)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
