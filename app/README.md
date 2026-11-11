# MedQuery phone app

The phone app is the **same code as the website** (`../site/`, `../care-map/`), packaged with
[Capacitor](https://capacitorjs.com) (free and open source, MIT licence). There is nothing to keep in sync by hand:
every feature you add to the site is in the app on the next build.

| Way to use MedQuery on a phone | Cost | Updates |
|---|---|---|
| **Phone Preview** in any browser: `https://shibin-t.github.io/-MedQuery/preview/` | Free | Reloads by itself about 1 minute after you push |
| **Web app**: open `…/-MedQuery/site/` on the phone → browser menu → *Install app* / *Add to Home Screen* (Android and iPhone) | Free | Every time it's opened online; an *update ready* banner appears if it was already open |
| **Android app (.apk)** from the [`app-latest` release](https://github.com/shibin-T/-medquery/releases/tag/app-latest) | Free | Downloads new web code by itself and offers **Restart now**: no reinstall |
| iPhone App Store app | Needs a Mac + Apple Developer account (US$99/year) | Not set up; iPhone users use the web app instead |

## How a change reaches phones

```
you push to main (or edit a file on github.com)
   │
   ├─ GitHub Pages (~1 min) ─► Phone Preview reloads · web app shows "A new version is ready"
   │
   └─ GitHub Actions "Build Android app" (~5 min)
         ├─ MedQuery.apk  → the app-latest release (for new installs)
         └─ bundle.zip    → installed apps download it and switch on "Restart now" / next launch
```

You only need a new **APK** install if the Android part itself changes (this folder's `android/`,
plugins, permissions). Changes to `site/` and `care-map/` arrive by themselves.

## Files in this folder

| File | What it does |
|---|---|
| `package.json` | The Capacitor packages and handy commands (`npm run build`, `npm run apk`, `npm run icons`). |
| `capacitor.config.json` | App name and id, and plugin settings. The live-update plugin's cloud features and usage statistics are switched **off**; updates come only from this repository. |
| `scripts/build-web.mjs` | Copies `site/`, `care-map/` and `icons/` into `www/` and adds Capacitor's small `capacitor.js`. |
| `android/` | The Android Studio project. `AndroidManifest.xml` asks for location (Care near you) and camera (photographing a report). |
| `android/app/medquery-shared.keystore` | A signing key kept in the repository on purpose, so every APK GitHub builds installs over the last one. It is **not secret**: fine for sharing the app yourself, but the Play Store needs your own private key kept out of the repository. |
| `assets/icon-only.png` | Source for the Android icons (`npm run icons` regenerates them). |

The phone-only behaviour lives in `../site/mobile.js` (it is loaded outside Claude only): Android **Back** button
(closes pop-ups → back to the search screen → leaves the app), status-bar colours, live updates, and for the
web app the install hint, offline support (`../sw.js`) and the update banner.

## Build the APK on your own computer (optional)

GitHub builds it for you, so this is only for experimenting. You need Node.js 22+, and
[Android Studio](https://developer.android.com/studio) (for Java 21 and the Android SDK).

```bash
cd app
npm install
npm run android     # copies the site in, then opens the project in Android Studio (press ▶ to run on a phone or emulator)
npm run apk         # or build an APK from the command line → android/app/build/outputs/apk/debug/
```

## What works where

All of MedQuery's features run in the app, with these differences from the website:

- **Online AI through Puter** needs a pop-up sign-in window, which the Android app can't show. Use the web app for
  Puter, or set up MedQuery's own server (`../worker/`), which needs no sign-in and works everywhere.
- **Downloaded AI (WebLLM)** needs WebGPU and plenty of memory; most phones should use the **Smallest** size or the online AI.
- **Ollama** runs on a computer, not on the phone. The Android app can reach Ollama on a computer on the same Wi-Fi.
- Features that only exist **inside Claude** (Claude's own answers, shared design tokens, Figma sync) aren't part of
  the GitHub edition, the same as on GitHub Pages.
