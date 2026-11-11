// Copies the MedQuery website into app/www so Capacitor can package it as a phone app.
// Nothing is rewritten by hand: the app always runs the same site/ code as GitHub Pages.
//   node scripts/build-web.mjs            (version 0.0.0 = local test build)
//   APP_VERSION=1.0.42 node scripts/build-web.mjs   (what the GitHub Action does)
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..");
const www = join(app, "www");

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(join(repo, "site"), www, { recursive: true });                  // index.html, local-ai.js, mobile.js
cpSync(join(repo, "care-map"), join(www, "care-map"), { recursive: true });
cpSync(join(repo, "icons"), join(www, "icons"), { recursive: true });

// Capacitor's small browser library lets mobile.js talk to the phone (Back button, status bar, updates).
const capJs = join(app, "node_modules/@capacitor/core/dist/capacitor.js");
if (!existsSync(capJs)) { console.error("Run `npm install` in the app folder first."); process.exit(1); }
cpSync(capJs, join(www, "capacitor.js"));
const indexPath = join(www, "index.html");
let html = readFileSync(indexPath, "utf8");
html = html.replace(/<head>/i, '<head><script src="capacitor.js"></script>');
writeFileSync(indexPath, html);

const version = process.env.APP_VERSION || "0.0.0";
writeFileSync(join(www, "app-version.json"), JSON.stringify({ version, commit: process.env.GITHUB_SHA || "local", built: new Date().toISOString() }, null, 2));
console.log(`MedQuery web files copied to app/www (version ${version}).`);
