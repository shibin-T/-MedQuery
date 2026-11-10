// Finding hospitals: typed place or current location, ranked for a condition
// (or nearest 24-hour emergency care when there is no condition)
import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { findBestCare, bestCarePrompt } from "./core";
import { askJSON, engineReady } from "./ai";
import { langNote } from "./lang";
import { str } from "./components/ui";

export function useCare({ condition, settings, onLocated, auto = true }) {
  const general = !str(condition);
  const [state, setState] = useState({ status: "idle" });
  const ctl = useRef(null);

  async function find(where) {
    ctl.current?.abort(); const my = ctl.current = new AbortController();
    setState({ status: "loading", msg: general ? "Finding hospitals near you…" : "Finding the best hospitals for " + condition + "…" });
    try {
      const r = await findBestCare(where, general ? "" : condition, { signal: my.signal, limit: 20 });
      if (my.signal.aborted) return;
      if (!r.origin) { setState({ status: "error", msg: "Couldn't find that place. Try adding the city or country.", where }); return; }
      onLocated?.(r);
      let places = r.places, note = "", aiRanked = false;
      // Claude re-ranks the REAL candidates for the condition (it cannot add places or numbers)
      if (!general && places.length > 1 && settings.engine === "claude" && engineReady(settings)) {
        setState({ status: "loading", msg: "Comparing " + places.length + " hospitals for " + condition + "…" });
        try {
          const res = await askJSON(settings, bestCarePrompt(condition, r.specialty, r.origin.label, places) + langNote(settings.lang), { signal: my.signal, effort: "low", maxTokens: 3000 });
          const picks = (res?.picks || []).map(x => ({ i: (+x.n) - 1, why: str(x.why) })).filter(x => places[x.i]);
          if (picks.length) { const used = new Set(picks.map(x => x.i)); places = [...picks.map(x => ({ ...places[x.i], aiWhy: x.why })), ...places.filter((_, i) => !used.has(i))]; note = str(res?.note); aiRanked = true; }
        } catch (e) { if (my.signal.aborted) return; }
      }
      places = places.map((p, i) => ({ ...p, rank: i + 1 }));
      setState({ status: "done", r, places, note, aiRanked, where });
    } catch (e) {
      if (my.signal.aborted) return;
      setState({ status: "error", msg: "Couldn't reach the map service right now. Check your connection and try again.", where });
    }
  }
  async function gps() {
    setState({ status: "loading", msg: "Asking for your location…" });
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") { setState({ status: "error", msg: "Location permission was not given. Type your area instead." }); return; }
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 600000 })) || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      find({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch { setState({ status: "error", msg: "Couldn't get your location. Type your area instead." }); }
  }
  useEffect(() => { if (auto && settings.location) find({ text: settings.location }); return () => ctl.current?.abort(); }, [condition]);
  return { state, find, gps, general };
}
