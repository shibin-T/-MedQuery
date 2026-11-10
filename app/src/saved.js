// Saved answers (readable offline) and sharing
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Share, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

const KEY = "medquery.saved";
export const savedId = d => (String(d?.kind || "") + ":" + String(d?.title || "")).toLowerCase();
export async function loadSaved() { try { return JSON.parse((await AsyncStorage.getItem(KEY)) || "[]"); } catch { return []; } }
export async function writeSaved(list) { try { await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))); } catch {} }

export function answerText(d, articles = []) {
  const a = v => (Array.isArray(v) ? v.map(x => (typeof x === "string" ? x : "")).filter(Boolean) : []);
  const lines = [d.title, "", d.summary];
  if (d.urgent) lines.push("", "Get medical help now if: " + d.urgent);
  if (d.definition) lines.push("", d.definition);
  if (a(d.symptoms?.common).length) lines.push("", "Symptoms: " + a(d.symptoms.common).join(", "));
  if (a(d.prevention).length) lines.push("Prevention: " + a(d.prevention).join(", "));
  if (d.answer) lines.push("", d.answer);
  if (d.drug?.uses?.length) lines.push("", "Used for: " + a(d.drug.uses).join(", "));
  if (articles.length) { lines.push("", "Sources:"); for (const x of articles.slice(0, 5)) lines.push("• " + x.title + " (" + x.publisher + "): " + x.url); }
  lines.push("", "From MedQuery. General information, not a diagnosis.");
  return lines.join("\n");
}
// Returns "shared" | "copied"
export async function shareAnswer(d, articles) {
  const message = answerText(d, articles);
  if (Platform.OS === "web" && !(typeof navigator !== "undefined" && navigator.share)) { await Clipboard.setStringAsync(message); return "copied"; }
  try { await Share.share({ message, title: d.title }); return "shared"; }
  catch { await Clipboard.setStringAsync(message); return "copied"; }
}
