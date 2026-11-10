// Scan a lab report: a photo or a PDF goes to the AI, which pulls out each result,
// skips personal details and explains what each value means.
import React, { useRef, useState } from "react";
import { View, Text, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useTheme } from "../theme";
import { Card, Section, H, P, Btn, Bullets, Loading, Tag, Input, s, str, arr, has } from "./ui";
import { askJSON, engineReady } from "../ai";
import { reportPrompt } from "../core";
import { langNote } from "../lang";

const STATUS = { critical_low: ["Very low", "critical"], critical_high: ["Very high", "critical"], low: ["Low", "high"], high: ["High", "high"], borderline_low: ["Slightly low", "medium"], borderline_high: ["Slightly high", "medium"], normal: ["Normal", "ok"], unknown: ["No range", "info"] };
const ORDER = { critical_low: 0, critical_high: 0, low: 1, high: 1, borderline_low: 2, borderline_high: 2, unknown: 3, normal: 4 };

async function readBase64(asset) {
  if (asset.base64) return asset.base64.replace(/^data:[^,]+,/, "");
  if (Platform.OS === "web") { const r = await fetch(asset.uri); const b = await r.blob(); return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(b); }); }
  return await new File(asset.uri).base64();
}

export default function ReportScanner({ settings, onOpenSettings, onDiagnosis, onSearch }) {
  const t = useTheme();
  const [st, setSt] = useState({ status: "idle" });
  const [paste, setPaste] = useState(null); // null = hidden, string = text being pasted
  const ctl = useRef(null);

  async function analyse(attachment, text = "") {
    ctl.current?.abort(); const my = ctl.current = new AbortController();
    setSt({ status: "loading" });
    try {
      const d = await askJSON(settings, reportPrompt(text, langNote(settings.lang)), { attachments: attachment ? [attachment] : [], signal: my.signal, maxTokens: 12000, effort: "medium" });
      if (!d || d.readable === false) { setSt({ status: "error", msg: str(d?.reason) || "This doesn't look like a readable lab report. Try a sharper photo of the printed report." }); return; }
      setSt({ status: "done", d });
      const dx = arr(d.possibleDiagnoses).filter(x => str(x?.name));
      onDiagnosis?.(dx.length ? str(dx[0].name) : "", d);
    } catch (e) { if (e.code !== "cancelled") setSt({ status: "error", msg: e.message || "Couldn't read the report." }); }
  }
  const pickImage = async camera => {
    if (camera) { const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) { setSt({ status: "error", msg: "Camera permission was not given." }); return; } }
    const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ["images"], base64: true, quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    analyse({ kind: "image", mediaType: a.mimeType && /image\/(jpeg|png|webp|gif)/.test(a.mimeType) ? a.mimeType : "image/jpeg", base64: await readBase64(a) });
  };
  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, base64: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0], mt = a.mimeType || (/\.pdf$/i.test(a.name) ? "application/pdf" : "image/jpeg");
    const b64 = await readBase64(a);
    analyse(mt === "application/pdf" ? { kind: "pdf", base64: b64 } : { kind: "image", mediaType: mt, base64: b64 });
  };

  if (!engineReady(settings)) return <Card><H>Scan a lab report</H><P>Reading reports needs an AI engine. Add your Claude API key in Settings.</P><Btn title="Open settings" onPress={onOpenSettings} /></Card>;
  const d = st.d;
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H>Scan a lab report</H>
        <P muted style={{ fontSize: 13 }}>Use a clear photo of the printed report, or the PDF from your lab. Only the test values are used; names, IDs and other personal details are skipped. Nothing is saved.</P>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {Platform.OS !== "web" ? <Btn small icon="📷" title="Take a photo" onPress={() => pickImage(true)} /> : null}
          <Btn small kind="ghost" icon="🖼" title="Choose a photo" onPress={() => pickImage(false)} />
          <Btn small kind="ghost" icon="📄" title="Choose a PDF" onPress={pickPdf} />
          <Btn small kind="ghost" icon="⌨" title="Paste text" onPress={() => setPaste(paste == null ? "" : null)} />
        </View>
        {paste != null ? <>
          <Input value={paste} onChangeText={setPaste} multiline placeholder="Paste the results from your lab's message or app" style={{ minHeight: 110, textAlignVertical: "top" }} accessibilityLabel="Report text" />
          <Btn small title="Explain these results" disabled={str(paste).length < 10} onPress={() => analyse(null, paste)} style={{ alignSelf: "flex-start" }} />
        </> : null}
      </Card>
      {st.status === "loading" ? <Card><Loading text="Reading your report…" /><Btn small kind="ghost" title="Stop" onPress={() => ctl.current?.abort()} /></Card> : null}
      {st.status === "error" ? <Card><P>{st.msg}</P></Card> : null}
      {st.status === "done" ? <>
        <Card accent={t.test}><Tag text={str(d.reportType) || "Lab report"} color={t.test} /><P>{str(d.summary)}</P></Card>
        {str(d.urgent) ? <Section title="Get medical help now if" level="critical"><P>{str(d.urgent)}</P></Section> : null}
        <Section title="Your results" level="high">
          {[...arr(d.results)].filter(x => str(x?.test)).sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3)).map((x, i) => {
            const [label, lvl] = STATUS[x.status] || STATUS.unknown;
            return (
              <View key={i} style={[s.card, { borderColor: t[lvl], backgroundColor: t.paper, gap: 4 }]}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Text style={{ flex: 1, color: t.ink, fontWeight: "800", fontSize: 15 }}>{str(x.test)}</Text>
                  <Tag text={label} color={t[lvl]} />
                </View>
                <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>{str(x.value)} <Text style={{ fontSize: 13, color: t.muted }}>{str(x.unit)}</Text></Text>
                {str(x.range) ? <Text style={[s.small, { color: t.muted }]}>Normal: {str(x.range)}{x.rangeSource === "standard" ? " (standard range)" : ""}</Text> : null}
                {str(x.meaning) ? <P style={{ fontSize: 14 }}>{str(x.meaning)}</P> : null}
                {str(x.inference) ? <P muted style={{ fontSize: 13 }}>{str(x.inference)}</P> : null}
                {x.readCertain === false ? <P muted style={{ fontSize: 12 }}>This value was hard to read. Check it on your report.</P> : null}
              </View>);
          })}
        </Section>
        {has(d.patterns) ? <Section title="Patterns across results" level="medium"><Bullets items={d.patterns} /></Section> : null}
        <Section title="What these results could point to" level="high">
          {arr(d.possibleDiagnoses).filter(x => str(x?.name)).map((x, i) => (
            <View key={i} style={{ gap: 4 }}>
              <P style={{ fontWeight: "700" }}>{str(x.name)} <Text style={{ color: t.muted, fontWeight: "400" }}>· {str(x.likelihood)}</Text></P>
              {str(x.why) ? <P style={{ fontSize: 14 }}>{str(x.why)}</P> : null}
              {str(x.confirm) ? <P muted style={{ fontSize: 13 }}>To confirm: {str(x.confirm)}</P> : null}
              <Btn small kind="ghost" title={"Learn about " + str(x.name) + " →"} onPress={() => onSearch(str(x.name), "disease")} style={{ alignSelf: "flex-start" }} />
            </View>))}
          <P muted style={{ fontSize: 13 }}>These are possibilities based on the numbers alone, not a diagnosis. Only a doctor who knows your history can diagnose.</P>
        </Section>
        {has(d.nextSteps) ? <Section title="Next steps" level="info"><Bullets items={d.nextSteps} /></Section> : null}
        <Section title="Limits of this reading" level="high"><P>{str(d.caveat) || "A single report gives a snapshot; results can vary with timing, hydration, medicines and the lab's methods."}{str(d.confidence) ? " Reading confidence: " + str(d.confidence) + "." : ""}</P></Section>
      </> : null}
    </View>
  );
}
