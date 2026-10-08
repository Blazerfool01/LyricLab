# Project and SongSpec formats

Engine Foundation G implements a project envelope version 2 and a separate SongSpec version 1. The pure boundaries are in [contracts.ts](../src/domain/foundation/contracts.ts) and [persistence.ts](../src/domain/foundation/persistence.ts). Stage H activates these formats in autosave, import, and export; the legacy schema-1 adapter remains supported.

## Project envelope v2

`.lyriclab.json` is the editable backup. It contains `schemaVersion`, `app`, project identity, `blueprint`, accepted `document`, replay `recipes`, variation counters, `updatedAt`, and ignored warning IDs. The blueprint contains root seed, structured style/language references, ordered section intents, stable generation keys, roles, and narrative intent. The document contains accepted text, origin, locks, word ranges, anchored annotations, and historical recipe lineage.

Accepted lyrics are authoritative. Compiled prompts, analysis, candidate scores, and derived narrative state are reconstructed. The React editor is a projection; its legacy-shaped fields are not persisted alongside a second authoritative blueprint/document.

Replay recipes record the original blueprint/document snapshot, target scope, seed, variation, ordinal, policy, budget, exact algorithm/pack versions, and output fingerprint. Replay inspects the original operation; it does not overwrite current lyrics. Unsupported dependencies produce an explicit diagnostic while preserving accepted text.

## SongSpec v1

`.SongSpec.json` has `format: "SongSpec"` and `schemaVersion: 1`. It carries title/concept, weighted descriptive genres/moods, BPM/rhythm, categorized traits, structured voice, language themes/tones/perspective/register/motif/vocabulary rules/dialect guidance, narrative intent, and ordered sections with purpose/role/intensity/hook archetype/rhyme/cadence and lyrics.

References have descriptive labels so consumers do not need LyricLab's packs. Unknown references remain visible. SongSpec excludes local locks, revisions, timestamps, warning suppression, and executable replay recipes. This foundation format is independently versioned; the broader product interoperability release gate remains open until v1.0.

## Migration and compatibility

Schema-1 projects keep their valid lyrics, custom names, locks, and unresolved choices. Imported nonempty lines without reliable authorship evidence have conservative `unknown` origin and receive protection. Migration cannot reconstruct historical generator inputs that schema 1 never recorded.

Decoding validates required structure, reports optional repairs, and keeps missing dependencies as references. Repairs are deterministic; oversized content is rejected instead of truncated. Unsupported versions fail safely. Historical v0.1 output remains covered by fixed fixtures and the legacy adapter. An explicit legacy project export remains available for consumers of the earlier Project-shaped format. Schema 1 cannot carry word locks, conservative unknown-origin metadata, or executable recipes; use the version-2 project backup to retain these.

## Browser storage

The existing library key is `lyriclab.projects.v1`; this key names the library location, not the schema of each stored envelope. The active-project key is `lyriclab.active`. Unreadable library payloads must be reported and protected from automatic replacement. Export JSON for a backup.

No runtime dependency on SonicStudio, Suno, Udio, GitHub, or an AI provider is introduced. GitHub stores application code; song projects remain local.
