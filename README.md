# MedQuery

A smart search engine for medical questions. One search bar for diseases and their pathology, medical tests and their normal values, medicines and how they're taken, and any health question, plus a private lab-report scanner and a "Care near you" hospital finder.

> **Medical disclaimer.** MedQuery gives general health information for learning and reference. It is **not** medical advice and does **not** diagnose. Answers can be incomplete or wrong. Always talk to a qualified doctor about your health, and never delay or ignore medical advice because of something you read here. **In an emergency, call your local emergency number (112 in India).**

## What's in this repository

| Folder | What it is | Where it runs |
|---|---|---|
| [`site/`](site/) | The MedQuery app: `index.html` (the whole page) and `local-ai.js` (the free on-device AI). | **Inside Claude:** answers come from Claude. **Anywhere else** (e.g. GitHub Pages): answers come from an AI running free on the visitor's own device. |
| [`care-map/`](care-map/) | MedQuery Care Map: a live street map of nearby hospitals and clinics, sorted nearest first. | Any static web host, such as GitHub Pages. Uses OpenStreetMap; needs no Claude and no API keys. |
| [`docs/`](docs/) | Notes, including [`LEARNING.md`](docs/LEARNING.md), a beginner's guide to Git, GitHub and the code in this project. | Read on GitHub. |

## Features

- **One search bar** with live suggestions and pictures as you type.
- **Answers as 3D cards**, colour-coded by importance (neon red, orange, yellow and cyan), short by default with a detailed version on request.
- **Diseases:** definition, symptoms, causes, tests to confirm, safe home remedies with allergen warnings, prevention, treatments with how each medicine is given and rough costs.
- **Tests:** every element measured with normal values, and a box for age, sex and pregnancy to get personal ranges.
- **Report scanner:** upload or paste a lab report (image or PDF). Personal details are skipped; each value gets a card showing how far it is from normal, what it means, and possible inferences.
- **Care near you:** nearby hospitals sorted by distance, directions in your map app, and copy and call buttons for 24/7 numbers, plus a one-tap emergency button.
- **Open health databases:** CDC WONDER (US statistics), WHO's Global Index Medicus (research from low- and middle-income countries), UK Biobank studies, the 1000 Genomes Project and HealthData.gov, alongside open-access journals and public guidelines.
- **Experimental tag:** anything not approved for routine use (only in clinical trials or early research) is clearly tagged **Experimental**, with links to ClinicalTrials.gov and the WHO trials registry.
- **Translate** into 130+ languages, **highlight any word** for a definition, and answers based on **open-access** medical sources with a clear note when evidence is uncertain.

## Free on-device AI (outside Claude)

When MedQuery is opened outside Claude, it runs its AI on the visitor's own device, so it's free for everyone and questions stay private.

- **Set up once, then search.** Searches and reports wait until the AI is set up. The **AI** button at the top right always shows the status (*not set up*, *setting up 42%*, *ready*), and a banner under the search bar offers **Set up AI** until it's done.
- **The setup screen** checks the device (browser support, memory, free storage, mobile data, battery), recommends a size, and says exactly what it will use: download size, storage, memory while running, graphics chip and battery use, and what goes over the internet per search. It shows progress with time left; if the connection drops it continues where it stopped. Your search starts automatically when setup finishes.
- **Sizes** (Qwen 3.5, run with WebLLM in Chrome or Edge with WebGPU): Smallest 1.6 GB, Light 2.3 GB, Standard 3.9 GB, Most accurate 6.5 GB. Memory is freed after 10 minutes without a search, and the AI can be removed from the device at any time.
- **No WebGPU?** The setup screen offers step-by-step alternatives: Chrome/Edge on a computer, the free [Ollama](https://ollama.com) app (copy-paste commands for Windows, Mac and Linux), or MedQuery inside Claude.
- **Grounded answers:** before answering, MedQuery looks the topic up in free official sources and tells the model to answer only from them: MeSH definitions, MedlinePlus and Clinical Tables (NLM), openFDA labels, RxNav, Cochrane reviews and open-access research (Europe PMC), Mondo/Orphanet rare-disease definitions, published UK Biobank studies, 1000 Genomes variant frequencies (Ensembl) and ChEMBL approval stages. HealthData.gov datasets are listed as links.
- **Experimental treatments** from ClinicalTrials.gov (trials recruiting now, phases 1–3) are shown as they are, tagged **Experimental**, not rewritten by the AI.
- **Highlighted words** are defined from MeSH first, which works even before the AI is set up.
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

[MIT](LICENSE). The project uses [Leaflet](https://leafletjs.com) (BSD-2), [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0), [WebLLM](https://github.com/mlc-ai/web-llm) (Apache-2.0), [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0), open models such as Qwen under their own licences, Google Fonts (SIL Open Font License) and [OpenStreetMap](https://www.openstreetmap.org/copyright) data (ODbL, attribution shown on the map).
