# LyricLab

A standalone, client-only songwriting studio built with React, Vite, and TypeScript. No accounts, API keys, LLM, SonicStudio runtime, or external runtime services.

## Canonical repository

[Blazerfool01/LyricLab](https://github.com/Blazerfool01/LyricLab) is the source of truth for code, tests, and documentation. The `main` branch holds the accepted baseline. Future changes should arrive through branches and pull requests with the checks below.

- [Product principles and milestone roadmap](docs/ROADMAP.md)
- [Approved Engine Foundation architecture (A–H)](docs/ENGINE_FOUNDATION.md)
- [Milestone implementation log](docs/ENGINE_IMPLEMENTATION_LOG.md)
- [Engine version and replay policy](docs/ENGINE_VERSIONING.md)
- [Development and contribution workflow](docs/DEVELOPMENT.md)
- [Current portable project / SongSpec format](docs/SONGSPEC.md)
- [Guidance for coding agents](AGENTS.md)

![LyricLab workspace](docs/images/workspace-desktop.png)

## Run

```sh
npm ci
npm run dev
```

The development server listens on port 5173. To use the production offline cache:

```sh
npm run build
npm run preview
```

The production app bundles its fonts, icons, data, and engines and pre-caches its assets in a service worker. Once opened and cached on localhost or HTTPS, it can reopen with the network disabled. An initial web installation requires access to the served assets; a local copy can be served without an internet connection. Development dependency installation requires a network connection unless packages are cached.

## Run the bundled build offline

The earlier downloadable project includes a compiled `dist/` folder. GitHub tracks the source; build `dist/` with `npm run build`, or download the `lyriclab-offline-build` artifact from a successful GitHub Actions run. Serve that folder with any local static server, without installing npm packages. For example, with Python installed:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Internet access is not needed. Opening `index.html` directly with a `file://` URL is not supported by browser module and service-worker rules. Third-party font and library licenses are included in `licenses/`.

## Delivered scope

The v0.1 Style Foundation is implemented, with an initial functional authoring workspace for later milestones:

- Weighted blends across 34 genre/style profiles in eight families, with 11 independent mood choices, rhythm, tempo, voice, instrumentation, bass, drums, production, and mix controls. Chill is a mood modifier; Chillout and Chillhop are separate styles.
- Seeded, deterministic style resolution, normalized genre weights, compatibility guidance, and Compact / Detailed / Annotated compilers.
- A responsive three-panel workspace with a mobile blueprint and inspector.
- Editable lyric sections, section purposes and intensity, section / line locking, reordering, duplicating, deleting, and undo / redo.
- Initial procedural hook and verse drafts using local theme-specific phrase banks; regeneration preserves authored and locked lines. Section variations are recorded independently without changing the song's root seed.
- Confidence-aware end rhyme and syllable analysis, explicit meter targets, avoided-phrase checks, and dismissible guidance for generated or manual text.
- A small reversible dialect vocabulary preview for British / American English. This is an initial vocabulary pack, not a full accent engine.
- Schema-2 browser-local projects, conservative schema-1 migration, autosave, original-input recipe inspection, and separate SongSpec v1 / legacy exports.
- An editable example song for first use.

The entire v1.0 roadmap is **not** declared complete. The current language and verse engines use curated templates and a limited local vocabulary. The A–H Engine Foundation is implemented, including annotation-backed accepted narrative state, bounded deterministic search, shared protection, and exact-profile replay. Product milestones still need broader narrative coverage, pronunciation dictionaries, hook-strength heuristics, richer cadence and dialect packs, a comprehensive blueprint editor, and the v1.0 interoperability release gate. Syllable and rhyme results are estimates, including dialect pronunciation differences. Project envelope v2 and portable SongSpec v1 are independently versioned. Unsupported project versions are safely rejected; unavailable replay dependencies preserve accepted lyrics.

## Data and architecture

- `src/domain/foundation/` — pure contracts, indexed catalogs, deterministic streams, engines, protection, migration, replay, and workspace operations.
- `src/domain/types.ts` — legacy editor projection types.
- `src/domain/data.ts` — stable genre IDs, family-grouped style profiles, declarative sound / language data, and delivery ranges.
- `src/domain/engines.ts` — pure seeded style, lyric, rhyme, cadence, and dialect utilities, independent of React.
- `src/domain/project.ts` — validated serialization, local project loading, export, and example project.
- `src/App.tsx` — studio interactions.
- `src/styles.css` — responsive visual system.
- `vite.config.ts` — build-time production asset pre-cache.

The compiler is a derived value and is not stored. Project JSON retains the blueprint, accepted lyrics with protection/provenance, independent counters, historical recipes, and editor settings. Portable SongSpec carries descriptive creative intent and lyrics. Saving uses `lyriclab.projects.v1` in LocalStorage; browser storage belongs to the device and browser profile. Export projects for durable backups. Corrupt storage is reported and not silently replaced.

## Verification

```sh
npm test
npm run build
npm run test:ui
```

UI tests use the production preview on port 4173 and Playwright Chromium. On first setup, run `npx playwright install --with-deps chromium`. To use an existing system browser instead, run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:ui`. Tests cover style updates, locked/manual edits, save and reopen, hook insertion, JSON export and re-import, and network-disabled reopening. Reference screenshots are in `docs/images/`. GitHub Actions runs the domain tests, production build, and browser suite on pushes to `main` and on pull requests. Fixed v0.1, E, and F fixtures protect historical output. Engine Foundation checks cover domain boundaries, migration/serialization, protection, narrative evidence, exact replay, and the integrated offline workflow; stage evidence is recorded in docs/ENGINE_IMPLEMENTATION_LOG.md.

Text fields have their native undo behavior. The toolbar undo / redo tracks project editing actions. `Ctrl/Cmd+S` exports a complete project backup; `Escape` dismisses dialogs.
