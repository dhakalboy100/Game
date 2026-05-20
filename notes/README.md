# Progress Note Formatter

A single-page web app that runs a small LLM **entirely in your phone's browser** (no server, no API) and turns a free-form shift narrative into a structured progress note organized under goal headings you provide.

## How it works

- Model: **Llama 3.2 1B Instruct** (~700 MB, quantized) via [WebLLM](https://github.com/mlc-ai/web-llm) on WebGPU.
- First visit downloads the model to your device. After that, the app works offline.
- Your text never leaves the device.

## Hosting on GitHub Pages

1. Go to **Settings → Pages** in this repo.
2. Set **Source** to *Deploy from a branch*, branch `main` (or whichever branch holds these files), folder `/ (root)`.
3. Save. After a minute the site goes live at `https://<your-username>.github.io/Game/`.
4. The notes app is at `https://<your-username>.github.io/Game/notes/`.

## Installing on your phone

- **iPhone (Safari):** Open the `/notes/` URL → tap Share → **Add to Home Screen**.
- **Android (Chrome):** Open the URL → menu (⋮) → **Install app** or **Add to Home screen**.

Once installed, it launches like a native app, full-screen, with its own icon.

## Device requirements

- **iPhone:** iOS 18.2+ recommended (WebGPU). Newer iPhone Pro / iPhone 16 series perform best.
- **Android:** A device from ~2022 or newer running Chrome.
- **First load** needs ~1 GB free storage and a decent network. After that, it's offline-only.

## Using it

1. Paste your goal headings in the **Goals** box, one per line, exactly as you want them to appear in the final note. Example:
   ```
   Residential Goal #1: Community access
   Residential Goal #2: Choice-making
   Specialty Services Goal #1: Transition support
   ```
2. In the **Today's narrative** box, tap inside, then tap the **microphone** on your phone's keyboard and dictate the shift in plain speech. Or type it.
3. Tap **Format Note**. The structured note streams in below.
4. Tap **Copy** to put it on your clipboard.

## Privacy notes

- The model and your text run on-device. Nothing is uploaded.
- The app keeps no history. Closing the tab clears your text.
- For HIPAA: avoid typing names or other identifiers in the app. Refer to the person as "he/she/they" and paste the formatted note into your agency's record system, where identifiers belong. Confirm the workflow with your agency's privacy officer before relying on it for live notes.

## Files

- `index.html` – UI
- `app.js` – WebLLM + format logic
- `style.css` – mobile-first styles
- `manifest.webmanifest` + `sw.js` + `icon.svg` – PWA / installable-app metadata
