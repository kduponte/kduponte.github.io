# Comparability rules applied in this dataset

Per brief §12, `is_directly_comparable` is set to `false` when a source represents a reference philosophy rather than a comparable point estimate, among other conditions. As implemented:

- **Surf Simply** (`surf_simply`): `is_directly_comparable = false` for all observations. Surf Simply explicitly frames its output as "the smallest board that is practical," a functional floor — not a comfortable point recommendation like every other source here. Including it in the median consensus would silently change what the consensus is answering. It's still shown throughout the essay (charts, the input-methodology matrix) with its status clearly labeled, just excluded from `computeConsensus()`.
- **All other 8 sources**: `is_directly_comparable = true`. Each returns (or can be resolved to) a real point-liters or range-liters recommendation intended as "the volume you should ride," collected via a method with documented provenance.

As of the current dataset: **9 sources verified, 8 directly comparable** — comfortably clearing the brief's acceptance floor (≥7 verified, ≥5 comparable).

No source was excluded for returning only a board model, for authentication friction, or for un-comparable inputs — those exclusion reasons exist in the schema (`comparison_exclusion_reason`) for future sources (e.g. Boardcave, if collected later) but aren't triggered by any source currently in the dataset.
