// The answer, as colour-coded cards (same structure as the website)
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme, KIND_LABEL, IMP_LABEL, importance } from "../theme";
import { Section, P, H, Bullets, Rows, Btn, Chip, Input, Card, Tag, str, arr, has, s } from "./ui";
import { FX, costText } from "../currency";
import { personalRanges, defineWord } from "../search";

export default function AnswerView({ d, detail, settings, onSettings, onToggleDetail, onSearch, onFollowUp, onShare, onSave, saved }) {
  const t = useTheme();
  const kindColor = t[d.kind] || t.accent;
  // On a phone, long answers start folded: the first sections and anything critical stay open
  let n = 0;
  const sec = (title, children, key) => { const lvl = importance(title); const open = !detail || lvl === "critical" || n < 2; n++; return <Section key={key || title} title={title} level={lvl} defaultOpen={open}>{children}</Section>; };
  const conf = str(d.confidence).toLowerCase();
  const body = [];
  if (d.kind === "disease") diseaseSections(d, sec, body, onSearch, settings, onSettings);
  else if (d.kind === "test") testSections(d, sec, body, settings);
  else if (d.kind === "drug") drugSections(d, sec, body);
  else {
    if (str(d.answer)) body.push(sec("Answer", str(d.answer).split(/\n{2,}/).map((x, i) => <P key={i}>{x}</P>)));
    if (has(d.points)) body.push(sec("Key points", <Bullets items={d.points} />));
  }
  for (const [i, x] of arr(d.details).entries()) if (str(x?.heading) && (str(x.body) || has(x.bullets))) body.push(sec(str(x.heading), <>{str(x.body) ? <P>{str(x.body)}</P> : null}{has(x.bullets) ? <Bullets items={x.bullets} /> : null}</>, "d" + i));

  return (
    <View style={{ gap: 12 }}>
      <Card accent={str(d.urgent) ? t.critical : kindColor}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Tag text={KIND_LABEL[d.kind] || "Answer"} color={kindColor} />
          <Tag text={detail ? "Detailed" : "Quick answer"} />
          {d.engineNote ? <Tag text={d.engineNote} /> : null}
        </View>
        <Text style={{ fontSize: 26, fontWeight: "800", color: t.ink }} accessibilityRole="header" selectable>{str(d.title) || "Answer"}</Text>
        {has(d.aka) ? <P muted>Also called: {arr(d.aka).map(str).join(", ")}</P> : null}
        <P>{str(d.summary)}</P>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onShare ? <Btn small kind="ghost" title="↗ Share" onPress={onShare} /> : null}
          {onSave ? <Btn small kind="ghost" title={saved ? "★ Saved" : "☆ Save"} onPress={onSave} accessibilityLabel={saved ? "Remove from saved" : "Save for offline reading"} /> : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Text style={[s.small, { color: t.muted }]}>Importance</Text>
          {["critical", "high", "medium", "info"].map(l => <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t[l] }} /><Text style={[s.small, { color: t.ink }]}>{IMP_LABEL[l]}</Text></View>)}
        </View>
      </Card>
      {str(d.urgent) ? <Section title="Get medical help now if" level="critical"><P>{str(d.urgent)}</P></Section> : null}
      {(str(d.uncertainty) || conf === "low" || conf === "moderate" || d.needsResearch) ? (
        <Section title={conf === "low" ? "Evidence is limited" : "Some uncertainty"} level="high">
          <P>{str(d.uncertainty) || "Parts of this answer rest on limited or mixed evidence."}{d.needsResearch ? " More research is needed before firm conclusions can be drawn." : ""}</P>
        </Section>) : null}
      {body}
      <Btn kind={detail ? "ghost" : "primary"} title={detail ? "Back to the quick answer" : "Show the detailed version"} onPress={onToggleDetail} />
      <WordLookup settings={settings} topic={str(d.title)} />
      <FollowUp d={d} onSearch={onSearch} onFollowUp={onFollowUp} />
      <P muted style={{ fontSize: 13 }}>General information, not a diagnosis. In an emergency call your local emergency number.</P>
    </View>
  );
}

function diseaseSections(d, sec, body, onSearch, settings, onSettings) {
  if (str(d.definition)) body.push(sec("Definition", <P>{str(d.definition)}</P>));
  const sy = d.symptoms || {};
  if (has(sy.common) || has(sy.uncommon)) body.push(sec("Symptoms", <><H>Common</H><Bullets items={sy.common} />{has(sy.uncommon) ? <><H>Less common</H><Bullets items={sy.uncommon} /></> : null}</>));
  if (has(d.causes)) body.push(sec("Causes", <Bullets items={d.causes} />));
  const tests = arr(d.tests).filter(x => str(x?.name));
  if (tests.length) body.push(sec("Screening & tests to confirm", <Rows rows={tests.map(x => [str(x.name), str(x.why), <Btn small kind="ghost" title={"Learn about " + str(x.name)} onPress={() => onSearch(str(x.name), "test")} />])} />));
  const hr = d.homeRemedies || {};
  const items = arr(hr.items).filter(x => str(x?.name));
  if (hr.applicable && items.length) body.push(sec("Safe home remedies", <>
    <P muted>{str(hr.note) || "These ease symptoms only. They do not replace treatment. See a doctor if symptoms get worse or last more than a few days."}</P>
    {items.map((x, i) => { const al = arr(x.allergens).map(str).filter(Boolean); return (
      <Card key={i}><P style={{ fontWeight: "700" }}>{str(x.name)}</P><P>{str(x.how)}</P>
        {al.length ? <Allergen text={"Allergen warning: contains " + al.join(", ") + ". Skip this if you are allergic or unsure."} /> : <P muted style={{ fontSize: 13 }}>No common food allergens</P>}</Card>); })}
  </>));
  else if (hr.applicable === false) body.push(sec("Home remedies", <P muted>{str(hr.note) || "This condition needs medical treatment. Home remedies are not a safe substitute."}</P>));
  if (has(d.prevention)) body.push(sec("Prevention", <Bullets items={d.prevention} />));
  const tr = arr(d.treatments).filter(x => str(x?.option));
  if (tr.length) body.push(<Treatments key="tr" tr={tr} settings={settings} onSettings={onSettings} />);
}
function Allergen({ text }) { const t = useTheme(); return <Text style={[s.small, { color: t.warn, backgroundColor: t.warnSoft, padding: 8, borderRadius: 8, overflow: "hidden" }]}>⚠ {text}</Text>; }

function Treatments({ tr, settings, onSettings }) {
  const cur = settings.currency || "USD";
  const codes = Object.keys(FX);
  return (
    <Section title="Treatment options & cost" level="high">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <P muted style={{ fontSize: 13 }}>Costs in</P>
        <Btn small kind="ghost" title={cur + " ▾"} accessibilityLabel={"Currency " + cur + ". Change"} onPress={() => onSettings({ ...settings, currency: codes[(codes.indexOf(cur) + 1) % codes.length] })} />
      </View>
      <Rows rows={tr.map(x => [str(x.option), str(x.route) ? "How it's given: " + str(x.route) : "", "Approx. cost: " + costText(x, cur) + (str(x.unit) ? " " + str(x.unit) : ""), str(x.note)])} />
      <P muted style={{ fontSize: 13 }}>Rough estimates only. INR figures are typical Indian prices; other currencies are converted from typical US prices. Real costs vary a lot by country, hospital and insurance.</P>
    </Section>
  );
}

function testSections(d, sec, body, settings) {
  if (str(d.purpose)) body.push(sec("What it checks", <P>{str(d.purpose)}</P>));
  const comps = arr(d.components).filter(c => str(c?.name));
  if (comps.length) body.push(<Components key="comp" d={d} comps={comps} settings={settings} />);
  if (has(d.highLow)) body.push(sec("What abnormal results can mean", <Rows rows={arr(d.highLow).map(x => [str(x.finding), str(x.meaning)])} />));
  if (str(d.specimen) || str(d.preparation)) body.push(sec("Before the test", <Bullets items={[str(d.specimen) && "Sample: " + str(d.specimen), str(d.preparation) && "Preparation: " + str(d.preparation)]} />));
}
function Components({ d, comps, settings }) {
  const t = useTheme();
  const factors = arr(d.factors).map(str).filter(Boolean).slice(0, 4);
  const [vals, setVals] = useState({});
  const [mine, setMine] = useState(null);
  const [status, setStatus] = useState("");
  const go = async () => {
    const who = Object.entries(vals).filter(([, v]) => str(v)).map(([f, v]) => f + ": " + v).join(", ");
    if (!who) { setStatus("Fill in at least one field."); return; }
    setStatus("Looking up your ranges…");
    try { setMine(await personalRanges(settings, d, who)); setStatus("Shown above. Your lab's printed range takes priority."); }
    catch (e) { setStatus(e.message || "Couldn't get your ranges. Try again."); }
  };
  const choices = f => /sex|gender/i.test(f) ? ["female", "male"] : /pregnan/i.test(f) ? ["not pregnant", "1st trimester", "2nd trimester", "3rd trimester"] : /fast/i.test(f) ? ["fasting", "not fasting"] : null;
  return (
    <Section title="Elements tested & normal values" level="high">
      <Rows rows={comps.map(c => [str(c.name), "Normal: " + (str(c.normal) || "—") + " " + str(c.unit) + (c.depends ? " *" : ""), mine ? "For you: " + (mine[str(c.name).toLowerCase()] || "same") : ""])} />
      {comps.some(c => c.depends) && factors.length ? (
        <Card>
          <P style={{ fontWeight: "700" }}>* These values change with {factors.join(", ").toLowerCase()}. Enter yours to see the range that applies to you.</P>
          {factors.map(f => { const ch = choices(f); return (
            <View key={f} style={{ gap: 6 }}>
              <Text style={[s.small, { color: t.muted }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
              {ch ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{ch.map(c => <Chip key={c} title={c} active={vals[f] === c} onPress={() => setVals({ ...vals, [f]: c })} />)}</View>
                : <Input value={vals[f] || ""} onChangeText={v => setVals({ ...vals, [f]: v })} keyboardType={/age/i.test(f) ? "number-pad" : "default"} placeholder={/age/i.test(f) ? "years" : ""} accessibilityLabel={f} />}
            </View>); })}
          <Btn small title="Show my normal values" onPress={go} />
          {status ? <P muted style={{ fontSize: 13 }}>{status}</P> : null}
        </Card>) : null}
    </Section>
  );
}

function drugSections(d, sec, body) {
  const g = d.drug || {};
  if (str(g.class) || str(g.howItWorks)) body.push(sec("What it is", <P>{[str(g.class), str(g.howItWorks)].filter(Boolean).join(". ")}</P>));
  const ad = g.administration || {};
  if (has(ad.routes) || str(ad.how)) body.push(sec("How it's taken", <>{has(ad.routes) ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{arr(ad.routes).map(str).filter(Boolean).map(x => <Tag key={x} text={x} />)}</View> : null}{str(ad.how) ? <P>{str(ad.how)}</P> : null}</>));
  if (has(g.uses)) body.push(sec("Used for", <Bullets items={g.uses} />));
  if (has(g.commonSideEffects) || has(g.seriousSideEffects)) body.push(sec("Side effects", <><H>Common</H><Bullets items={g.commonSideEffects} />{has(g.seriousSideEffects) ? <><H>Serious, get help</H><Bullets items={g.seriousSideEffects} /></> : null}</>));
  if (has(g.cautions)) body.push(sec("Who should be careful", <Bullets items={g.cautions} />));
  if (has(g.interactions)) body.push(sec("Interactions", <Bullets items={g.interactions} />));
}

// Mobile stand-in for the website's "highlight a word": type or paste any word to see its meaning
function WordLookup({ settings, topic }) {
  const [w, setW] = useState(""); const [m, setM] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => { if (!str(w)) return; setBusy(true); setM(""); try { setM(await defineWord(settings, w, topic) || "No meaning found."); } catch (e) { setM(e.message || "Couldn't look that up."); } setBusy(false); };
  return (
    <Card>
      <H>What does a word mean?</H>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Input style={{ flex: 1 }} value={w} onChangeText={setW} placeholder="e.g. bronchospasm" onSubmitEditing={go} returnKeyType="search" accessibilityLabel="Medical word to explain" />
        <Btn title={busy ? "…" : "Explain"} onPress={go} disabled={busy} />
      </View>
      {m ? <P>{m}</P> : <P muted style={{ fontSize: 13 }}>Tip: you can also long-press any text in the answer to copy it here.</P>}
    </Card>
  );
}

function FollowUp({ d, onSearch, onFollowUp }) {
  const [q, setQ] = useState("");
  const rel = arr(d.related).map(str).filter(Boolean).slice(0, 6);
  return (
    <Card>
      {rel.length ? <><H>Related</H><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{rel.map(x => <Chip key={x} title={x} onPress={() => onSearch(x)} />)}</View></> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Input style={{ flex: 1 }} value={q} onChangeText={setQ} placeholder={"Ask a follow-up about " + (str(d.title) || "this")} onSubmitEditing={() => { if (str(q)) { onFollowUp(str(q)); setQ(""); } }} returnKeyType="send" accessibilityLabel="Follow-up question" />
        <Btn title="Ask" onPress={() => { if (str(q)) { onFollowUp(str(q)); setQ(""); } }} />
      </View>
    </Card>
  );
}
