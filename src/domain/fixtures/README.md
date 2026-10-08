# Legacy v0.1 characterization fixtures

`legacy-v0.1.json` pins the observable domain behavior at commit **514c7f8**,
under the `legacy-v0.1` behavior profile. It is a compatibility baseline, not
acceptance criteria for the future semantic engine.

The project, section IDs, line IDs, timestamps, language choices, seeds, and
protection flags are explicit literals. Fixture tests never create their inputs
with `exampleProject`, UUID generation, random IDs, or the current clock. A
complete valid project is supplied to validation; its internally generated
fallback IDs and timestamp are not used in the expected result.

Expected outputs were captured once against the named baseline and checked in
as literal values. The test suite reads those values directly; it does not
calculate expected outputs from another engine invocation. No snapshot-update
or fixture-refresh command is provided. Changes require reviewing the affected
literal, explaining the compatibility decision, and retaining the old profile
when the target implementation intentionally differs.

Coverage includes:

- An eight-value seeded RNG vector; normalized weights and tie ordering.
- Full style resolution, warning order, and Compact/Detailed/Annotated prompts,
  including unsupported-genre filtering, production/mood conflicts, and an empty
  foundation.
- Three hook archetypes with their explicit seeds; six verse profiles spanning
  all five themes, three perspectives, and melodic/conversational/clipped/dense/
  spacious delivery.
- Authored and locked-line preservation, explicit authored replacement, entire
  section locking, and the no-candidate identity-preserving result.
- Complete manual analysis reports, meter/banned/rhyme/repetition warnings,
  empty lines, pronunciation estimates, and known/fallback rhyme keys.
- British/American/Standard dialect previews at strengths 1 through 5.
- Full valid project serialization and round-trip, plus plain/annotated lyrics.

Known legacy limitations are deliberately visible: dense third-person output
appends first-person “beside me”; recognized cadence presets override custom
syllable ranges; dialect strength tiers can share output; empty lines still
produce a rhyme mismatch warning; section purpose and concept do not establish
narrative state. These outputs must not be mistaken for recommended behavior.

Run with `npm test`. The fixture contains no user project data.

Foundation execution profiles have separate literal fixtures in `../foundation/generation-fixture.json` (accepted E behavior) and `../foundation/narrative-fixture.json` (accepted F behavior). Their metadata records the profile/capture baseline. Replay and generation tests read these expectations; ordinary tests never regenerate them. The profile's exact algorithms and pack references are part of each request. The legacy fixture remains unchanged.
