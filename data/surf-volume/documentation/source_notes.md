# Source notes

Concise notes per source beyond what's already in `source_metadata.json`. Full collection method rationale is in `collection_log.md`.

| Source | Type | Method | Family | Comparable | Notable finding |
|---|---|---|---|---|---|
| Firewire | Manufacturer | table_extraction | weight_and_skill_table | Yes | Publishes 5 skill tiers; only 3 used |
| Surf Simply | Educator | derived_from_published_ratio | volume_to_weight_ratio_reference | **No** | Explicitly a "minimum functional" floor, not a comfort recommendation |
| Roberts | Manufacturer | derived_from_published_formula | guild_factor | Yes | Publishes its own model-page GF constants directly |
| Lost | Manufacturer | derived_from_published_formula | guild_factor | Yes | Confirmed same Guild Factor origin as Roberts (credits "Whitney Guild 2013" on-page) |
| Rusty | Manufacturer | browser_automation | rich_profile_calculator | Yes | Only source requiring genuine Playwright automation; backed by a live "Cavewire" AJAX service |
| JS Industries | Manufacturer | derived_from_published_formula | rich_profile_calculator | Yes | Formula fully commented in public client JS — more transparent in practice than the brief predicted; collects height but its own formula doesn't use it |
| Pyzel | Manufacturer | derived_from_published_formula | weight_and_skill_table | Yes | Formula and full weight lookup table embedded in a third-party widget's public JS bundle |
| Guild Factor heuristic | Community | derived_from_published_ratio | guild_factor | Yes | Same family as Roberts/Lost — 3 correlated data points, not 3 independent ones |
| Weight-rule heuristic | Community | community_heuristic | weight_ratio_folk_heuristic | Yes | No single identifiable originator — labeled explicitly as folk knowledge |
| NSP | Manufacturer | derived_from_published_formula | board_type_weighted_ratio | Yes | Only source that takes board type (shortboard/fish/midlength/longboard) as an input |
| Matta Surfboards | Manufacturer | derived_from_published_formula | additive_skill_offset | Yes | Only additive-offset formula in the dataset; every other source is multiplicative |
| Surftech | Manufacturer | table_extraction | weight_and_skill_table | Yes | Clean static published table; interpolated at collection time to our weight grid |
| Surfboard Empire | Manufacturer | derived_from_published_formula | weight_skill_table_with_multipliers | Yes | Own weight×skill table further scaled by age/fitness multipliers; collects gender but the formula never uses it |

**Methodology overlap, disclosed:**
- `roberts`, `lost`, and `guild_factor_heuristic` all share `methodology_family: "guild_factor"` — genuinely confirmed via each source's own page content, not assumed from the brief. A fourth brand, Graham Smith Surfboards, shares the exact same "Whitney Guild 2013" widget as Lost but was not collected as a data source specifically to avoid padding this family with a near-duplicate; see `collection_log.md`.
- `rusty` and (if collected later) `boardcave`/`chemistrysurfboards` share the same third-party "Cavewire" calculation engine — confirmed via each brand's own page footer ("Powered by Cavewire"). Boardcave and Chemistry Surfboards were both excluded from v1 specifically because of this overlap; see `collection_log.md`.

**Excluded**: `boardcave`, `chemistrysurfboards` (Cavewire duplicates), `grahamsmithboards` (Guild Factor duplicate) — see `collection_log.md` for full decision rationale. None block v1 per brief §24.

**Unresolved (not excluded on principle, just not cracked yet)**: `dhdsurf.eu` (rich 5-input, dual-output calculator; formula not located in the site's shipped JS within this pass's time budget), `smthshapes.com` (runs a distinct "Shape3D BoardAdvisor" third-party engine, not yet investigated). Candidates for a future pass — see the project's Next Steps section.
