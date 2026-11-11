/* MedQuery service worker — makes the installed app open offline and stay up to date.
 *
 * How it decides:
 *  - MedQuery's own files (site/, care-map/, icons): NETWORK FIRST. When you are online you always get
 *    the newest version you pushed to GitHub; the copy saved here is only used when you are offline.
 *  - Fixed-version libraries from CDNs (cdnjs, jsDelivr, unpkg) and Google Fonts: CACHE FIRST, because
 *    a versioned file never changes.
 *  - Everything else (AI servers, Ollama, medical databases, map tiles, model downloads): not touched.
 */
const VERSION = "mq-sw-1";
const SHELL = VERSION + "-shell";
const LIBS = VERSION + "-libs";
const PRECACHE = ["./site/", "./site/local-ai.js", "./site/mobile.js", "./care-map/", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon.svg"];
const LIB_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("mq-sw-") && !k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const scopeUrl = new URL(self.registration.scope);

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname)) {
    if (url.pathname.endsWith("/sw.js")) return;
    e.respondWith(networkFirst(req));
  } else if (LIB_HOSTS.includes(url.hostname) && !url.pathname.includes("/@latest") ) {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) cache.put(stripQuery(req), res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(stripQuery(req)) || (req.mode === "navigate" && await cache.match("./site/"));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

// local-ai.js is loaded as local-ai.js?v=<build>; store one copy per file, not one per version.
function stripQuery(req) {
  const u = new URL(req.url);
  if (u.searchParams.has("v")) { u.searchParams.delete("v"); return new Request(u.toString()); }
  if (req.mode === "navigate") { u.search = ""; return new Request(u.toString()); }
  return req;
}

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
