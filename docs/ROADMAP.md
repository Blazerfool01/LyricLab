# LyricLab product specification and roadmap

This document records the original project direction and acceptance criteria. Implementation status is described in README.md; requirements below remain planned until their complete release gate is demonstrated. Early controls or generators do not by themselves complete a milestone.

## Project goal

Build a standalone, offline-first lyric and music-style creation studio that deterministically constructs style prompts, song blueprints, hooks, verses, rhyme/cadence guidance, and exportable song specifications without requiring an AI model or external API.

## Product principles

- Offline first: every v0.x–v1.0 feature works without internet access, accounts, API keys, or an LLM.
- Deterministic core: the same blueprint and seed produce the same derived output.
- Structured before generative: users build a song specification; generators use that specification rather than an unstructured prompt box.
- Meaning over random words: theme, imagery, section purpose, perspective, rhyme, cadence, and vocabulary influence generation.
- Editable at every level: generated content is a starting point, never a locked result.
- Music-generator aware, not vendor locked: style output can support Suno/Udio later, while the internal schema remains generic.
- Standalone project: no SonicStudio runtime dependency. Integration happens later through an exported shared format.
- AI remains optional: future AI can rewrite or expand material but cannot become necessary for core operation.

## v1.0 success condition

A user can create a coherent song blueprint, compile a usable music-generation style prompt, generate and edit hooks/verses, inspect rhyme and cadence, apply dialect guidance, save the project locally, and export lyrics/style/specification files, entirely offline.

## Core architecture

```text
User choices
  → Song Blueprint
      ├─ Style specification
      ├─ Vocal specification
      ├─ Theme / imagery / language
      └─ Section structure
  → Domain engines
      ├─ Style Engine
      ├─ Structure Engine
      ├─ Lyric Engine
      └─ Constraint Engine
  → Compilers / analyzers
      ├─ Style Prompt Compiler
      ├─ Rhyme Analyzer
      ├─ Syllable / Cadence Analyzer
      └─ Dialect Transformer
  → Project / Export Layer
```

React + Vite + TypeScript; client-side only through v1.0. Local declarative modules contain genre, mood, vocal, production, rhyme, imagery, vocabulary, and dialect definitions. LocalStorage is the initial persistence mechanism; IndexedDB is optional if payloads grow. Generation uses seeded pseudo-random selection. `.lyriclab.json` / SongSpec schemas are versioned. Pure domain engines receive unit tests; critical workflows receive browser tests.

## Engine Foundation pause after v0.1

The owner approved the [Engine Foundation architecture pass](ENGINE_FOUNDATION.md), stages A–H, before expanding features/data for v0.2–v0.8. Stage A records target contracts, version policy, and fixed v0.1 behavior fixtures. It makes no runtime, dataset, or format changes. B–H implement and verify the boundaries in sequence; completion of A does not complete the full foundation or later product milestones. See [version/replay policy](ENGINE_VERSIONING.md).

## Milestones

| Version | Milestone | Outcome | Depends on |
| --- | --- | --- | --- |
| v0.1 | Style Foundation | Deterministic style builder and compiler | — |
| v0.2 | Song Blueprint | Structured song and section planning | v0.1 |
| v0.3 | Language Engine | Theme, imagery, vocabulary, perspective | v0.2 |
| v0.4 | Hook Lab | Offline chorus/hook generation | v0.3 |
| v0.5 | Verse Engine | Purpose-aware procedural verses | v0.3–0.4 |
| v0.6 | Rhyme & Meter | Rhyme, syllable, repetition analysis | v0.5 |
| v0.7 | Cadence System | Delivery-aware line shaping | v0.6 |
| v0.8 | Dialect Packs | Controlled dialect/accent guidance | v0.7 |
| v0.9 | Projects & Export | Persistence and portable project format | v0.1–0.8 |
| v1.0 | Offline Studio | Integrated, polished offline workflow | v0.9 |

## v0.1 — Style Foundation

Goal: structured genre, voice, mood, tempo, and production choices compile into a coherent deterministic music-generation prompt.

Scope:

- Standalone React/Vite/TypeScript project and first shared domain types.
- Genre and micro-genre data; mood data; vocal register, texture, and delivery data.
- Rhythm, drums, bass, instrumentation, production, and mix data.
- Weighted genre combinations and compatibility/conflict metadata.
- Seeded deterministic selection, Style Engine, and Style Prompt Compiler.
- Compact, Detailed, and Annotated output formats.
- Style Builder UI, copy, and text export.
- Unit tests for deterministic output and compatibility rules.

Initial style model: weighted `genres` and `moods`, optional `bpm`/`rhythm`, voice `type`/`register`/`texture`/`delivery`, and arrays for `bass`, `drums`, `instrumentation`, `production`, and `mix`. See current implemented types in `src/domain/types.ts`.

Definition of Done:

- Same inputs and seed produce identical output.
- Genre blends do more than concatenate labels.
- Conflicts are resolved or explicitly surfaced.
- Prompts remain readable and avoid duplicate descriptors.
- No API/network runtime dependency exists.
- Core logic is separated from React.
- Critical engine tests pass.

## v0.2 — Song Blueprint & Structure Engine

Goal: turn style choices into a song plan with sectional purpose, intensity, and constraints.

Scope:

- SongBlueprint schema v1, title, concept, perspective, narrator, and subject roles.
- Configurable sections and editable Verse–Chorus, Pop, Rap, Story, Minimal, and Extended templates.
- Semantic purpose for every section, line-count targets, intensity curve, rhyme preference, syllable-range preference, and delivery.
- Section reorder, duplicate, delete; visual Structure Builder; blueprint validation.

Section model: stable `id`, `type` (intro, verse, pre-chorus, chorus, bridge, outro, custom), `purpose`, line target, intensity, rhyme scheme, syllable range, and delivery.

Definition of Done:

- Construct a complete song without writing lyrics.
- Every section has an explicit job.
- Invalid structure fails safely.
- Templates remain editable.
- Serialization round-trips without changing meaning.

## v0.3 — Theme, Imagery & Vocabulary Engine

Goal: build the semantic foundation for lyric generation.

Scope:

- Primary and secondary themes; emotional tones; imagery banks grouped by meaning.
- Action, object, location, state, and sensory vocabulary pools.
- Central metaphor/motif, preferred and banned vocabulary, cliché blacklist.
- Plain, poetic, conversational, aggressive, and abstract language registers.
- Perspective consistency, concept relationships/oppositions, reusable LanguageProfile, semantic palette preview.

Words carry metadata; for example, “empty penthouse” is a location associated with success/isolation, cold/reflective tone, and a syllable estimate. Words are not interchangeable tokens.

Definition of Done:

- Vocabulary is selected by meaning, not only rhyme.
- Avoided/cliché terms are reliably excluded.
- Perspective stays consistent unless a section overrides it.
- Themes noticeably change imagery and language.

## v0.4 — Hook Lab

Goal: useful offline chorus, refrain, and hook generation.

Scope:

- Statement, question, contrast, chant, refrain, title-drop, and call/response archetypes.
- Grammatical phrase templates and candidates from LanguageProfile.
- Title integration, repetition controls, target line counts, loose syllable targets, basic end-rhyme targets.
- Multiple seed variations; line locks; less/more repetition controls; hook strength heuristics; dedicated UI.

Definition of Done:

- At least three meaningfully different hooks from one blueprint.
- Regenerating unlocked lines leaves locked lines unchanged.
- Hooks reflect theme and title.
- Repetition is deliberate.
- Cliché and banned-word rules are enforced.

## v0.5 — Verse Engine

Goal: verses progress the song instead of producing unrelated thematic lines.

Scope:

- Narrative, reflection, description, declaration, contrast, and consequence template families.
- Templates mapped to sectional purpose; section semantic state and progression from previous sections.
- Introduce, develop, challenge, or resolve ideas.
- Reuse motifs without exact-line repetition; neighboring-line context.
- Regenerate line, stanza, or section; support manual lines; preserve locks; explicit seeds.
- Detect obvious logical contradictions.

Narrative state: Verse 1 establishes; pre-chorus increases tension; chorus gives the central claim; Verse 2 complicates/deepens; bridge reveals or changes perspective; final chorus resolves/reframes.

Definition of Done:

- Recognizable sectional purpose.
- Verse 2 does not merely paraphrase Verse 1.
- Established imagery is used.
- Locked/manual lines survive regeneration.
- Blueprint plus seed remains reproducible.

## v0.6 — Rhyme, Syllable & Constraint Analysis

Goal: useful editing tools even when every lyric is manually written.

Scope:

- Syllable utility and pronunciation overrides.
- Exact rhyme groups and near/slant relationships; end and basic internal rhyme.
- Compare detected pattern with target scheme.
- Repeated content-word and overused-phrase detection.
- Banned words, perspective changes, and line-length outliers.
- Constraint Engine; explanatory warnings; per-warning ignore/suppress.

Definition of Done:

- Analyze generated and manual lyrics.
- Perfect rhyme is not inherently superior to slant rhyme.
- Warnings explain rather than automatically rewrite.
- False positives can be ignored.
- Dedicated analyzer fixtures pass.

## v0.7 — Cadence & Delivery System

Goal: shape lyrics for performance, especially rap and rhythm-heavy vocals.

Profiles: conversational; short/clipped; dense rhythmic; triplet; double-time; melodic; dragged/spacious; syncopated; spoken/half-spoken.

Scope:

- Target ranges, syllable density, preferred line length, pause/punctuation tendencies.
- Terminal-word strength, internal-rhyme density, melodic open-vowel preferences where feasible.
- Section-level profile changes; inspector diagnostics; adapted generation templates; simple visual rhythm representation.

Definition of Done:

- Switching delivery materially changes line shape.
- Analyzer explains out-of-profile lines.
- Verse and chorus can use different profiles.
- Cadence remains in exported blueprints.

## v0.8 — Dialect & Accent Packs

Goal: controlled regional language/phonetic guidance without caricature.

Scope:

- Generic DialectPack interface; separate vocabulary, grammar, phonetic transformations, and generator style tags.
- Strength 1–5, confidence/safety rules, vocabulary-only mode.
- Phonetic preview before application; locked-word preservation unless explicitly requested.
- Local slang frequency, structured generator metadata, initial test packs, regression fixtures against over-transformation.

Strength model:

1. Standard language; region in style metadata only.
2. Light vocabulary hints.
3. Noticeable regional vocabulary and phrasing.
4. Strong vocabulary with selective phonetic hints.
5. Explicit high-strength phonetic rendering.

Definition of Done:

- Application is reversible.
- Strength levels are visibly different.
- Style prompt and lyric guidance reinforce the same region.
- No pack blindly rewrites matching substrings.
- Pack data is isolated from the generator.

## v0.9 — Projects, Persistence & Export

Goal: durable, portable work.

Scope:

- Versioned `.lyriclab.json` v1; local save, create/open/rename/duplicate/delete, safe autosave.
- Validate loads; skip/repair invalid optional values without destroying valid data.
- Migration infrastructure and corrupt LocalStorage protection.
- Plain/annotated lyrics, compact/detailed styles, full SongSpec JSON exports; project JSON import.
- Deterministic re-derivation after load.

Illustrative portable format: schemaVersion, app, title, seed, style, voice, language, structure, lyrics, settings. The current implementation nests voice in style and lyric lines in structure; see [SONGSPEC.md](SONGSPEC.md).

Definition of Done:

- Save/close/reopen preserves authored choices and locks.
- Derived values are recreated.
- Invalid projects fail safely.
- JSON can form the future SonicStudio bridge.
- No SonicStudio dependency is introduced.

## v1.0 — Complete Offline Songwriting Studio

Goal: integrate the milestones into one cohesive, polished workflow.

Workspace: Blueprint (style/voice/theme/structure/language), central lyric Canvas, contextual Inspector (purpose/rhyme/cadence/syllables/warnings).

Scope:

- Shared blueprint integration, three-panel workspace, responsive layouts, keyboard editing.
- Meaningful undo/redo, clear regeneration boundaries, section and line locks.
- Contextual inspector and blueprint health/validation.
- First-run example, empty states, graceful errors, export centre.
- Full regression; network-disabled operation; no required external runtime service; SongSpec v1 freeze.

Release gate:

- [ ] Fresh install works offline.
- [ ] No API key is required.
- [ ] Style generation is deterministic.
- [ ] Structures carry semantic purpose.
- [ ] Hooks/verses respect theme and language constraints.
- [ ] Manual lyrics receive useful analysis.
- [ ] Rhyme, syllable, and cadence tools work independently of generation.
- [ ] Dialect is optional and reversible.
- [ ] Projects survive save/reopen.
- [ ] Project JSON round-trips.
- [ ] SongSpec has enough information for another application.
- [ ] Production build and tests pass.

## Cross-cutting engineering requirements

Testing categories: determinism, domain-data validation, serialization, invalid inputs, constraint regression fixtures, generator fixtures/snapshots, migrations, and critical UI workflows. Every milestone ships tests appropriate to its logic.

Data rules: prefer declarative definitions; stable IDs independent of display labels; changed names do not break saves; do not persist safely reproducible derived output; every persisted format has schemaVersion; every generator accepts a seed.

UX rules: direct writing is first-class; do not silently overwrite authored text; respect locks; warn instead of blocking; keep advanced controls secondary; the canvas remains the main creative space.

Performance rules: immediate analysis for ordinary song lengths; avoid expensive whole-project recalculation where memoization/incremental analysis helps; make large packs lazy-loadable; no heavyweight local LLM in the v1.0 runtime.

## Out of scope through v1.0

LLM/API lyric generation; local model runtime; accounts; cloud sync; collaboration; audio generation/recording; DAW functions; music notation; direct Suno/Udio submission; SonicStudio runtime integration.

GitHub source management and development CI do not create a runtime dependency on GitHub or enable cloud sync of user songs.

## Post-v1.0 optional intelligence

AI is an adapter around the existing Song Blueprint, not its replacement. Possible features: local/cloud provider interfaces; rewrite, continue, generate alternatives, critique constraints, improve rhyme while preserving meaning, tighten cadence, expand/reduce imagery, and preserve locked words/lines in requests.

With all AI providers disabled, opening/saving, style compilation, procedural lyrics, analysis, dialect rules, and every export must continue to work.

## Implementation order within milestones

Domain model → data → pure engine → tests → UI → persistence impact → regression → milestone commit/release gate. Only advance after the Definition of Done passes.
