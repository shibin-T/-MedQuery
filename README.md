# MedQuery

A smart search engine for medical questions. One search bar for diseases and their pathology, medical tests and their normal values, medicines and how they're taken, and any health question, plus a private lab-report scanner and a "Care near you" hospital finder.

> **Medical disclaimer.** MedQuery gives general health information for learning and reference. It is **not** medical advice and does **not** diagnose. Answers can be incomplete or wrong. Always talk to a qualified doctor about your health, and never delay or ignore medical advice because of something you read here. **In an emergency, call your local emergency number (112 in India).**

## What's in this repository

| Folder | What it is | Where it runs |
|---|---|---|
| [`site/`](site/) | The MedQuery app: one self-contained web page (HTML, CSS and JavaScript in one file). | Inside Claude, as a published artifact. Answers, translation and report scanning use Claude through the page's built-in connection, so they only work there. |
| [`care-map/`](care-map/) | MedQuery Care Map: a live street map of nearby hospitals and clinics, sorted nearest first. | Any static web host, such as GitHub Pages. Uses OpenStreetMap; needs no Claude and no API keys. |
| [`docs/`](docs/) | Notes, including [`LEARNING.md`](docs/LEARNING.md), a beginner's guide to Git, GitHub and the code in this project. | Read on GitHub. |

## Features

- **One search bar** with live suggestions and pictures as you type.
- **Answers as 3D cards**, colour-coded by importance (neon red, orange, yellow and cyan), short by default with a detailed version on request.
- **Diseases:** definition, symptoms, causes, tests to confirm, safe home remedies with allergen warnings, prevention, treatments with how each medicine is given and rough costs.
- **Tests:** every element measured with normal values, and a box for age, sex and pregnancy to get personal ranges.
- **Report scanner:** upload or paste a lab report (image or PDF). Personal details are skipped; each value gets a card showing how far it is from normal, what it means, and possible inferences.
- **Care near you:** nearby hospitals sorted by distance, directions in your map app, and copy and call buttons for 24/7 numbers, plus a one-tap emergency button.
- **Translate** into 130+ languages, **highlight any word** for a definition, and answers based on **open-access** medical sources with a clear note when evidence is uncertain.

## How the pieces fit together

```
           you type a search / paste a report
                         │
                 site/index.html  (runs inside Claude)
                         │
     ┌───────────────────┼─────────────────────┐
  Claude (answers,   browser storage        link: "Open live map"
  report reading,    (recent searches,             │
  translation)       city, language)       care-map/index.html
                                           (OpenStreetMap, any web host)
```

## Licence

[MIT](LICENSE). The project uses [Leaflet](https://leafletjs.com) (BSD-2), [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0), Google Fonts (SIL Open Font License) and [OpenStreetMap](https://www.openstreetmap.org/copyright) data (ODbL, attribution shown on the map).
