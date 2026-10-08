# Engine Foundation implementation log

The owner authorized merge and sequential implementation of A–H. Each stage is committed on its own branch with implementation, tests, and this log. A stage advances only after its local suite/build and GitHub PR checks pass; the merged PR retains the final CI evidence. Data expansion and product milestones remain separate.

## A — contracts and historical baseline

Merged [PR #1](https://github.com/Blazerfool01/LyricLab/pull/1), merge commit `f3c3c0f`. Type-only target contracts, version/replay/recovery policy, and 25 fixed v0.1 characterization tests. Verified 65 domain tests, 7 browser tests, compilation and production build; final [CI run](https://github.com/Blazerfool01/LyricLab/actions/runs/37720538251) passed. No production behavior changed.

## B — catalogs and named streams

Implemented immutable defensive-copy indexed views, codepoint-stable queries, explicit choice/trait identities, unchanged legacy pronunciation/rhyme/dialect packs, and a versioned content identifier. The legacy style facade uses indexed genre lookup while retaining descriptor ordering and output shape. Existing vocabulary and 56 existing verse/hook/bridge patterns are represented without new lyric content. New requests have independent namespace-derived Mulberry32 streams; the legacy RNG keeps its original coercion/output.

Validation: 114 domain tests (including 49 catalog/randomness tests), compile-time checks, production build, and the 7 browser workflows. Fixed v0.1 goldens remain unchanged. The test include pattern now covers nested foundation tests. Tests cover duplicate/missing references, deep immutable copies, data fidelity, fixed hash/RNG vectors, seed validation, canonical-input rejection, and stream isolation. Pre-acceptance review also added the unchanged rhyme sets to the pack fingerprint (initial fixed hash `fnv1a-v1-7e737857`) so this data dependency cannot change unnoticed. Review identified non-JSON hash collisions; nonfinite/nonplain/sparse/cyclic inputs are now rejected. Acceptance also requires this branch's GitHub checks before merge. Future stages activate the new streams in generation; B does not change regeneration behavior or schema.
