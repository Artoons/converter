# ARTOONS Universal File Converter

Open-source, local-first universal file converter built with **React + TypeScript + Tailwind CSS + Vite** that compiles from a single codebase into two targets:

1. **Web Application** — client-side conversions in the browser sandbox (50 MB per-file cap, strictly separated `<AdSlot />` rails, and an itch.io-style optional tipping + download flow).
2. **Tauri v2 Desktop Application** — 100% ad-free, offline, unlimited file sizes, with an in-app **Modular Engine Manager** (~15 MB core installer; optional conversion packs downloaded on demand into `AppLocalData/engines/`).

---

## Modular Install Packs & Sizes

Instead of shipping a 500 MB installer, users choose only what they convert (e.g. *Images only*, *Video & Audio*, *Documents*, *Pro Images*, or *Everything*):

| Pack | Engine | Download Size | Unlocks |
| :--- | :--- | :--- | :--- |
| **Images & Data (Core)** | Built-in Canvas + TS parsers | **0 MB** *(included in ~15 MB core)* | `PNG`, `JPG`, `WEBP`, `BMP`, `ICO`, `SVG`, `JSON`, `CSV`, `TSV`, `YAML`, `TXT`, `MD`, `HTML` |
| **Video & Audio** | FFmpeg Media Engine | **~75 MB** | `MP4`, `MKV`, `MOV`, `WEBM`, `MP3`, `WAV`, `FLAC`, `OGG`, `GIF` |
| **Documents** | Pandoc & Typst Engine | **~45 MB** | `DOCX`, `PDF`, `EPUB`, `MD`, `HTML`, `LaTeX` |
| **Pro Raster** | ImageMagick Engine | **~35 MB** | `TIFF`, `RAW`, `EPS`, `GIF`, multi-layer `ICO` |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Generate app icons for Tauri
node scripts/generate-icon.mjs

# 3. Copy environment template (optional)
cp .env.example .env

# 4a. Start the Web App in your browser
npm run dev

# 4b. Start the Tauri v2 Desktop App (requires Rust toolchain)
npm run tauri dev
```

### Pinning Engine SHA-256 Hashes for Production Releases

Before cutting a production desktop release, pin the upstream SHA-256 digests in `src-tauri/engines.json`:

```bash
npm run pin-hashes
```

---

## Project Layout

- `src/utils/env.ts` — exports `isDesktopApp = (): boolean => Boolean(window.__TAURI_INTERNALS__)`
- `src/components/MenuBar.tsx` — classic top bar (`File`, `Edit`, `Modules`, `Help`)
- `src/components/AdSlot.tsx` — strict 3-column web ad rail inside `<aside>` with persistent `ADVERTISEMENT` header + house fallback card
- `src/components/DownloadModal.tsx` — 2-step itch.io-style optional tipping modal + OS-aware installer picker + modular pack size planner + SHA-256 checksum box
- `src/components/ModuleManagerModal.tsx` — on-demand engine installer (`Modules -> Manage Engines`)
- `src/components/PackPicker.tsx` — interactive preset selector (*Images only*, *Video & Audio*, *Documents*, *Pro Images*, *Everything*) with live size totals
- `src/core/` — magic-byte + extension detection, format routing table, and browser converters (`image.ts`, `data.ts`, `docs.ts`, `audio.ts`)
- `src-tauri/` — Tauri v2 Rust backend (`get_modules_status`, `install_module`, `uninstall_module`, `convert_file_native`) and `capabilities/default.json`
- `.github/workflows/release.yml` — multi-OS GitHub Actions release pipeline with `checksums-sha256.txt` and SignPath.io code-signing hook
