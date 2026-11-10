// Saved tab: answers saved for offline reading, and recent searches
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme, KIND_LABEL } from "../theme";
import { Card, H, P, Btn, Tag, s } from "../components/ui";
import AnswerView from "../components/AnswerView";
import SourcesCard from "../components/SourcesCard";

export default function SavedScreen({ saved, onRemove, recent, onClearRecent, onSearch, settings, onSettings }) {
  const t = useTheme();
  const [open, setOpen] = useState(null);
  const item = open && saved.find(x => x.id === open);
  if (item) return (
    <View style={{ gap: 14 }}>
      <Btn small kind="ghost" title="‹ Back to saved" onPress={() => setOpen(null)} style={{ alignSelf: "flex-start" }} />
      <P muted style={{ fontSize: 12 }}>Saved {new Date(item.savedAt).toLocaleDateString()}. Readable offline. Search again for the latest version.</P>
      <AnswerView d={item.d} detail={item.detail} settings={settings} onSettings={onSettings} onToggleDetail={() => onSearch(item.d.title, item.d.kind)} onSearch={onSearch} onFollowUp={q => onSearch(q)} />
      <SourcesCard articles={item.articles || []} term={item.d.title} />
    </View>);
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <H>Saved answers</H>
        {!saved.length ? <P muted style={{ fontSize: 13 }}>Tap ☆ Save on any answer to keep it here. Saved answers work without internet.</P> : saved.map(x => (
          <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderColor: t.rule }}>
            <Pressable onPress={() => setOpen(x.id)} style={{ flex: 1, gap: 2 }} accessibilityRole="button" accessibilityLabel={"Open saved answer " + x.d.title}>
              <Tag text={KIND_LABEL[x.d.kind] || "Answer"} color={t[x.d.kind]} />
              <Text style={{ color: t.ink, fontWeight: "700", fontSize: 16 }}>{x.d.title}</Text>
              <Text numberOfLines={2} style={[s.small, { color: t.muted }]}>{x.d.summary}</Text>
            </Pressable>
            <Btn small kind="ghost" title="✕" accessibilityLabel={"Remove " + x.d.title} onPress={() => onRemove(x.id)} />
          </View>))}
      </Card>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center" }}><H style={{ flex: 1 }}>Recent searches</H>{recent.length ? <Btn small kind="ghost" title="Clear" onPress={onClearRecent} /> : null}</View>
        {!recent.length ? <P muted style={{ fontSize: 13 }}>Your searches stay on this device only.</P> : recent.map(q => (
          <Pressable key={q} onPress={() => onSearch(q)} accessibilityRole="button" style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: t.rule }}><Text style={{ color: t.ink, fontSize: 15 }}>↺ {q}</Text></Pressable>))}
      </Card>
    </View>
  );
}
