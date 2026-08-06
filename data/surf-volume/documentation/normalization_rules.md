# Normalization rules

Every source publishes skill (and sometimes fitness/frequency/conditions/wetsuit) categories in its own vocabulary. This documents every mapping to the shared 3-tier skill taxonomy (`beginner` / `intermediate` / `advanced`) actually used in this project, with rationale and confidence. Original labels are always preserved in `skill_raw` / `*_raw` fields — normalization never overwrites the source's own words.

| Source | Original label | Normalized | Rationale | Confidence |
|---|---|---|---|---|
| Firewire | "Beginner" | beginner | Direct label match | high |
| Firewire | "Intermediate" | intermediate | Direct label match | high |
| Firewire | "Advanced" | advanced | Direct label match | high |
| Firewire | "Inter/Beg", "Advan/Inter" | *(skipped)* | Firewire publishes 5 tiers; these 2 hybrid tiers don't map cleanly to a 3-way split — skipped rather than force-mapped | n/a |
| Surf Simply | "Level 1" | beginner | Explicitly the entry-level tier | high |
| Surf Simply | "Level 2" | intermediate | Best single-band match among Levels 2/3; Level 3 also plausible | medium |
| Surf Simply | "Level 4" | advanced | The top standard tier before "Pro" | high |
| Roberts | "Novice Surfer Learning the Lineup" | beginner | Direct semantic match | high |
| Roberts | "Intermediate and Older Experienced Surfers" | intermediate | Direct label match | high |
| Roberts | "Normal Fitness Advanced Riders" | advanced | Matches Roberts' own model-page "Advanced" GF constant (.36) | high |
| Lost | "Novice / extremely small surf / thick wetsuits" | beginner | Semantic match to entry-level band | high |
| Lost | "Domesticated, lower fitness, weekend warrior" | intermediate | Best match among Lost's 4 bands; a plausible alternative "typical fitness, average-to-above-average skills" band was skipped as a non-clean 4th tier | medium |
| Lost | "Advanced, extremely fit, high performance" | advanced | Direct label match | high |
| Rusty | "Beginner" | beginner | Direct label match | high |
| Rusty | "Experienced" (level 3 of 6) | intermediate | "Competent" (level 2) is also plausible; "Experienced" ("surfing with speed, progressing with maneuvers") reads closer to a genuine intermediate | medium |
| Rusty | "Advanced" (level 4 of 6) | advanced | Direct label match | high |
| Rusty | "Reasonably" (fitness) | average | Direct semantic match to our reference fitness | high |
| Rusty | "Weekly" (frequency) | weekly | Direct label match | high |
| JS Industries | "Beginner (Just starting out)" | beginner | Direct label match | high |
| JS Industries | "Pretty good (Long time keen surfer)" | intermediate | Direct semantic match | high |
| JS Industries | "Advanced (Surfing consistently 10+ years)" | advanced | Direct label match | high |
| JS Industries | "Reasonably fit" (fitness) | average | Exact label-to-taxonomy match | high |
| JS Industries | "Weekly" (frequency) | weekly | Exact label match | high |
| JS Industries | "3/2mm" (wetsuit) | standard | 3/2mm is the common general-purpose thickness | medium |
| JS Industries | "steep"/"medium" (wave type/size) | average (conditions) | Used the page's own pre-selected defaults | high |
| Pyzel | "Beginner"/"Intermediate"/"Advanced" (ability) | direct | Exact label match | high |
| Pyzel | "Average" (wave quality) | average (conditions) | Direct label match to reference conditions | high |
| Guild Factor heuristic | generic GF bands | direct | See heuristic_sources.md | high |
| Weight-rule heuristic | generic coefficient bands | direct | See heuristic_sources.md | medium (source itself is uncredited folk knowledge) |
| NSP | "Casual"/"Intermediate"/"Experienced" (ability) | beginner/intermediate/advanced | Direct semantic match; "Pro" tier skipped as beyond our 3-tier scale | high |
| Matta Surfboards | "Begginer"/"Intermediate"/"Advanced" (sic, site's own typo) | beginner/intermediate/advanced | Direct label match | high |
| Surftech | Column headers "Beginner"/"Intermediate"/"Advanced" | direct | Exact label match; weight values additionally interpolated to our grid (see collection_log.md) | high |
| Surfboard Empire | "Beginner"/"Intermediate"/"Advance" (array positions 4/3/1 of 5) | beginner/intermediate/advanced | Direct label match; "Intermediate/Advanced" and "Advance +" tiers skipped as extra granularity | high |

No source's mapping is hidden or silently forced — every ambiguous case above is flagged `medium` confidence rather than presented as certain.
