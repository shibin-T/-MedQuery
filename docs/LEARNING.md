# Learning Git, GitHub and coding with MedQuery

This guide grows with the project. Each time we build something, a short "What just happened" note is added at the bottom, so the project's history doubles as a course.

---

## Part 1: Git and GitHub in plain words

**Repository (repo).** A project folder that remembers every version of every file. Yours lives at `github.com/shibin-T/-MedQuery`.

**Git vs GitHub.** *Git* is the tool that tracks versions. *GitHub* is a website that stores Git repositories online so you can share, back up and collaborate.

**Commit.** A saved snapshot of the project with a message saying what changed and why. Think of it as a save point in a game you can always go back to. Good messages are short and specific: "Add copy button to hospital numbers", not "update".

**Clone.** Downloading a full copy of a repository, with its history, to a computer. I cloned yours into my workspace to work on it.

**Push / pull.** *Push* uploads your new commits to GitHub. *Pull* downloads commits that others (or GitHub's website) made.

**Branch.** A parallel line of work. `main` is the official version. You can make a branch like `try-dark-theme`, experiment freely, and only merge it into `main` if you like it.

**Pull request (PR).** A request to merge one branch into another. It shows exactly what changed, line by line, and lets people comment before it's accepted. It's the normal way teams review code.

**README.md.** The front page of a repository. GitHub shows it automatically. The `.md` means *Markdown*: plain text with simple symbols for formatting (`#` for a heading, `**bold**`, `- ` for a bullet).

**LICENSE.** Says what others may legally do with your code. You chose **MIT**: anyone can use, copy, change or sell it, as long as they keep your copyright notice. It also says the software comes with no warranty.

**.gitignore.** A list of files Git should never track, such as temporary files or secrets.

### Try it yourself (5 minutes)
1. Open your repo on GitHub and click **Commits** (the clock icon near the top). You'll see each snapshot and its message.
2. Click any commit to see what changed: green lines were added, red lines removed.
3. Click any file, then the **pencil** icon, change a word in this guide, and press **Commit changes**. You just made a commit from your browser.
4. Back in Commits, your change is now part of the history.

---

## Part 2: How a web page is built

Every web page is made of three languages working together:

| Language | Job | In MedQuery |
|---|---|---|
| **HTML** | Structure: what's on the page (search bar, buttons, panels). | The `<div class="wrap">` … section near the top of `site/index.html`. |
| **CSS** | Looks: colours, fonts, spacing, layout, animation. | Everything inside `<style>` … `</style>`. |
| **JavaScript** | Behaviour: what happens when you type, click or paste. | Everything inside `<script>` … `</script>`. |

### A tour of `site/index.html`

The file is long (about 2,300 lines), but it's split into labelled sections. Search for these headings (Ctrl+F on GitHub) to jump around:

| Look for | What it does |
|---|---|
| `:root{` | **Design tokens**: every colour and font is defined once here as a CSS variable (`--accent`, `--ink`…), then reused everywhere. Change one value and the whole site updates. |
| `@media (prefers-color-scheme: dark)` | Dark-mode versions of the same colours. |
| `/* ===== Results as connected 3D blocks` | The 3D card look: stacked shadows create the depth. |
| `/* ===== Neon importance colour code` | Maps importance levels (critical, high, medium, info, normal) to neon colours. |
| `// ---------- Built-in term index` | The list of ~280 medical terms that powers instant suggestions. |
| `// ---------- Suggestion panel` | Shows suggestions as you type, with keyboard navigation. |
| `// ---------- Prompt` | The instructions sent to Claude for each search: this decides what an answer contains. |
| `// ---------- Report rendering` | Turns Claude's answer (JSON data) into cards on the page. |
| `// ---------- Care near you + emergency call` | The hospital list, sorting, directions and call buttons. |
| `// ---------- Scan a medical report` | Upload and paste handling, PDF-to-image conversion and the report cards. |
| `// ---------- Translate` | Language list and whole-page translation. |
| `// ---------- Run` | What happens when you press Search. |

### Key ideas you'll see over and over
- **Variables and functions.** `const careLoc = "Kochi"` stores a value; `function findCare() { … }` is a reusable set of steps.
- **Events.** `button.addEventListener("click", () => { … })` means "when this is clicked, do this".
- **The DOM.** The browser's live model of the page. JavaScript changes the page by creating or editing DOM elements (`el("div", …)` in this project is a small helper for that).
- **JSON.** A simple data format (`{"name": "Aster Medcity", "km": 5.7}`). MedQuery asks Claude to reply in JSON so the page can turn answers into cards reliably.
- **async / await.** Some things take time (asking Claude, reading a PDF). `await` waits for them without freezing the page.
- **localStorage.** A small storage box in your browser. MedQuery keeps your recent searches, city and language there, only on your device.

---

## Part 3: What just happened (project log)

### Commit: "Add project README with medical disclaimer"
The front page of the repo now explains what MedQuery is, how the folders fit together and, importantly for a health tool, a clear medical disclaimer.

### Commit: "Add MedQuery app (site/index.html)"
The whole app is one file. Single-file apps are simple to share and publish, which is why the Claude artifact works this way. Bigger projects usually split code into many files; we may do that later as a learning exercise.

### Commit: "Add Care Map (care-map/index.html)"
A separate page using **Leaflet** (an open-source map library) and **OpenStreetMap**. It can be hosted for free with GitHub Pages. See "Next lesson" below.

### Next lesson: publish the Care Map with GitHub Pages
1. In your repo, go to **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**.
3. After a minute, your map is live at `https://shibin-t.github.io/-MedQuery/care-map/`.
4. Send me that link and I'll connect it to MedQuery's "Open live map" button.

### Commit: "Make Call buttons open the phone dialer from inside Claude"
This change was published to the live site from another session, so it existed on the site but not on GitHub. Before adding new work I copied it into the repo as its own commit. **Lesson:** when two places can change the same file, always bring in the other side's changes first (on GitHub this is *pull*), then add yours. Otherwise the second save silently erases the first.

### Commit: "Fix PDF report reading"
**The bug:** PDFs weren't being read. To debug it, I reproduced the live site's security rules on a test page and fed it real PDFs. That revealed:
- The page image of a PDF could come out **blank**, because of a font setting, so Claude was shown an empty picture. Fixed by drawing standard PDF fonts with the device's system fonts.
- If the PDF library failed to download, every later try failed too, because the failure was remembered. Now it retries, and falls back to a second download source (jsDelivr) if the first (cdnjs) is blocked.
- Text and page pictures are now read separately, so a problem with one doesn't lose the other. Line breaks in the text are kept, so table rows stay on their own lines.
- Each failure (damaged PDF, password-protected PDF, reader can't load) now has its own clear message, plus a short "technical detail" line.

**Lessons:**
- *Reproduce before fixing:* a bug you can make happen on demand is a bug you can prove is fixed.
- *Test with realistic input:* my first test PDF was only a picture, which hid the font problem. A PDF with real text exposed it.
- *Fail loudly and specifically:* a precise error message saves hours of guessing next time.

### Commits: "Make site/index.html a complete web page…", "Add on-device AI engine…", "Use the on-device AI…"
**Goal:** make MedQuery free for everyone by running the AI on the visitor's own device instead of Claude.

**How it works:**
1. **One switch point.** Every AI request in MedQuery already went through one function, `getSample()`. So the change only needed a decision in one place: *inside Claude, use Claude; anywhere else, load `local-ai.js`.* `local-ai.js` returns an object with the **same shape** as Claude's connection (`ai.json(prompt, options)`), so the rest of the app didn't need rewriting. This is called an **interface**, and it's one of the most useful ideas in programming: if two things can be used the same way, you can swap one for the other.
2. **Modules.** `local-ai.js` is a separate file loaded with `import("./local-ai.js")` only when needed. Splitting code by job makes it easier to read, and it isn't downloaded inside Claude where it isn't used.
3. **Grounding (retrieval).** Small models forget and invent things. So before asking the model, MedQuery fetches facts from free official sources and puts them in the prompt with the rule "use ONLY these sources". This pattern is often called **RAG** (retrieval-augmented generation).
4. **Working with a small memory.** These models can only read about 4,000 *tokens* (word pieces) at once, so the prompts in `local-ai.js` are much shorter than Claude's, and the sources are trimmed to fit.
5. **Defensive parsing.** Small models sometimes wrap JSON in extra text. `parseJSONLoose()` cleans that up before giving up. Always expect messy input from the outside world.
6. **Feature detection.** `webgpuStatus()` checks what the browser can do before trying, and explains the alternative (Ollama) if it can't.

**Try it:** after enabling GitHub Pages (see the README), open the site, search "dengue fever", accept the download, and compare the answer and its source links with the Claude version.

### Commit: "Make Care near you faster and accept locations from any map app"
**The problem:** hospitals appeared only after the whole answer had finished, and then only once every hospital had been written out.

**What changed (and the idea behind each):**
1. **Do slow things at the same time (concurrency).** The hospital search now starts the moment you press Search, alongside the answer, instead of waiting for it. Two `await`s one after another add their waiting times together; starting both first and then waiting means you only wait for the slower one.
2. **Streaming.** Inside Claude, the hospital list arrives as text bit by bit. `streamedObjects()` scans that half-finished JSON, counting `{` and `}` (while ignoring braces inside quoted text), and pulls out each hospital the moment its closing `}` arrives. The first hospital now shows within about a second.
3. **Caching.** Results are remembered in `localStorage` for a day, keyed by place + topic. A repeat search shows instantly and costs nothing. A cache needs two rules: when an entry expires (24 hours) and how many to keep (30), or it grows forever.
4. **Racing servers.** On GitHub Pages, hospital data comes from OpenStreetMap's Overpass servers, which are sometimes slow. `overpassRace()` asks three servers at once with `Promise.any` and uses the first answer, then cancels the others with an `AbortController`.
5. **Search small, widen only if needed.** Look within 6 km first; only if fewer than 3 places come back, look within 20 km. Small queries return much faster.
6. **Skip work you don't need.** If you paste a map link, use GPS or drop a pin, we already have exact coordinates, so the address lookup step is skipped.

**Locations from any map app:** `parseMapLocation()` reads coordinates out of links from Google Maps, Waze (including its short "geohash" links), Apple Maps, OpenStreetMap, Bing and HERE, `geo:` links, Plus Codes and plain "lat, lon". It's a good example of **regular expressions** (the `/…/` patterns): small search patterns that find a shape of text, like "`@` then a number, a comma, another number".

**Also fixed:** with a saved location, the hospital list didn't load when the page first opened. The code asked "are we inside Claude?" before the line that sets up that check had run. JavaScript's `const` and `let` can't be used before their line runs (the "temporal dead zone"); deferring the call with `setTimeout(findCare, 0)` lets the rest of the script load first.

**Lesson:** for speed, measure where the waiting happens first. Here almost all the time was waiting on the network or the AI, so the fixes were about waiting *less often* (cache), waiting *in parallel* (concurrency, racing) and *showing results sooner* (streaming), not about faster code.

### Commit: "Add CDC WONDER, Global Index Medicus, UK Biobank, 1000 Genomes and HealthData.gov"
**Lesson: before using a data source, check how it can be reached.** The five databases look alike in a list, but they're opened in very different ways:

| Database | How a website can reach it | What MedQuery does |
|---|---|---|
| **1000 Genomes Project** | Open API (Ensembl REST), no key | GitHub version: when you mention a variant like `rs334`, it fetches allele frequencies by population and gives them to the AI as a source. |
| **UK Biobank** | Raw data needs an approved research application and fee, so no website can search it directly | Uses *published* open-access studies of UK Biobank data, found through Europe PMC. |
| **HealthData.gov** | Open catalogue API (Socrata) | Lists matching datasets as links. They describe data rather than answer questions, so they aren't given to the AI as facts. |
| **Global Index Medicus** | Website search only, no open API | A search link, plus Claude is told to use it for diseases common in low- and middle-income countries. |
| **CDC WONDER** | An XML API that only returns national US totals and needs a data-use agreement | A link, plus Claude is told to use its US statistics and say the year and that they're US figures. |

**New ideas in the code:**
- **API (application programming interface):** a web address that returns data (usually JSON) instead of a page, made for programs. `rest.ensembl.org/variation/human/rs334?pops=1` is one.
- **Context budget:** a small on-device AI can only read a few thousand words, so `ground()` picks at most 5 sources and trims each one. Dataset descriptions are kept out of that budget on purpose.
- **Bias notes:** UK Biobank participants are mostly white British adults aged 40–69, so the AI is told to say that its findings may not apply everywhere. Good data tools state who the data does and doesn't represent.
