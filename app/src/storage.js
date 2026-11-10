// Settings live on this device only. The Claude API key goes into the phone's secure
// keychain/keystore (expo-secure-store); on the web, where that doesn't exist, it stays
// in this browser's storage.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "medquery.settings";
const SECRET = "medquery.claudeKey";
export const DEFAULTS = { engine: "claude", ollamaUrl: "http://192.168.1.10:11434", ollamaModel: "qwen3:8b", lang: "en", currency: "", mapApp: Platform.OS === "ios" ? "apple" : "google", location: "", callOk: false, recent: [] };

export async function loadSettings() {
  let s = {};
  try { s = JSON.parse((await AsyncStorage.getItem(KEY)) || "{}"); } catch {}
  let apiKey = "";
  try { apiKey = Platform.OS === "web" ? (await AsyncStorage.getItem(SECRET)) || "" : (await SecureStore.getItemAsync(SECRET)) || ""; } catch {}
  return { ...DEFAULTS, ...s, apiKey };
}
export async function saveSettings(settings) {
  const { apiKey, ...rest } = settings;
  try { await AsyncStorage.setItem(KEY, JSON.stringify(rest)); } catch {}
  try {
    if (Platform.OS === "web") { if (apiKey) await AsyncStorage.setItem(SECRET, apiKey); else await AsyncStorage.removeItem(SECRET); }
    else if (apiKey) await SecureStore.setItemAsync(SECRET, apiKey); else await SecureStore.deleteItemAsync(SECRET);
  } catch {}
}
