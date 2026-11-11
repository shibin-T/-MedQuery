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

### Commit: "Require AI setup before searching, and add trusted databases with Experimental tags"
**1. A "state machine" for the AI.** The AI can be in one of a few clear states: `checking → not_setup | unsupported → setting_up → ready` (or `error`). One object, `AI`, holds the current state, and one function, `setAI()`, changes it and redraws everything that shows it: the status chip, the banner and the setup screen. When several parts of a page show the same thing, keeping a single source of truth stops them from disagreeing.

**2. A gate.** `run()` (search) and `analyzeReport()` now start with `aiGate()`. Outside Claude, if the AI isn't set up, the gate remembers what you were trying to do (`AI.pending`), opens the setup screen, and stops. When setup finishes, `runPending()` carries on with your search or report. This "remember the request, then resume it" pattern is common in apps, for example a login screen that returns you to the page you wanted.

**3. Being honest about resources.** The setup screen reads what the browser will share: `navigator.gpu` (can it run AI), `navigator.deviceMemory` (rough memory), `navigator.storage.estimate()` (free space), `navigator.connection` (mobile data or Data Saver) and `navigator.getBattery()`. Some browsers hide some of these, so every check is optional. `navigator.storage.persist()` asks the browser not to delete the downloaded AI when space runs low.

**4. More trustworthy databases, each chosen for one job:**

| Database | Job in MedQuery |
|---|---|
| MeSH (US National Library of Medicine) | Official definitions of medical terms; also used for highlight-a-word |
| Cochrane systematic reviews | The strongest summaries of whether treatments work |
| Mondo Disease Ontology (includes Orphanet) | Definitions of rare diseases |
| ChEMBL (EMBL-EBI) | Whether a medicine is approved (phase 4) or still in trials |
| ClinicalTrials.gov | Trials recruiting now, shown as **Experimental** |
| ClinVar, LOINC, WHO trials registry | Genetic variants, lab test names and codes, trials worldwide (links) |

**5. Showing data as it is.** Clinical trials are displayed straight from ClinicalTrials.gov instead of being passed through the AI, so a small model can't misreport them. **Lesson:** when a fact comes from a trusted database, show it directly; use the AI only to explain.

### Commit: "Offer online or downloaded AI, with an AI menu, restart step and resource widget"
**Why a server for the online AI?** A web page is public: anyone can read its code. So it can't hold a secret API key. The usual solution is a tiny **server in the middle** (here a Cloudflare Worker in `worker/`): the page sends the question to the Worker, and the Worker, which can hold permissions safely, asks the AI. The Worker also only accepts requests from your website (**CORS**) and limits how often one person can ask (**rate limiting**), so nobody can use up your free allowance.

**Streaming (Server-Sent Events).** The Worker sends the answer back in small pieces, each line starting with `data:`. `readSSE()` in `local-ai.js` reads the pieces as they arrive, so words appear while the AI is still writing.

**Why restart after a download?** Restarting starts MedQuery fresh with the new AI switched on, which is a simple way to be sure everything uses it. Before reloading, MedQuery saves what you were doing in `sessionStorage` (storage that lasts until the tab closes) and picks it up after the reload. For a report, the file is saved as a *data URL* (the file's bytes written as text).

**Why can't a website choose a download folder?** Browsers keep each website's data in a private, sandboxed area so sites can't write files anywhere on your computer. That's a security feature. To save the AI in a folder you choose, MedQuery uses the Ollama app, which is allowed to: the `OLLAMA_MODELS` setting tells it where.

**The draggable widget** uses *pointer events* (`pointerdown`, `pointermove`, `pointerup`), which work for mouse, touch and pen alike. Its position, minimised state and whether it's open are saved in `localStorage`.

**Being honest about limits.** Browsers don't report live graphics-chip load or exactly how much memory the AI uses, so the widget shows estimates and says so.

### Commit: "Fix downloaded AI failing on every search"
**The bug:** after setting up the downloaded AI, every search ended with "The search didn't finish". Setup had passed, so the AI itself worked.

**How it was found:** the setup test asks the AI for plain text ("Say OK"), but real searches ask for a *structured* (JSON) answer using WebLLM's strict JSON mode. I read WebLLM's source code (downloaded from npm) and found that strict mode can fail *partway through* an answer with "Grammar matcher rejected the newly sampled token". MedQuery only retried errors that happened *before* the answer started streaming, so these slipped through to the generic error message.

**The fix:**
1. If strict JSON mode fails, MedQuery retries in plain mode (its `parseJSONLoose()` already reads JSON from plain text) and remembers not to use strict mode for that model again.
2. Setup now also tests strict JSON mode, so the problem is found before the first search.
3. If a question plus its sources is too long for a small AI's memory (its "context window", about 4,000 tokens), MedQuery shortens the sources and tries again.
4. Errors now show a specific explanation, an **Open AI menu** button and a "Technical detail" line, so the next bug is quicker to diagnose.

**Lessons:** a test should check the same thing the real work does (plain text passing didn't prove JSON would). And when a library misbehaves, reading its source code is often the fastest way to see exactly what it does.

### Commit: "Add a version number and load the AI file with it"
**Caching.** To load faster, browsers keep copies of files and GitHub Pages tells them they may reuse a copy for up to 10 minutes. Right after an update, a visitor can still get the *old* page, or worse, a new `index.html` with an old `local-ai.js`. Loading the module as `local-ai.js?v=2026-11-10.3` makes each version a different address, so the two files always match. This trick is called **cache busting**. The version number now shows in the AI menu, the resource widget and error messages, so you can tell at a glance which version you're running.

### Commit: "Help small downloaded AIs give readable answers"
**The bug:** with the Smallest AI, searches ended with "no JSON in reply". The AI was working, but its reply couldn't be turned into cards.

**Why:** a small AI has a small memory (its *context window*: about 4,000 tokens, roughly 12,000 characters, shared between the question and the answer). MedQuery's question plus its sources filled most of it, so the answer was cut off before it was finished, and very small AIs also sometimes ignore the format and reply in plain sentences.

**The fix, in layers (a pattern called *graceful degradation*):**
1. **Make room:** small AIs get fewer, shorter sources (`sourceBudget()`), and MedQuery works out how much room is left for the answer before asking.
2. **Rescue cut-off answers:** `closeTruncated()` keeps everything that was complete and adds the missing `}` and `]`, so a cut-off answer still shows what it has, with a note that parts may be missing.
3. **Ask more simply:** if that fails, MedQuery asks again with a much shorter form (a summary and a few key points).
4. **Last resort:** if the AI still replies in plain text, MedQuery shows that text, clearly marked as not organised into sections.

The error message now also shows how the AI's reply began, which makes problems like this much quicker to diagnose.

### Commit: "Open the app from the site's main address" and the first Release
**Where things live on GitHub:**
- **Code** (the files) is on the repo's main page. The app itself is `site/index.html`.
- **Commits** (clock icon, "Commits") list every change, newest first.
- **Releases** (right-hand side of the repo page) are named versions you choose to announce, such as `v2026.11.10.4`, with notes on what changed. A release is a bookmark on one commit: a *tag*, plus a description.
- **The live site** is built by GitHub Pages from the `main` branch. Its progress shows under the **Actions** tab ("pages build and deployment").

**The fix:** GitHub Pages serves `index.html` from the top folder. Ours had none, so `shibin-t.github.io/-MedQuery/` showed the README instead of the app. A tiny top-level `index.html` now forwards visitors to `site/`. The README now starts with an "Open the app" link. (You can also add the link to the repo's **About** box: click the ⚙ next to "About" on the repo page and paste it into *Website*.)

### Commit: "Make MedQuery installable as a phone app"
**What a "web app" (PWA) is.** A website can become an app on the phone's home screen, with its own icon and no browser bars, if it has three things:
1. A **manifest** (`manifest.webmanifest`): the app's name, icon, colours and which page to open first.
2. **Icons** (`icons/`): one picture in several sizes, drawn once as `icon.svg`.
3. A **service worker** (`sw.js`): a small script the browser keeps running for the site. Ours saves a copy of MedQuery's files, so the app still opens without internet. It is **network first**: when you're online it always fetches the newest files, so a push to GitHub reaches the app straight away.

**`site/mobile.js`** is new. `index.html` loads it only outside Claude. It adds the manifest and icons to the page, registers the service worker, offers "Install MedQuery as an app", and checks whether a new version was pushed when you come back to the app. If one was, it shows a **Refresh** button. Inside the Android app it also handles the **Back** button and the status bar.

**Two small fixes in `index.html`:** the Care Map's "back to MedQuery" link now points to wherever you opened MedQuery (it always pointed to the Claude version), and inside the Android app the Care Map opens from the copy packaged with the app.

### Commit: "Add the Android app project (Capacitor)"
**Capacitor** is a free, open-source tool that puts a website inside a real Android app. The app is mostly a full-screen browser (a *WebView*) showing our own files, plus *plugins* that let the page use phone features, such as the Back button.

- `app/scripts/build-web.mjs` copies `site/`, `care-map/` and `icons/` into `app/www/`, so **the app is never a separate copy to maintain**.
- `app/android/` is the project Android Studio opens. `AndroidManifest.xml` lists the **permissions**: internet, location (Care near you) and camera (photographing a report).
- **Live updates** use the open-source Capgo updater plugin, with its cloud service turned off. The app asks GitHub "is there a newer `bundle.zip`?", downloads it in the background, and switches to it on **Restart now** or the next launch. If a new version ever fails to start, the plugin goes back to the last one that worked (`notifyAppReady()` is how the page tells it "I started fine").
- **Signing:** Android only installs an update over an app if both were signed with the same key. GitHub's computers would otherwise create a new key every time, so a shared key (`medquery-shared.keystore`) is kept in the repository. That's normal for apps you share yourself. A Play Store app would keep its key secret.

### Commit: "Add the Phone Preview page"
`preview/index.html` shows the real app inside a phone frame. **CSS pixels** are the sizes a page's layout sees; a Pixel 8 is 412 × 915 of them, even though its screen has 2.625× as many real dots. The preview uses each phone's real CSS size, removes the status bar and home bar (or the browser bars, in *Browser tab* mode), and puts the app in an `<iframe>` (a page inside a page) of exactly the size left over.

Because the preview and the app come from the same website, the preview can reach *into* the iframe. That's how it:
- forces **light or dark** mode, by rewriting the app's `@media (prefers-color-scheme: …)` rules inside the phone only;
- makes the **mouse act like a finger**: drag to scroll with momentum, hidden scrollbars, and hold still to select text, as you would with a long press.

**Auto-reload** asks GitHub Pages for each file's *ETag*, a fingerprint that changes whenever the file changes, every 5 seconds. A new fingerprint means you pushed, so the phone reloads.

### Commit: "Build the Android app on GitHub for every push"
**GitHub Actions** runs a list of steps on GitHub's computers whenever something happens, here a push to `main`. The list is in `.github/workflows/android.yml`: install Node and Java → copy the site into the app → build the APK with Gradle (Android's build tool) → upload `MedQuery.apk` and `bundle.zip` to the **app-latest** release. It's free for public repositories. Watch it run under the **Actions** tab: a green tick means the new app is ready, and a red cross shows which step failed.
