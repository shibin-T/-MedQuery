// Small shared UI pieces
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTheme, IMP_LABEL } from "../theme";

export const str = v => (v == null ? "" : String(v)).trim();
export const arr = v => (Array.isArray(v) ? v : []);
export const has = a => arr(a).some(x => (typeof x === "string" ? str(x) : x));

export function Card({ children, style, accent }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.card, borderColor: accent || t.rule }, accent && { borderLeftWidth: 4 }, style]}>{children}</View>;
}

// A titled answer block with the neon importance colour code. Tap the heading to fold it
// away, which keeps long answers compact on a phone.
export function Section({ title, level = "info", children, defaultOpen = true }) {
  const t = useTheme(); const c = t[level] || t.info;
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <View style={[s.card, s.section, { backgroundColor: t.card, borderColor: c, shadowColor: c }]}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title + ", " + IMP_LABEL[level] + (open ? ", tap to fold" : ", tap to open")} style={s.secHead} hitSlop={6}>
        <View style={[s.dot, { backgroundColor: c }]} />
        <Text style={[s.h3, { color: t.ink }]} accessibilityRole="header">{title}</Text>
        <Text style={[s.impTag, { color: c, borderColor: c }]}>{IMP_LABEL[level]}</Text>
        <Text style={{ color: t.muted, fontSize: 14, width: 14, textAlign: "center" }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

// iOS-style segmented switch (e.g. Answer | Sources | Best Care)
export function Segmented({ items, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.accentSoft, borderRadius: 12, padding: 3, gap: 3 }} accessibilityRole="tablist">
      {items.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center", backgroundColor: on ? t.card : "transparent", shadowColor: "#000", shadowOpacity: on ? 0.12 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: on ? 1 : 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: on ? "800" : "600", color: on ? t.ink : t.muted }}>{label}</Text>
          </Pressable>);
      })}
    </View>
  );
}

// Copies text (e.g. a phone number) and says so for two seconds
export function CopyBtn({ text, label = "Copy" }) {
  const [done, setDone] = React.useState(false);
  return <Btn small kind="ghost" title={done ? "Copied ✓" : label} accessibilityLabel={label + " " + text}
    onPress={async () => { try { await Clipboard.setStringAsync(String(text)); setDone(true); setTimeout(() => setDone(false), 2000); } catch {} }} />;
}

export function P({ children, muted, style, selectable = true }) {
  const t = useTheme();
  return <Text selectable={selectable} style={[s.p, { color: muted ? t.muted : t.ink }, style]}>{children}</Text>;
}
export function H({ children, style }) {
  const t = useTheme();
  return <Text style={[s.h4, { color: t.muted }, style]} accessibilityRole="header">{children}</Text>;
}

export function Bullets({ items }) {
  const t = useTheme();
  const list = arr(items).map(str).filter(Boolean);
  if (!list.length) return null;
  return <View style={{ gap: 4 }}>{list.map((x, i) => (
    <View key={i} style={s.bullet}><Text style={[s.p, { color: t.accent }]}>•</Text><Text selectable style={[s.p, { color: t.ink, flex: 1 }]}>{x}</Text></View>
  ))}</View>;
}

// A compact two-column "table" that reads well on phones
export function Rows({ rows }) {
  const t = useTheme();
  return <View style={{ gap: 6 }}>{rows.map((r, i) => (
    <View key={i} style={[s.row, { borderColor: t.rule }]}>
      <Text selectable style={[s.p, { color: t.ink, fontWeight: "700" }]}>{r[0]}</Text>
      {r.slice(1).filter(x => x !== "" && x != null).map((c, j) => typeof c === "string" || typeof c === "number"
        ? <Text key={j} selectable style={[s.small, { color: j === 0 ? t.ink : t.muted }]}>{c}</Text> : <View key={j}>{c}</View>)}
    </View>
  ))}</View>;
}

export function Btn({ title, onPress, kind = "primary", icon, disabled, style, small, accessibilityLabel, color }) {
  const t = useTheme();
  const bg = kind === "primary" ? (color || t.ink) : kind === "danger" ? t.warn : "transparent";
  const fg = kind === "ghost" ? (color || t.ink) : t.paper;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, borderColor: kind === "ghost" ? t.rule : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{icon ? icon + " " : ""}{title}</Text>
    </Pressable>
  );
}

export function Chip({ title, onPress, active }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.chip, { borderColor: active ? t.accent : t.rule, backgroundColor: active ? t.accentSoft : "transparent", opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: t.ink, fontSize: 13 }}>{title}</Text>
    </Pressable>
  );
}

export function Input(props) {
  const t = useTheme();
  return <TextInput placeholderTextColor={t.muted} {...props} style={[s.input, { color: t.ink, borderColor: t.rule, backgroundColor: t.paper }, props.style]} />;
}

export function Loading({ text }) {
  const t = useTheme();
  return <View style={s.loading}><ActivityIndicator color={t.accent} /><Text style={[s.small, { color: t.muted, flex: 1 }]}>{text}</Text></View>;
}

export function Tag({ text, color }) {
  const t = useTheme();
  return <Text style={[s.tag, { color: color || t.muted, borderColor: color || t.rule }]}>{text}</Text>;
}

export const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  section: { borderWidth: 1.5, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  secHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  h3: { fontSize: 17, fontWeight: "700", flex: 1 },
  h4: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", fontWeight: "600" },
  impTag: { fontSize: 10, fontWeight: "700", borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, textTransform: "uppercase", overflow: "hidden" },
  p: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 19 },
  bullet: { flexDirection: "row", gap: 8 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 6, gap: 2 },
  btn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center", minHeight: 44 },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, minHeight: 36 },
  btnText: { fontSize: 15, fontWeight: "700" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  input: { minWidth: 0, flexShrink: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 44 },
  loading: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8 },
  tag: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, alignSelf: "flex-start", overflow: "hidden" }
});
