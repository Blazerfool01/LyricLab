# Engine Foundation version and replay policy

Status: policy recorded in Stage A; A–F engines are implemented. Stage G implements project-envelope v2, SongSpec v1, migration, and supported-profile replay. Stage H activates the workflow boundaries.

## Independent version axes

| Axis | Changes when | Owned by |
| --- | --- | --- |
| Project schema | Persisted blueprint, editable document, protection, annotations, or replay shape changes | Project decoder/migrator |
| SongSpec schema | Portable creative intent or interchange semantics change | SongSpec projector |
| Engine contract | Public input/output or boundary semantics change | Foundation contracts |
| Algorithm version | An implementation changes candidate enumeration, normalization, RNG, planning, scoring, analysis, transformation, or rendering | Individual engine |
| Pack version and hash | Referenced declarative content changes, including order relevant to a legacy algorithm | Catalogue |

Do not use the npm app version or Project schema version as a substitute for an engine/data version. Reformatting an implementation without changing observable behavior does not by itself require a new algorithm version; behavior changes do. Publicly released contracts use semantic versioning: compatible additions are minor, incompatible shapes or semantics are major. An execution profile records the exact supported contract generation plus algorithm IDs/versions and pack IDs/versions/content hashes. Stage A defines contract generation 1; it does not publish or freeze a new SongSpec schema number.

## Legacy baseline

`legacy-v0.1` names the characterization profile captured from commit `514c7f8a5abfdf793fb412a3099aeb843c45f8db`. This is a test/documentation identity. Existing saved projects do not already contain this metadata and the runtime does not yet select profiles.

The checked-in fixture records stable inputs and literal outputs. Its legacy outputs include existing limitations, not desired target behavior. The current code remains the source implementation during Stage A. Later adapters must retain these outputs for the legacy profile. A deliberate fix belongs to a new algorithm/profile with its own reviewed fixtures; do not rewrite the legacy golden to make a refactor pass.

## Determinism

New requests validate unsigned 32-bit root seeds and nonnegative integer variation counters at the boundary. Preserve legacy `>>> 0` seed coercion in the legacy adapter rather than silently applying new validation to saved v1 inputs. Different seeds are not promised to produce unique lyrics.

For an exact profile, the same normalized request, protected context, original input snapshot, seed, variation, pack contents, and search budget produce the same candidates, evaluation reports, and selection.

Named streams isolate style, section planning, candidate attempts, and transformations. A versioned stable hash derives streams from root seed plus persistent generation key, operation namespace, variation, candidate ordinal, and local slot key as needed. One attempt's rejection cannot change another attempt's random stream. Candidate sorting and score ties use stable IDs/ordinals, never worker completion order or host locale. Numerical scores must be finite with a documented normalization and precision policy in the scoring algorithm.

The blueprint root seed does not change during section regeneration. A section identity is an editing reference; its generation key is the stable stream reference. Reordering may change narrative input, but does not rewrite generation keys. Duplication preserves existing text and provenance while allocating a new generation key for future regeneration. Recipe lineage records the original accepted operation; no automatic replay promise is made merely because text was copied.

## Replay versus regeneration

Regeneration uses the current blueprint and context. Replay uses the accepted operation's original inputs and exact execution profile.

A replay record retains the original relevant input snapshot (not just its hash), root seed, variation, generation key, target scope, candidate ordinal/archetype, replacement/evaluation policy, search budget, dependency versions, and output fingerprint. The initial contract permits a conservative blueprint/document snapshot without local editor settings or timestamps. Later compaction must prove it retains every dependency; optimize storage only after replay fixtures pass. Derived narrative state is reconstructed from that baseline and its annotations under the recorded reducer version rather than persisted as an additional cache.

Accepted lyrics are authoritative editable document content, not a disposable cache. Engine output fingerprints exclude incidental UUID allocation and timestamps. A manual edit invalidates generated annotations whose text fingerprint no longer matches. The historical recipe can remain available without claiming the edited text is still its original output.

Only explicitly supported profiles are replayable. Stage A establishes one legacy baseline. Each future behavior-changing profile must declare compatibility and supported replay dependencies. Preserve the accepted text and return a missing-dependency diagnostic when an old algorithm or pack is unavailable; never substitute a newer pack under an old version. This policy does not promise permanent bundling of every historical pack version.

## Persistence and SongSpec

Stage G introduces a versioned project envelope and an explicit v1 migration. Existing documents keep lyrics, locks, references, and conservative authorship. Missing origin on imported nonempty text is `unknown` and protected by default. Validation, repair, migration, and catalogue resolution are distinct operations. Unknown/unavailable pack references survive decoding. Repairs return diagnostics and remap references; only offending IDs are replaced through deterministic repair rules. Oversized content is reported/rejected instead of silently truncated. These boundaries are implemented in Stage G; Stage A originally recorded the policy.

The portable SongSpec projector exports creative intent, descriptive choices, performance guidance, ordered sections, and lyrics. It excludes local warning suppression, revisions, timestamps, locks, and executable recipes. Stable references must be accompanied by descriptive information needed by consumers without LyricLab packs. Dialect intent, rhyme, cadence, and narrative purpose remain portable. Recipe details belong to the project format; future optional extensions must not become necessary to consume SongSpec.

The original `.SongSpec.json` preview was Project-shaped. Stage G separates the interchange projector and retains a legacy editor-project adapter. Stage H exposes an explicit legacy export alongside the new SongSpec. Compatibility tests precede the v1.0 schema freeze.

## Golden maintenance

- Review literal fixture diffs as behavior changes, never as routine snapshot updates.
- Keep the baseline commit and inputs immutable.
- New algorithms get new profile fixtures; old fixtures remain available for compatibility adapters.
- Ordinary tests compare runtime output to stored expectations; they never write or regenerate expectations.
- Retain invariants alongside goldens: nonmutation, protection, independent operations, rejection determinism, and explicit failures.
- New behavior must be tested separately from documented legacy quirks.
