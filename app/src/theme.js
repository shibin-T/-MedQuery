// Colours from the website's design tokens (light and dark), plus the neon importance code
import { useColorScheme } from "react-native";

const LIGHT = { paper: "#f3f6f8", card: "#ffffff", ink: "#132433", muted: "#5a6b78", rule: "#d6dfe6", accent: "#1c5d8c", accentInk: "#ffffff", accentSoft: "#e2eef7", warn: "#a3361f", warnSoft: "#fbe9e4", disease: "#c0392b", test: "#7b5ea7", drug: "#b8860b", question: "#2f7d5b", critical: "#e0122f", high: "#e86a00", medium: "#c9a400", info: "#0a9bb5", ok: "#2f7d5b" };
const DARK = { paper: "#0e161d", card: "#15212b", ink: "#e4ecf2", muted: "#93a5b3", rule: "#263643", accent: "#6fb3e3", accentInk: "#0b1620", accentSoft: "#1b3346", warn: "#f08a70", warnSoft: "#3a1f19", disease: "#e8695a", test: "#a98bd6", drug: "#dcb24a", question: "#5cbf90", critical: "#ff3b5c", high: "#ff8a1f", medium: "#ffd60a", info: "#22d3ee", ok: "#5cbf90" };

export function useTheme() { return useColorScheme() === "dark" ? DARK : LIGHT; }

export const KIND_LABEL = { disease: "Disease", test: "Test", drug: "Medicine", question: "Question" };
export const IMP_LABEL = { critical: "Critical", high: "High", medium: "Medium", info: "Info" };
// Importance of a section, from its heading (same rules as the website)
export const importance = t => /careful|caution|warning|emergency|danger|serious|red flag|get medical help/i.test(t) ? "critical"
  : /treatment|how it's|tests to confirm|elements tested|abnormal|interaction|side effect|dosing|complication/i.test(t) ? "high"
  : /symptom|cause|prevent|remed|used for|before the test|risk|monitor|pregnan/i.test(t) ? "medium" : "info";
