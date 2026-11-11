/* MedQuery phone layer.
 *
 * index.html loads this file only OUTSIDE Claude (GitHub Pages, the installed web app, the Android app).
 * It adds what a phone app needs on top of the normal website:
 *   Web / installed web app: app icon + manifest, offline support (service worker), "Install MedQuery"
 *     hint, and an "update ready" banner when you push a new version to GitHub.
 *   Android app (Capacitor): the phone's Back button, status-bar colours, and live updates — new web code
 *     is downloaded in the background from the latest GitHub build, so nobody has to reinstall the app.
 */
const REPO = "shibin-T/-medquery";             // GitHub repository that builds the app
const RELEASE_TAG = "app-latest";              // release the GitHub Action refreshes on every push
const here = new URL(import.meta.url);
const ROOT = new URL("../", here);             // repository root on GitHub Pages
const Cap = window.Capacitor;
const NATIVE = !!Cap?.isNativePlatform?.();
const PLATFORM = Cap?.getPlatform?.() || "web";
const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

document.documentElement.classList.add(NATIVE ? "mq-native" : STANDALONE ? "mq-installed" : "mq-web");
injectStyles();

if (NATIVE) startNative(); else startWeb();

/* ---------------------------------------------------------------- web + installed web app */
function startWeb() {
  addHeadTags();
  const inPreview = window.parent !== window;     // shown inside the Phone Preview page
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register(new URL("sw.js", ROOT), { scope: ROOT.pathname }).catch(() => {});
  }
  watchForWebUpdates();
  if (!STANDALONE && !inPreview) offerInstall();
}

function addHeadTags() {
  const add = (tag, attrs) => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); document.head.append(e); };
  if (!document.querySelector('link[rel="manifest"]')) add("link", { rel: "manifest", href: new URL("manifest.webmanifest", ROOT).href });
  if (!document.querySelector('link[rel~="icon"]')) {
    add("link", { rel: "icon", type: "image/svg+xml", href: new URL("icons/icon.svg", ROOT).href });
    add("link", { rel: "icon", type: "image/png", sizes: "32x32", href: new URL("icons/favicon-32.png", ROOT).href });
  }
  add("link", { rel: "apple-touch-icon", href: new URL("icons/apple-touch-icon.png", ROOT).href });
  add("meta", { name: "theme-color", content: "#f3f6f8", media: "(prefers-color-scheme: light)" });
  add("meta", { name: "theme-color", content: "#0e161d", media: "(prefers-color-scheme: dark)" });
  add("meta", { name: "mobile-web-app-capable", content: "yes" });
  add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
  add("meta", { name: "apple-mobile-web-app-title", content: "MedQuery" });
  add("meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" });
}

// When a new version is pushed to GitHub, the open app notices (on return to the app, or every 10 min)
// and offers a one-tap refresh.
function watchForWebUpdates() {
  if (!/^https?:$/.test(location.protocol)) return;
  const files = [location.pathname, new URL("local-ai.js", here).pathname, here.pathname];
  const signature = async () => {
    const parts = await Promise.all(files.map(f => fetch(f, { method: "HEAD", cache: "no-store" })
      .then(r => r.ok ? (r.headers.get("etag") || r.headers.get("last-modified") || "") : "").catch(() => "")));
    return parts.join("|");
  };
  let first = null, last = 0, shown = false;
  signature().then(s => { first = s; last = Date.now(); });
  const check = async () => {
    if (shown || first === null || !first.replace(/\|/g, "") || Date.now() - last < 60_000) return;
    last = Date.now();
    const now = await signature();
    if (now && now.replace(/\|/g, "") && now !== first) {
      shown = true;
      banner("A new version of MedQuery is ready.", "Refresh", () => location.reload());
    }
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  setInterval(() => { if (!document.hidden) check(); }, 10 * 60_000);
}

function offerInstall() {
  if (store.get("medquery.installAsk") === "no") return;
  let deferred = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; });
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const phoneSized = matchMedia("(max-width: 900px) and (pointer: coarse)").matches;
  setTimeout(() => {
    if (store.get("medquery.installAsk") === "no") return;
    if (deferred) {
      banner("Install MedQuery as an app on this device?", "Install", async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); store.set("medquery.installAsk", "no"); },
        () => store.set("medquery.installAsk", "no"), "Not now");
    } else if (isIOS && phoneSized) {
      banner("To install MedQuery: tap Share, then “Add to Home Screen”.", "OK", () => store.set("medquery.installAsk", "no"), () => store.set("medquery.installAsk", "no"));
    }
  }, 25_000);
}

/* ---------------------------------------------------------------- Android app (Capacitor) */
function plugin(name) { try { return Cap.registerPlugin(name); } catch { return null; } }

async function startNative() {
  const App = plugin("App"), StatusBar = plugin("StatusBar"), Updater = plugin("CapacitorUpdater");
  // Tell the updater this version started fine. If a downloaded update ever fails to start,
  // the updater rolls back to the previous working version by itself.
  try { await Updater?.notifyAppReady(); } catch {}

  // Status bar: match MedQuery's light / dark colours, keep the page below it.
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const paintBar = () => {
    if (!StatusBar) return;
    StatusBar.setStyle({ style: dark.matches ? "DARK" : "LIGHT" }).catch(() => {});
    if (PLATFORM === "android") {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setBackgroundColor({ color: dark.matches ? "#0e161d" : "#f3f6f8" }).catch(() => {});
    }
  };
  paintBar(); dark.addEventListener?.("change", paintBar);

  // Android Back button: close the top pop-up first, then go back to the home screen, then leave the app.
  App?.addListener("backButton", ({ canGoBack }) => onBack(App, canGoBack));

  // Live updates: check on start and whenever the app comes back to the front.
  checkNativeUpdate(Updater);
  App?.addListener("resume", () => checkNativeUpdate(Updater));
}

const uiSignature = () => {
  const visible = [...document.querySelectorAll('[aria-modal="true"], [role="dialog"], [role="listbox"]')]
    .filter(e => e.isConnected && !e.hidden && e.offsetParent !== null).length;
  return document.body.className + "|" + visible + "|" + document.querySelectorAll("[hidden]").length + "|" + document.querySelectorAll('[aria-expanded="true"]').length;
};

async function onBack(App, canGoBack) {
  const openBanner = document.querySelector(".mq-banner");
  if (openBanner) { openBanner.remove(); return; }
  const before = uiSignature();
  const esc = () => new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true });
  (document.activeElement && document.activeElement !== document.body ? document.activeElement : document).dispatchEvent(esc());
  for (const m of document.querySelectorAll('[aria-modal="true"]')) m.dispatchEvent(esc());
  await new Promise(r => setTimeout(r, 60));
  if (uiSignature() !== before) return;                       // a pop-up / menu closed
  if (document.body.classList.contains("has-results")) {      // showing an answer → back to the search screen
    document.getElementById("homeLink")?.click(); return;
  }
  if (canGoBack) { history.back(); return; }                   // e.g. came from the Care Map
  App.minimizeApp ? App.minimizeApp().catch(() => App.exitApp()) : App.exitApp();
}

async function checkNativeUpdate(Updater) {
  if (!Updater) return;
  const last = +store.get("medquery.updateCheck") || 0;
  if (Date.now() - last < 15 * 60_000) return;                 // at most every 15 minutes
  store.set("medquery.updateCheck", String(Date.now()));
  try {
    const current = await installedVersion(Updater);
    const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`, { headers: { Accept: "application/vnd.github+json" } }).then(r => r.ok ? r.json() : null);
    const latest = /version:\s*([\d.]+)/.exec(rel?.body || "")?.[1];
    const zip = rel?.assets?.find(a => a.name === "bundle.zip");
    if (!latest || !zip || !newer(latest, current)) return;
    const ready = (await Updater.list().catch(() => ({ bundles: [] }))).bundles?.find(b => b.version === latest && b.status === "success");
    const bundle = ready || await Updater.download({ url: zip.browser_download_url, version: latest });
    await Updater.next({ id: bundle.id });                      // used automatically next time the app opens
    banner(`A new version of MedQuery (${latest}) is ready.`, "Restart now", () => Updater.set({ id: bundle.id }), null, "Later");
  } catch {}
}

async function installedVersion(Updater) {
  try { const c = await Updater.current(); if (c?.bundle?.version && c.bundle.id !== "builtin") return c.bundle.version; } catch {}
  try { return (await fetch("app-version.json", { cache: "no-store" }).then(r => r.json())).version || "0"; } catch { return "0"; }
}

function newer(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}

/* ---------------------------------------------------------------- shared UI */
function banner(text, action, onAction, onClose, closeLabel = "Close") {
  document.querySelector(".mq-banner")?.remove();
  const box = document.createElement("div");
  box.className = "mq-banner"; box.setAttribute("role", "status");
  const p = document.createElement("p"); p.textContent = text;
  const go = document.createElement("button"); go.type = "button"; go.className = "mq-banner-go"; go.textContent = action;
  const x = document.createElement("button"); x.type = "button"; x.className = "mq-banner-x"; x.textContent = closeLabel;
  go.onclick = () => { box.remove(); onAction?.(); };
  x.onclick = () => { box.remove(); onClose?.(); };
  const row = document.createElement("div"); row.className = "mq-banner-row"; row.append(x, go);
  box.append(p, row);
  document.body.append(box);
}

function injectStyles() {
  const css = `
.mq-banner{position:fixed;z-index:80;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));
  width:min(440px,calc(100vw - 24px));box-sizing:border-box;display:grid;gap:10px;padding:14px 16px;
  background:var(--card,#fff);color:var(--ink,#132433);border:1.5px solid var(--ink,#132433);border-radius:var(--r,14px);
  box-shadow:3px 3px 0 var(--ink,#132433);font:500 .92rem var(--f-body,system-ui,sans-serif);animation:mqBanner .25s ease-out}
.mq-banner p{margin:0}
.mq-banner-row{display:flex;gap:8px;justify-content:flex-end}
.mq-banner button{font:600 .88rem var(--f-body,system-ui,sans-serif);border-radius:999px;padding:8px 14px;cursor:pointer;border:1.5px solid var(--ink,#132433);min-height:40px}
.mq-banner-go{background:var(--accent,#1c5d8c);color:var(--accent-ink,#fff)}
.mq-banner-x{background:transparent;color:var(--ink,#132433)}
@keyframes mqBanner{from{opacity:0;transform:translate(-50%,12px)}}
@media (prefers-reduced-motion:reduce){.mq-banner{animation:none}}
/* Installed / native app: no rubber-band pull-to-refresh, no grey tap flash */
.mq-native body,.mq-installed body{overscroll-behavior-y:none}
.mq-native *,.mq-installed *{-webkit-tap-highlight-color:transparent}`;
  const s = document.createElement("style"); s.id = "mq-mobile-css"; s.textContent = css; document.head.append(s);
}
