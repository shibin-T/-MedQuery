# MedQuery

A smart search engine for medical questions. One search bar for diseases and their pathology, medical tests and their normal values, medicines and how they're taken, and any health question, plus a private lab-report scanner and a "Care near you" hospital finder.

> **Medical disclaimer.** MedQuery gives general health information for learning and reference. It is **not** medical advice and does **not** diagnose. Answers can be incomplete or wrong. Always talk to a qualified doctor about your health, and never delay or ignore medical advice because of something you read here. **In an emergency, call your local emergency number (112 in India).**

## What's in this repository

| Folder | What it is | Where it runs |
|---|---|---|
| [`site/`](site/) | The MedQuery website: `index.html` (the whole page), `local-ai.js` (the free on-device AI) and `medquery-core.js` (article lookup, hospital ranking and prompts, shared with the app). | **Inside Claude:** answers come from Claude. **Anywhere else** (e.g. GitHub Pages): answers come from an AI running free on the visitor's own device. |
| [`app/`](app/) | **MedQuery app** for iPhone, Android and the web, built with React Native (Expo). See [`app/README.md`](app/README.md). | Phones and tablets (Expo Go or an app build), and any browser. Answers come from Claude (your API key) or Ollama. |
| [`care-map/`](care-map/) | MedQuery Care Map: a live street map of nearby hospitals and clinics, sorted nearest first. | Any static web host, such as GitHub Pages. Uses OpenStreetMap; needs no Claude and no API keys. |
| [`docs/`](docs/) | Notes, including [`LEARNING.md`](docs/LEARNING.md), a beginner's guide to Git, GitHub and the code in this project. | Read on GitHub. |

## Features

- **One search bar** with live suggestions and pictures as you type.
- **Answers as 3D cards**, colour-coded by importance (neon red, orange, yellow and cyan), short by default with a detailed version on request.
- **Diseases:** definition, symptoms, causes, tests to confirm, safe home remedies with allergen warnings, prevention, treatments with how each medicine is given and rough costs.
- **Tests:** every element measured with normal values, and a box for age, sex and pregnancy to get personal ranges.
- **Report scanner:** upload or paste a lab report (image or PDF). Personal details are skipped; each value gets a card showing how far it is from normal, what it means, and possible inferences.
- **Verify at the source:** the real articles behind each answer, each linking straight to the article: MedlinePlus, StatPearls (NCBI Bookshelf), Cochrane reviews, open-access guidelines and systematic reviews in PubMed Central, and FDA labels on DailyMed.
- **Best Care for {condition}:** enter your location (or use your current one) to see the hospitals best suited to the condition you searched, with directions and phone numbers. Calls ask your permission first.
- **Care near you:** nearby hospitals sorted by distance, directions in your map app, and copy and call buttons for 24/7 numbers, plus a one-tap emergency button.
- **Translate** into 130+ languages, **highlight any word** for a definition, and answers based on **open-access** medical sources with a clear note when evidence is uncertain.

## Free on-device AI (outside Claude)

When MedQuery is opened outside Claude, it runs its AI on the visitor's own device, so it's free for everyone and questions stay private.

- **In the browser** (no install): the first search asks to download a small open model once (Qwen 3.5, about 2–4 GB, chosen to suit the device). Needs a recent Chrome or Edge with WebGPU.
- **With Ollama** (computers): install [Ollama](https://ollama.com), run `ollama pull qwen3:8b`, allow the site with `OLLAMA_ORIGINS=https://shibin-t.github.io`, then pick **Ollama** under *On-device AI* (top right).
- **Grounded answers:** before answering, MedQuery looks the topic up in free official sources (US National Library of Medicine's MedlinePlus and Clinical Tables, openFDA drug labels, RxNav, Europe PMC open-access research) and tells the model to answer only from them. Source links appear with every answer.
- **Reports** are read with on-device text recognition (Tesseract.js); nothing is uploaded anywhere.
- **Care near you** uses live OpenStreetMap hospital data.

Small on-device models are less reliable than Claude, especially in Indian languages. Answers say so when sources are thin.

### Run it on GitHub Pages
1. Repo **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**.
2. Open `https://shibin-t.github.io/-MedQuery/site/` after a minute or two.

## How the pieces fit together

```
              you type a search / paste a report
                            │
                     site/index.html
                            │
          inside Claude?  ──┴──  anywhere else?
                │                      │
        Claude answers         site/local-ai.js
                               ├─ AI on your device (WebLLM or Ollama)
                               ├─ facts from MedlinePlus, openFDA, Europe PMC
                               ├─ reports read on-device (Tesseract.js)
                               └─ hospitals from OpenStreetMap
```

## Licence

[MIT](LICENSE). The project uses [React Native](https://reactnative.dev) and [Expo](https://expo.dev) (MIT), the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (MIT), [Leaflet](https://leafletjs.com) (BSD-2), [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0), [WebLLM](https://github.com/mlc-ai/web-llm) (Apache-2.0), [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0), open models such as Qwen under their own licences, Google Fonts (SIL Open Font License) and [OpenStreetMap](https://www.openstreetmap.org/copyright) data (ODbL, attribution shown on the map).
