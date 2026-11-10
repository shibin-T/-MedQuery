// Scan tab: lab report scanner; for the most likely condition, its articles and the best hospitals
import React, { useState } from "react";
import { View } from "react-native";
import ReportScanner from "../components/ReportScanner";
import SourcesCard from "../components/SourcesCard";
import BestCareCard from "../components/BestCareCard";
import { Segmented } from "../components/ui";
import { findArticles } from "../core";

export default function ScanScreen({ settings, onSettings, onCall, onOpenMore, onSearch, onLocated }) {
  const [dx, setDx] = useState("");
  const [arts, setArts] = useState({ loading: false, list: [] });
  const [tab, setTab] = useState("report");
  const onDiagnosis = name => {
    setDx(name); setTab("report");
    if (!name) return;
    setArts({ loading: true, list: [] });
    findArticles(name, "disease").then(list => setArts({ loading: false, list })).catch(() => setArts({ loading: false, list: [] }));
  };
  return (
    <View style={{ gap: 14 }}>
      {dx ? <Segmented items={[["report", "Report"], ["src", "Sources"], ["care", "Best Care"]]} value={tab} onChange={setTab} /> : null}
      <View style={{ display: tab === "report" ? "flex" : "none" }}>
        <ReportScanner settings={settings} onOpenSettings={onOpenMore} onSearch={onSearch} onDiagnosis={onDiagnosis} />
      </View>
      {dx && tab === "src" ? <SourcesCard articles={arts.list} loading={arts.loading} term={dx} /> : null}
      {dx && tab === "care" ? <BestCareCard key={dx} condition={dx} settings={settings} onSettings={onSettings} onCall={onCall} onLocated={onLocated} /> : null}
    </View>
  );
}
