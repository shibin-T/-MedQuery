// Calling a number.
// Android: after the user agrees in MedQuery's dialog, the app asks Android for the
//   "make phone calls" permission once, then dials directly (auto-dial). If the
//   permission is refused, the phone app opens with the number filled in instead.
// iPhone: iOS always shows its own "Call?" confirmation; one tap places the call.
// Web: opens the device's calling app (tel: link).
import { Linking, PermissionsAndroid, Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";

export const digits = n => String(n || "").replace(/[^\d+]/g, "");

export async function placeCall(number) {
  const tel = "tel:" + digits(number);
  if (Platform.OS === "android") {
    try {
      const ok = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE, {
        title: "Allow MedQuery to place calls?",
        message: "So it can dial hospitals for you after you tap Call. You can change this in Settings any time.",
        buttonPositive: "Allow", buttonNegative: "Not now"
      });
      if (ok === PermissionsAndroid.RESULTS.GRANTED) {
        await IntentLauncher.startActivityAsync("android.intent.action.CALL", { data: tel });
        return "dialed";
      }
    } catch {}
  }
  await Linking.openURL(tel);
  return "dialer";
}

// Emergency numbers: straight to the phone app with the number filled in (fastest, no extra prompts)
export async function callEmergency(number) {
  await Linking.openURL("tel:" + digits(number));
}
