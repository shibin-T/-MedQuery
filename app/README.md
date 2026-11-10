# MedQuery app (React Native)

The whole of MedQuery as one app for **iPhone, iPad, Android phones and tablets, and the web**, built with [Expo](https://expo.dev) (React Native).

> **Medical disclaimer.** MedQuery gives general health information. It is not medical advice and does not diagnose. In an emergency, call your local emergency number.

## What it does

Five tabs keep everything within reach on a phone:

| Tab | What's there |
|---|---|
| **🔍 Search** | One search bar with suggestions (with body-system icons) and recent searches. Each answer has three sub-tabs: **Answer**, **Sources** and **Best Care**. |
| **📄 Scan** | Lab report scanner: take a photo, choose a photo or PDF, or paste the text. Each value is explained; personal details are skipped. For the most likely condition you also get its Sources and Best Care. |
| **🏥 Care** | A large emergency button with your country's number and ambulance number, plus the hospitals nearest to you (list or map). |
| **★ Saved** | Answers you saved, readable offline, and your recent searches. |
| **⋯ More** | Settings (AI engine, answer language, currency, asking before calls, your area), about MedQuery, privacy and the medical disclaimer. |

A red **SOS** button stays on screen on every other tab.

**Answers** are colour-coded cards (critical, high, medium, info). Tap a heading to fold it; long, detailed answers start folded so they fit the screen. They cover diseases (symptoms, causes, tests, safe home remedies with allergen warnings, prevention, treatments with how each medicine is given and rough costs), tests (every element with normal values, plus your personal ranges by age, sex or pregnancy) and medicines (uses, how they are taken, side effects, cautions, interactions). Each answer has quick and detailed versions, related searches, follow-up questions, "what does this word mean?", **Share** and **Save**.

**Sources ("Verify at the source")** lists the real articles behind the answer, each linking straight to the article: MedlinePlus patient guides, StatPearls chapters (NCBI Bookshelf), Cochrane reviews, open-access guidelines and systematic reviews in PubMed Central, and FDA labels on DailyMed.

**Best Care for {condition}**: type your area or use your current location. Hospitals are ranked for the condition by matching specialty, hospital size, teaching status, 24-hour emergency care and distance (live OpenStreetMap data; Claude re-ranks the real list when available). Switch between list and map, sort by best match, nearest, 24-hour, government, private, size or "has phone", and get directions in Google Maps, Apple Maps, Waze or OpenStreetMap.

**Calling with permission**: Call asks first, with an option not to ask again. On Android, once you allow the phone permission, MedQuery dials directly; on iPhone, iOS shows its own call confirmation; on the web, your calling app opens. Emergency numbers always call in one tap.

**Answer language**: 30+ languages, including most Indian languages. Light and dark mode follow the phone.

## AI engine

Pick one in **Settings**:

| Engine | What you need | Notes |
|---|---|---|
| **Claude** (recommended) | An Anthropic API key from [platform.claude.com](https://platform.claude.com/settings/keys) | Uses `claude-opus-5-5`. The key is stored in the device's secure storage (browser storage on the web) and sent only to Anthropic. Reads photos and PDFs. |
| **Ollama** (free) | [Ollama](https://ollama.com) on a computer on the same Wi-Fi, started with `OLLAMA_HOST=0.0.0.0` and `OLLAMA_ORIGINS=*`, plus `ollama pull qwen3:8b` | Answers come only from the retrieved articles. Less reliable; can't read PDFs. |

Articles, hospitals and the emergency button work without any AI engine.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
cd app
npm install
npx expo start
```

Then press `w` for the web, or scan the QR code with the **Expo Go** app on your phone.

Expo Go can't use the Android "make phone calls" permission, so there Call opens the phone app with the number filled in. Direct dialling works in a real build. Set up EAS once, then build an installable Android app:

```bash
npx eas-cli@latest build:configure
```

```bash
npx eas-cli@latest build --profile preview --platform android
```

To publish the web version as static files (for example on GitHub Pages):

```bash
npm run build:web
```

The site is written to `app/dist/`.

## How the code is laid out

| Path | What it is |
|---|---|
| `App.js` | The app shell: bottom tabs, SOS button, call dialog, saved answers. |
| `src/screens/` | Search, Scan, Care, Saved and More tabs. |
| `src/components/` | Answer cards, Verify at the source, Best Care, hospital list and map, call dialog, report scanner, settings. |
| `src/useCare.js` | Finding and ranking hospitals for a typed place or your current location. |
| `src/saved.js` | Saved answers (offline) and sharing. |
| `src/search.js` | Search pipeline: find articles, then ask the AI to answer from them. |
| `src/ai.js` | Claude (Anthropic SDK) and Ollama engines. |
| `src/phone.js` | Calling: direct dial on Android with permission, otherwise the phone app. |
| `../site/medquery-core.js` | **Shared with the website**: article lookup, hospital ranking, emergency numbers and AI prompts. |
| `src/termIndex.js` | Built-in search suggestions, copied from the website by `npm run sync-index`. |
