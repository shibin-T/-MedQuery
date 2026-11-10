// "Verify at the source": the real articles behind the answer, each opening the article itself
import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useTheme } from "../theme";
import { Card, H, P, Tag, Loading, Btn, s } from "./ui";

export default function SourcesCard({ articles, loading, onRetry, term }) {
  const t = useTheme();
  const aiOnly = articles?.length && articles.every(a => a.unverified);
  return (
    <Card>
      <H>Verify at the source</H>
      {loading ? <Loading text={"Finding articles on “" + term + "”…"} />
        : !articles?.length ? <><P muted style={{ fontSize: 13 }}>Couldn't reach the free article libraries (MedlinePlus, NCBI Bookshelf, PubMed Central, Cochrane) right now.</P>{onRetry ? <Btn small kind="ghost" title="Try again" onPress={onRetry} /> : null}</>
        : <>
          <P muted style={{ fontSize: 13 }}>{aiOnly ? "The article libraries couldn't be reached, so these are articles the AI cited. Each link goes to a trusted publisher; check it matches the topic." : "Read the articles behind this answer, free, from trusted public and peer-reviewed sources."}</P>
          {articles.map((a, i) => (
            <Pressable key={a.url} onPress={() => Linking.openURL(a.url)} accessibilityRole="link" accessibilityLabel={a.title + ", " + (a.type || "article") + ", " + a.publisher}
              style={({ pressed }) => [{ gap: 3, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: t.rule, opacity: pressed ? 0.6 : 1 }]}>
              <Tag text={a.unverified ? "AI-cited" : a.type || "Article"} color={a.unverified ? t.warn : undefined} />
              <Text style={{ color: t.accent, fontSize: 15, fontWeight: "700" }}>{a.title} ↗</Text>
              {a.authors ? <Text style={[s.small, { color: t.muted }]}>{a.authors}</Text> : null}
              <Text style={[s.small, { color: t.muted }]}>{[a.publisher, a.journal && a.journal !== a.publisher ? a.journal : "", a.year].filter(Boolean).join(" · ")}</Text>
            </Pressable>))}
        </>}
    </Card>
  );
}
