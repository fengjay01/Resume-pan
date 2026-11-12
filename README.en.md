# Resume-Pan

[简体中文](./README.md) · English

> A resume builder that runs entirely on your own machine: write, typeset, export, import — nothing is ever uploaded.

Resume-Pan is a free resume builder for engineers and technical professionals. It is purely client-side: no accounts, no backend, no analytics, and your resumes never leave the browser. The project ships both a **web app** and an **Electron desktop app**, sharing the same editor, rendering engine, and import/export pipeline. Current version: **0.1.0**.

Windows installers are published on [GitHub Releases](https://github.com/fengjay01/Resume-pan/releases/tag/v0.1.0) (x64 / arm64 installers and portable archives; Windows 10/11 64-bit only).

## Features

- **Modular editing** — basic info, education, skills, work experience, projects, and custom sections; rich text with bold, lists, and indentation
- **True WYSIWYG** — the editor and the paper use the same fonts, sizes, line heights, and content width; two-pass rendering (offscreen measurement → greedy pagination) keeps preview and export aligned
- **Layout control** — 6 section-heading styles × 8 preset theme colors, plus a custom color picker; font size and five spacing values adjustable in 0.5px steps
- **PDF export** — vector PDF (selectable, searchable text through the browser print pipeline) and image PDF (compatibility mode), no watermark; batch export multiple resumes, optionally writing straight into a chosen folder
- **Import** — PDF (text parsing / Chinese OCR for scans), Word `.docx`, and plain text, with automatic section and contact detection; the upload field accepts multiple files for batch import
- **Lossless round-trip** — PDFs exported by this app embed compressed resume data in the `/Keywords` metadata field, so re-importing restores the resume 1:1, including formatting, without polluting copyable text
- **Resume management** — unlimited pinning, drag-and-drop ordering, sort by name / modified time, and a trash bin (30-day retention)
- **Offline-ready** — bundled Inter, Noto Sans SC, Noto Serif SC, LXGW WenKai, and MiSans web fonts; PDF.js cMaps/wasm and the Tesseract Chinese model are vendored locally and loaded on demand

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Vite 5 · React 18 · TypeScript 5 · Tailwind CSS 3 |
| State | zustand 4 (`persist` to localStorage) |
| PDF | PDF.js 6 (parsing) · jsPDF + html2canvas (image export) · browser `printToPDF` (vector export) |
| OCR | Tesseract.js 7 with the Simplified Chinese model (scans only) |
| Desktop | Electron 44 (Chromium 152), hidden BrowserWindow + `webContents.printToPDF` |
| Packaging | electron-builder 26 (Windows only, built locally), output in `desktop/releases/v<version>/` |

## Repository layout

```
.
├── app/                       Web frontend
│   ├── src/
│   │   ├── pages/             Home / templates / resumes / trash / editor …
│   │   ├── components/        editor, resume renderer, site UI, shared components
│   │   ├── lib/               pagination, parsing, export, fonts, persistence
│   │   ├── store/             zustand stores (resumes, trash, editor tabs)
│   │   └── types/
│   └── public/                Static assets (web fonts, PDF.js, Tesseract)
├── desktop/                   Electron app (standalone copy, independent of app/)
│   ├── app/                   Frontend copy; only the export service URL differs
│   ├── electron/              Main process: static hosting + local export service
│   ├── resources/             Build resources (icon.ico / icon.png / icons/)
│   ├── tools/                 Packaging, release, verification and debug scripts
│   │   ├── pack-release.mjs    One-command Windows release build
│   │   ├── make-release.mjs    Asset renaming / portable 7z / SHA256 sums
│   │   └── verify-release.mjs  Artifact checks (/ping, /export PDF, portable data)
│   ├── .build-env/            Build environment (generated, ignored)
│   │   ├── cache/electron/    Electron binary archives
│   │   ├── cache/builder/     NSIS / winCodeSign tools
│   │   ├── cache/npm/         npm / npx cache
│   │   ├── tmp/               Build-time TMP / TEMP
│   │   └── out/<arch>/        Raw electron-builder output
│   ├── releases/              Delivery layer: versioned archives (ignored)
│   │   └── v0.1.0/            All assets for this version; one v<version>/ per release
│   ├── data/                  Dev-mode runtime data (resumes / trash / preferences / port memory; ignored)
│   ├── electron-builder.yml   Build config (Windows only)
│   └── README-DESKTOP.md      Detailed desktop notes
├── tools/                     Dev & test scripts (not part of the build)
│   ├── tests/ seeds/ fixtures/   Regression tests, sample resumes, fixtures
│   ├── export-service.mjs    Headless Chrome render service for vector export (port 8790)
│   ├── shot.mjs              Browser smoke tests / screenshots
│   ├── roundtrip.mjs         Export → import fidelity test
│   └── batch-*-check.mjs     Batch export / import end-to-end tests
├── docs/使用手册.md            User manual (Chinese)
└── LICENSE*                   Dual-license texts
```

## Getting started (web)

Requires Node.js 18+ and npm.

```bash
git clone https://github.com/fengjay01/Resume-pan.git
cd Resume-pan/app
npm install
npm run dev          # http://127.0.0.1:5173
```

```bash
npm test             # Logic regression: rendering / new entries / import parsing
npm run typecheck    # TypeScript check
npm run build        # Output to app/dist
npm run preview      # Preview the production build: http://127.0.0.1:4173
```

In dev mode a Vite plugin automatically starts `tools/export-service.mjs` (port 8790) for vector PDF export; a local Chrome / Edge installation is required. If the service is unavailable, export falls back to the browser print dialog.

Browser end-to-end checks (start `npm run dev` first):

```bash
node tools/shot.mjs --url=http://127.0.0.1:5173/resumes --seed=tools/seeds/seed-multi.json --out=shot.png
node tools/roundtrip.mjs                    # Export → import 1:1 restore
node tools/batch-export-check.mjs --mode=vector
node tools/batch-import-check.mjs
```

## Download & install (Windows desktop)

Download `v0.1.0` from [Releases](https://github.com/fengjay01/Resume-pan/releases/tag/v0.1.0):

| File | For |
| --- | --- |
| `resume-pan-desktop-v0.1.0-x64-Setup.exe` | 64-bit Intel / AMD, Windows 10 / 11 |
| `resume-pan-desktop-v0.1.0-arm64-Setup.exe` | ARM64 Windows devices |
| `resume-pan-desktop-v0.1.0-win_<arch>-green.7z` | Portable archive, extract and run |

- Run the installer (you can choose the folder), or extract the portable archive and launch `Resume-Pan.exe`.
- Both editions keep resume data in a **`data/` folder next to the executable** — copy the whole folder to carry your data, and uninstalling or reinstalling never deletes it.
- **Builds are unsigned**: SmartScreen may show "Unknown publisher" on first run. Choose "More info → Run anyway"; this is expected.
- Only Windows x64 / arm64 is published. macOS / Linux are not supported yet (Electron 44 ships 64-bit binaries only; macOS signing requires macOS, Linux packages require a Linux runner).

## Desktop development (Electron)

The desktop build ships its own Chromium, so export no longer depends on a system Chrome.

```bash
cd desktop
npm install                 # Electron + electron-builder + 7zip-bin
npm --prefix app install    # Frontend dependencies
npm run build               # tsc + vite build → desktop/app/dist
npm start                   # Launch the app (local service probes from port 8790)
npm run smoke               # Headless smoke test (/ping, /export)
npm run pack:win            # Build Windows x64 / arm64 release → desktop/releases/v<version>/
node tools/verify-release.mjs --out=.build-env/out   # Verify artifacts
```

Dev mode needs two terminals: `npm run dev:vite` and `npm run dev`.

**Layered directories, zero writes to C:** all downloads, caches, temp files and raw build output stay in `desktop/.build-env/` (Electron archives, NSIS tools, npm cache, TMP/TEMP, per-arch output); only final assets go to `desktop/releases/v<version>/`. `tools/pack-release.mjs` pins these paths inside the project via environment variables and CLI overrides, with `.npmrc` and `.gitignore` as a fallback. Measured before/after: no size change in any C: cache directory.

**Versioned archives / upgrading**: final assets live in `desktop/releases/v<version>/` (`v0.1.0/` today). Bump `version` in `package.json` and run `npm run pack:win` — a new version folder is created and older ones are left untouched. Use `node tools/verify-release.mjs --version=0.1.0` to verify any historical version.

**Data directory**: dev builds use `desktop/data/`; packaged builds (installer and portable alike) always use `data/` next to the executable — neither writes to the system user-data folder on C:. The old system folder (`%APPDATA%/resume-pan-desktop` on Windows) is a **read-only** migration source, with the migration marker written to the destination. Migration carries `service-port.txt` too: storage is isolated per origin, so a port change makes resumes appear to vanish. This folder contains personal information, is listed in `.gitignore`, and must never be committed. Override it with `RESUME_PAN_DATA_DIR` or from the account page.

See [desktop/README-DESKTOP.md](./desktop/README-DESKTOP.md) for single-instance locking, download location, DevTools, build options and size optimizations.

## Data & privacy

- Resumes live in browser `localStorage` (key `xl-resume-data`), storing only the resume list and the trash; the desktop app persists them in `desktop/data/` in dev mode and in `data/` next to the executable when packaged — never in the system user-data folder on C: (configurable on the account page). This folder holds personal data and is ignored by Git
- Storage is isolated per origin: `127.0.0.1:5173` (web dev), `:4173` (production preview), and from `:8790` upward (desktop, with the actual port remembered in `service-port.txt`) are three independent datasets. Not seeing your resumes after switching how you launch the app is expected
- Clearing browser data, switching browsers, or using private mode will lose your resumes; export a JSON backup from the account page, or keep exported PDFs, which can be re-imported 1:1
- No resume content is ever sent to a server; fonts, PDF.js, and OCR models are all local static assets
- Deletion is soft-delete: trash entries are purged automatically after 30 days

## Known limitations

- Vector export requires a local Chrome (web) or the bundled Chromium (desktop); font and print-engine differences across machines may cause ±1px layout drift
- OCR ships with the Simplified Chinese model only
- Desktop releases currently cover Windows x64 / arm64 only; macOS / Linux are not supported yet. Builds are unsigned, so SmartScreen may show "Unknown publisher"
- No cloud sync or cross-device sync

## License

Dual-licensed — pick whichever suits you:

- [MIT License](./LICENSE-MIT)
- [Apache License 2.0](./LICENSE-APACHE)

`SPDX-License-Identifier: MIT OR Apache-2.0`; see [LICENSE](./LICENSE) for the full statement. Third-party dependencies keep their own licenses, listed in `app/package.json` and `desktop/package.json`.
