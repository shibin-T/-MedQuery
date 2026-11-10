// Settings: AI engine, answer language, currency, calling permission
import React, { useState } from "react";
import { View, Text, Switch, Linking, Pressable } from "react-native";
import { useTheme } from "../theme";
import { Card, H, P, Btn, Chip, Input, s, str } from "./ui";
import { LANGS } from "../lang";
import { FX } from "../currency";
import { ollamaModels, CLAUDE_MODEL } from "../ai";

// Shown on the "More" tab. Changes apply when you tap Save.
export default function SettingsPanel({ settings, onSave }) {
  const t = useTheme();
  const [d, setD] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [olStatus, setOlStatus] = useState(""); const [olList, setOlList] = useState([]);
  React.useEffect(() => { setD(settings); }, [settings]);
  const set = patch => { setSaved(false); setD({ ...d, ...patch }); };
  const check = async () => { setOlStatus("Connecting…"); try { const m = await ollamaModels(d.ollamaUrl); setOlList(m); setOlStatus(m.length ? "Connected. Pick a model." : "Connected, but no models yet. On that computer run: ollama pull qwen3:8b"); } catch { setOlStatus("Couldn't reach Ollama. It must be running with OLLAMA_HOST=0.0.0.0 and OLLAMA_ORIGINS=* on a computer on the same Wi-Fi."); } };
  return (
    <View style={{ gap: 14 }}>

        <Card>
          <H>AI engine</H>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Chip title="Claude (best answers)" active={d.engine === "claude"} onPress={() => set({ engine: "claude" })} />
            <Chip title="Ollama on my computer (free)" active={d.engine === "ollama"} onPress={() => set({ engine: "ollama" })} />
          </View>
          {d.engine === "claude" ? <>
            <P muted style={{ fontSize: 13 }}>MedQuery uses {CLAUDE_MODEL} through the Anthropic API with your own API key. The key is kept in this device's secure storage and sent only to Anthropic.</P>
            <Input value={d.apiKey} onChangeText={v => set({ apiKey: v.trim() })} placeholder="sk-ant-…" secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="Claude API key" />
            <Pressable onPress={() => Linking.openURL("https://platform.claude.com/settings/keys")} accessibilityRole="link"><Text style={{ color: t.accent }}>Get an API key ↗</Text></Pressable>
          </> : <>
            <P muted style={{ fontSize: 13 }}>Runs open models free on a computer on your Wi-Fi. Install Ollama from ollama.com, run "ollama pull qwen3:8b", and start it with OLLAMA_HOST=0.0.0.0 and OLLAMA_ORIGINS=* so this device can reach it. Answers are less reliable than Claude's and PDFs can't be read.</P>
            <Input value={d.ollamaUrl} onChangeText={v => set({ ollamaUrl: v.trim() })} placeholder="http://192.168.1.10:11434" autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="Ollama address" />
            <Input value={d.ollamaModel} onChangeText={v => set({ ollamaModel: v.trim() })} placeholder="qwen3:8b" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Ollama model" />
            <Btn small kind="ghost" title="Check connection" onPress={check} style={{ alignSelf: "flex-start" }} />
            {olStatus ? <P muted style={{ fontSize: 13 }}>{olStatus}</P> : null}
            {olList.length ? <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>{olList.map(m => <Chip key={m} title={m} active={d.ollamaModel === m} onPress={() => set({ ollamaModel: m })} />)}</View> : null}
          </>}
        </Card>

        <Card>
          <H>Answer language</H>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>{LANGS.map(([code, en, native]) => <Chip key={code} title={native === en ? en : native + " · " + en} active={d.lang === code} onPress={() => set({ lang: code })} />)}</View>
        </Card>

        <Card>
          <H>Show treatment costs in</H>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>{Object.keys(FX).map(c => <Chip key={c} title={c} active={d.currency === c} onPress={() => set({ currency: c })} />)}</View>
        </Card>

        <Card>
          <H>Calling hospitals</H>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Switch value={!d.callOk} onValueChange={v => set({ callOk: !v })} accessibilityLabel="Ask before calling" />
            <Text style={{ flex: 1, color: t.ink }}>Ask me before MedQuery calls a hospital</Text>
          </View>
          <P muted style={{ fontSize: 13 }}>Emergency numbers always open your phone app straight away.</P>
        </Card>

        <Card>
          <H>Your area</H>
          <Input value={d.location} onChangeText={v => set({ location: v })} placeholder="e.g. Edappally, Kochi" accessibilityLabel="Your area" />
          <P muted style={{ fontSize: 13 }}>Used for hospitals and your emergency number. Saved on this device only.</P>
        </Card>

        <Btn title={saved ? "Saved ✓" : "Save settings"} onPress={() => { onSave({ ...d, apiKey: str(d.apiKey) }); setSaved(true); }} />
    </View>
  );
}
