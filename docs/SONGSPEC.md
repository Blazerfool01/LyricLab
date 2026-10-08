# Current project and SongSpec format

Status: implemented schema version 1; broader interoperability contract is scheduled to freeze at v1.0. The authoritative TypeScript types are in [types.ts](../src/domain/types.ts), with import validation in [project.ts](../src/domain/project.ts).

The project export and SongSpec export currently contain the same data shape. Their filenames differ (`.lyriclab.json` and `.SongSpec.json`). Section lyrics are nested inside each section, and the voice is nested inside `style`. These implementation details differ from the original roadmap's illustrative flat shape. Consumers should follow the actual versioned types.

## Top-level fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Currently `1`; unsupported versions are rejected safely. |
| `app` | `LyricLab`. |
| `id` | Stable project identifier within local storage. |
| `title`, `concept` | Song title and semantic concept. |
| `seed` | Explicit integer for deterministic derivation. |
| `style` | Weighted genre/mood choices, BPM, rhythm, voice, bass, drums, instrumentation, production, and mix. |
| `language` | Theme, secondary theme, perspective, register, motif, preferred/avoided terms, dialect, and strength. |
| `structure` | Ordered sections, including purpose, intensity, rhyme, cadence, locks, and editable lyrics. |
| `settings` | Ignored warning IDs. |
| `updatedAt` | ISO date-time for local project metadata. |

## Section and line fields

Sections carry `id`, `type`, `name`, `purpose`, `intensity` (0–100), `rhymeScheme`, `syllableRange`, `delivery`, `locked`, and `lines`. Supported types: intro, verse, pre-chorus, chorus, bridge, outro, custom.

Each line carries `id`, `text`, `locked`, and `authored`. Generated lines are editable. Regeneration preserves a locked section, locked lines, and authored lines. Import preserves authored/locked status. IDs are independent of display labels.

## Validation and storage

Import checks the schema, required top-level shape, section shape, and supported genre IDs. Optional invalid values are repaired where possible, including tempo, intensity, delivery ranges, and language defaults. Unreadable LocalStorage payloads are reported without silently replacing them. Future migrations must be explicit and tested.

Browser storage key: `lyriclab.projects.v1`. Active project key: `lyriclab.active`. Export JSON for a portable backup. Opening another project from an import gives it a new local project ID, preserving song content and section/line metadata.

Compiled style prompts and analysis results are not persisted. They are reconstructed from the saved blueprint and explicit seed. The generator algorithms and declarative data version must remain stable for historical reproducibility; future changes need fixtures and a migration/versioning strategy.

## Approved future separation

[Engine Foundation Stage G](ENGINE_FOUNDATION.md) will introduce explicit project migration and SongSpec projection. Stage A supplies only target interfaces and [version policy](ENGINE_VERSIONING.md). It does not activate them, change schemaVersion, or remove fields from existing exports. Current v1 compatibility remains covered by fixed characterization fixtures. Portable intent and lyrics will be separated from local editor state and executable replay records before the interchange freeze.

## Boundaries

No runtime dependency on SonicStudio, Suno, Udio, GitHub, or an AI provider. Shared-format integration comes after a documented, tested schema freeze. Richer language and dialect metadata and migration infrastructure remain part of the roadmap.
