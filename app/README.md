# MedQuery app (React Native)

The whole of MedQuery as one app for **iPhone, iPad, Android phones and tablets, and the web**, built with [Expo](https://expo.dev) (React Native).

> **Medical disclaimer.** MedQuery gives general health information. It is not medical advice and does not diagnose. In an emergency, call your local emergency number.

## What it does

- **One search bar** for diseases, tests, medicines and health questions, with suggestions and recent searches.
- **Colour-coded answers** (critical, high, medium, info), quick or detailed, with related searches, follow-up questions and a "what does this word mean?" box.
- **Tests:** every element with normal values, and personal ranges for your age, sex or pregnancy.
- **Treatments** with how each medicine is given and rough costs in your currency.
- **Verify at the source:** the real articles behind each answer, each linking straight to the article: MedlinePlus patient guides, StatPearls chapters (NCBI Bookshelf), Cochrane reviews, open-access guidelines and systematic reviews in PubMed Central, and FDA labels on DailyMed.
- **Best Care for {condition}:** type your area or use your current location to see the hospitals best suited to the condition, ranked by matching specialty, hospital size, teaching status, 24-hour emergency care and distance (live OpenStreetMap data; Claude re-ranks the real list when available). Each has directions in your map app and a phone number.
- **Calling with permission:** tapping Call asks first (with "don't ask again"). On Android, after you allow the phone permission, MedQuery dials the number directly; on iPhone, iOS shows its own call confirmation; on the web, your calling app opens.
- **Emergency button** with your local number, always one tap.
- **Lab report scanner:** take a photo or pick a PDF; personal details are skipped and each value is explained.
- **Answer language:** 30+ languages, including most Indian languages.

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
| `App.js` | The screen: search, answer, report scanner, emergency button. |
| `src/components/` | Answer cards, Verify at the source, Best Care, the call dialog, the report scanner, settings. |
| `src/search.js` | Search pipeline: find articles, then ask the AI to answer from them. |
| `src/ai.js` | Claude (Anthropic SDK) and Ollama engines. |
| `src/phone.js` | Calling: direct dial on Android with permission, otherwise the phone app. |
| `../site/medquery-core.js` | **Shared with the website**: article lookup, hospital ranking, emergency numbers and AI prompts. |
| `src/termIndex.js` | Built-in search suggestions, copied from the website by `npm run sync-index`. |
