// Copies the built-in search term index from the website (site/index.html) into the app.
const fs = require("fs"), path = require("path");
const s = fs.readFileSync(path.join(__dirname, "../../site/index.html"), "utf8");
const raw = s.match(/const RAW = `([\s\S]*?)`;/)[1];
const aliases = s.match(/const ALIASES = (\{[\s\S]*?\});\n/)[1];
fs.writeFileSync(path.join(__dirname, "../src/termIndex.js"), `// Built-in term index for search suggestions.
// Copied from site/index.html (RAW and ALIASES). Regenerate with: npm run sync-index
export const RAW = ${JSON.stringify(raw)};
export const ALIASES = ${aliases};
export const INDEX = RAW.split("\\n").filter(Boolean).map(l => { const [term, k, sys, note] = l.split("|"); return { term, kind: { d: "disease", t: "test", m: "drug" }[k], sys, note }; });
`);
console.log("termIndex.js updated");
