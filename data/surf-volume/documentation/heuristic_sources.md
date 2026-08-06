# Heuristic provenance

Both entries below were researched, then reviewed and explicitly approved before publishing (2026-08-05) — see brief §7/§5 requirements that heuristic provenance be documented before inclusion.

## Guild Factor heuristic (`guild_factor_heuristic`)

- **Formula**: `volume_L = weight_kg × GF`, where GF (Guild Factor) is chosen by skill band.
- **Bands used**: Beginner 0.50–0.60, Intermediate 0.36–0.38, Advanced 0.34–0.36 (point estimate = band midpoint).
- **Source/provenance**: Credited to former pro surfer Whitney Guild, who polled pro surfers' weight and board volume at a 2016 WSL Trestles event and found pro-level GF clustering at 0.34–0.36. Corroborated independently across multiple sources: Lost Surfboards' own blog post ("What's Your Guild Factor? Surfboard Volumes Explained"), Vader Surfboards, and SurferToday.
- **Intended surfer type**: General-purpose, any skill level via the GF band.
- **Limitations**: The exact numeric bands vary slightly by publisher (compare Roberts' 5-tier scheme vs. this generic 3-tier version) — this entry deliberately uses generic community-cited bands rather than either brand's specific tuned constants, to avoid quietly duplicating `roberts` or `lost`.
- **Widely repeated or anecdotal?**: Widely repeated, with a specific named originator and a documented origin event — the strongest-provenance heuristic in this dataset.
- **Methodology overlap**: Shares `methodology_family: "guild_factor"` with `roberts` and `lost` — all three should be read as correlated evidence, not three independent opinions. See Methodology Families.

## Weight-based rule of thumb (`weight_rule_heuristic`)

- **Formula**: `volume_L = weight_kg × coefficient`, coefficient by skill: Beginner 0.65, Intermediate 0.47, Advanced 0.37 (midpoints of commonly-cited ranges).
- **Source/provenance**: **No single identifiable originator.** Multiple secondary surf-content sites (SurferToday, Global Surf Industries, assorted surf-coaching blogs) independently converge on similar coefficients, but none credits a specific person, brand, or study.
- **Intended surfer type**: General-purpose.
- **Limitations**: This is diffuse, widely-repeated folk knowledge, not a formal attributable model. The coefficients are plausible and land in a similar range to this project's own real collected manufacturer data, which is why it's included — but that consistency doesn't substitute for a real citation.
- **Widely repeated or anecdotal?**: Widely repeated but uncredited — presented explicitly as folk knowledge in the essay's copy, not implied to have the same standing as a named, sourced system like Guild Factor.

## What peer-reviewed research actually says (context, not a data source)

A broad search (2026-08-06) for academic/scientific alternatives to the heuristics above turned up no peer-reviewed formula for recommending volume to an individual surfer — every citable source found restates some form of Guild Factor or the dimensional `L × W × T × shape factor` formula, both already covered here and in `source_notes.md`. What does exist is real, but answers a narrower question:

- **Ekmecic, V., Jia, N., Cleveland, T. G., Saulino, M., Nessler, J. A., Crocker, G. H., & Newcomer, S. C. (2017). "Increasing surfboard volume reduces energy expenditure during paddling." *Ergonomics*, 60(9), 1255–1260.** A controlled swim-flume study: 20 surfers paddled on 5 boards (28.4–37.4 L, thickness the only variable) twice each. VO2 and heart rate decreased significantly on thicker boards (VO2: r = −0.984, p = 0.003; HR: r = −0.972, p = 0.006), driven by lower pitch and roll angles (Pitch: r = −0.995, p < 0.001; Roll: r = −0.911, p = 0.031). This is genuine mechanistic evidence that *more volume reduces paddling effort* — but it reports correlations from one experimental manipulation, not a predictive formula, and never claims to say how much volume any given surfer should ride.
- A 2021 scoping review ("Surfing equipment and design: a scoping review," *Sports Engineering*, 24:16) surveying the surfing-equipment literature broadly found very little empirical research on equipment design/fit overall — consistent with what this project independently found: none of the 13 collected systems cite a peer-reviewed source for their specific numeric bands.

Not added as a 14th comparable source: it doesn't output a per-surfer liters recommendation, so it isn't the same kind of thing as the other 13 rows. Cited instead in the essay's Limitations section, to make explicit that the entire comparison sits on industry consensus and folk heuristics, not validated science.
