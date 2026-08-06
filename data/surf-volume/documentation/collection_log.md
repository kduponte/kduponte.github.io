# Collection log

All collection dates below are 2026-08-05. Each entry: what was attempted, what happened, and why the resulting collection method was chosen.

## Firewire — `table_extraction`
Static HTML `<table class="volume-matrix__table">` with 5 published skill tiers (Beginner, Inter/Beg, Intermediate, Advan/Inter, Advanced) across 33 weight points. Collected via `scripts/surf-volume/collect/collect-firewire.ts` (cheerio, no browser needed). We use only the 3 tiers that map 1:1 to our taxonomy at high confidence; the two hybrid tiers are skipped rather than force-mapped.

## Surf Simply — `derived_from_published_ratio`
Publishes a volume-to-weight ratio framework as an interactive hover chart (not a static table) with explicit percentage bands per skill "Level" (1-4, plus Pro). Transcribed directly from the page's own labeled legend. Framed by the site itself as "the smallest board that is practical" — a functional floor, not a comfortable point recommendation — so every observation is marked `is_directly_comparable = false` per brief §12 ("reference philosophy" exclusion), shown for context but excluded from the consensus.

## Roberts Surfboards — `derived_from_published_formula`
Guild Factor (GF = liters / weight_kg) slider tool. The page's own text states the exact GF constants used on Roberts' model pages for each of our 3 skill tiers (Advanced 0.36, Intermediate 0.42, Novice 0.50) — reused directly rather than reverse-engineered. Range: point ± 0.5 L, per the page's stated tolerance.

## Lost Surfboards — `derived_from_published_formula`
Expected (per the original brief) to be a rich multi-input calculator requiring Playwright. Actual inspection found a two-slider Guild Factor widget, structurally identical to Roberts, and the page explicitly credits "all rights reserved©, Whitney Guild 2013" — the same origin as Roberts' Guild Factor system. **Methodology overlap confirmed, not assumed**: both `roberts` and `lost` are tagged `methodology_family: "guild_factor"`.

## Pyzel — `derived_from_published_formula`
The volume guide page embeds a third-party widget (iframe → `pyzel-volume-calculator.netlify.app`). Its exact formula and 28-point weight lookup table are shipped in plain, unminified-enough client JS (`main.b42442d3.chunk.js`) — read directly rather than automated. `volume = pro_baseline * (1 + ability%/100) + wave_offset`. All 7 core weights are exact points in Pyzel's own table.

## Rusty Surfboards — `browser_automation`
The only source in Phase A/B requiring genuine Playwright automation: a real multi-input form (weight/height/age/fitness/frequency/skill) backed by a live AJAX service (`cavewire.com/calculatevolume`), not a static formula. `scripts/surf-volume/collect/collect-rusty.ts` drives the actual page, setting the underlying `<select>` elements directly (the visible controls are jQuery UI sliders layered over CSS-hidden selects) and reading the AJAX response. 21/21 core profiles collected on the second run (1 transient failure on the very first request of the first run, succeeded on retry — cached per-profile JSON in `data/surf-volume/cache/rusty/`).

## JS Industries — `derived_from_published_formula`
Expected (per the original brief) to be "high complexity, lower transparency" and to need Playwright. Actual inspection found the opposite: a fully commented, unminified "HYBRID FORMULA" function computed entirely client-side (`VOLUME_FACTORS` constants, with inline comments documenting the tuning history of several coefficients) — no server round-trip for the volume number itself. Formula transcribed verbatim and **independently verified against the live page** for all 3 skill levels (beginner/intermediate/advanced) via direct DOM interaction — all three matched to the displayed decimal. Note: the form also collects height, but the published formula does not use it in the volume calculation at all — a genuine transparency finding, not an omission on our part.

## Boardcave — excluded, not collected
The page footer reads "Powered by Cavewire" — **the same third-party engine already collected for Rusty Surfboards**. Rather than spend automation effort reproducing what would likely be a parameter-tuned variant of the same underlying methodology (the brief explicitly discourages adding sources that don't contribute independent analytical value, §5), Boardcave is excluded from v1. A blank manual-entry template is provided at `data/surf-volume/manual-templates/boardcave_manual_template.csv` for future collection if Boardcave's specific tuning turns out to diverge meaningfully from Rusty's. This does not block v1: 7 sources were verified, comfortably clearing the ≥7-verified / ≥5-comparable acceptance thresholds without it.

## Second collection pass (2026-08-06) — candidate sources supplied by Kyle

16 additional candidate URLs were triaged for fit against brief §5/§6 (must recommend volume for a surfer, not estimate a board's physical volume; must add genuine methodology diversity, not just increase the count).

### Added

**NSP — `derived_from_published_formula`.** Unminified inline `<script>` on the page itself: `volume_L = weight_kg * abilityFactor * boardTypeMultiplier`. Genuinely distinct from every other source here — the only one that takes **board type** (shortboard/fish/midlength/longboard) as an input. Board type held at "shortboard" (multiplier 1.0) to stay comparable with other sources' implicit assumption. Deliberately **not** live-verified via the page's own "Calculate" button: that button also fires a first-party analytics POST (IP-derived geolocation + all inputs) to a Google Apps Script logging endpoint, and reading the unminified source directly was already unambiguous enough not to need it (brief §20: avoid unnecessary requests, never submit personal information).

**Matta Surfboards — `derived_from_published_formula`.** Unminified inline jQuery: `base_L = weight_kg * 0.4` (confirmed exactly across the site's full published weight→liters lookup table, not just at one point), then an **additive** flat-liter skill offset (Beginner +10L, Intermediate +0L, Advanced −6L) — the only additive-offset methodology in this dataset; every other source is multiplicative. The computed figure is what the page uses internally to filter suggested board models, but it's a genuine liters figure before that filtering happens.

### Second look (2026-08-06, same day) — after being asked to dig harder into the 9 initially-deferred candidates

**Surftech — `table_extraction`.** A clean static published table (weight × Beginner/Intermediate/Advanced), directly readable, no JS involved at all. Its own weight steps are rounded from round-number kg values (35, 40, 45…110kg) that don't land exactly on our 7 core weights, so each of our target weights is linearly interpolated between Surftech's two nearest published points — the same interpolation policy used elsewhere in this project (brief §15), applied once at collection time since a discrete published table can't hit arbitrary weights directly.

**Surfboard Empire — `derived_from_published_formula`.** Ships a dedicated, unminified first-party script (`volume-calculator.js`, not a third-party embed) containing a complete weight×skill lookup table (skill is baked into the table itself, not just a multiplier) further scaled by age-bracket and fitness multipliers: `final_L = calcs[weight_kg][skillIndex] * ageFactor * fitnessFactor * 0.75`. A genuinely hybrid structure — part lookup table, part multi-factor formula. Note: the form also collects gender, but the formula never references it — the same "collected but unused" pattern already seen in JS Industries (height) and NSP (height).

**Graham Smith Surfboards — confirmed Guild Factor family member, not added as a new source.** Its calculator is an iframe at `/gf/gf_shortboard2.php` ("gf" for Guild Factor) whose page footer reads, verbatim, "all rights reserved©, Whitney Guild 2013" — the *exact same* credit line as Lost Surfboards, strongly suggesting it's literally the same distributed widget, not just a conceptually similar one. A fourth confirmed member of the `guild_factor` family (with Roberts, Lost, and the Guild Factor heuristic) — documented here rather than collected as a fifth "independent" data point, since it would almost certainly duplicate Lost's numbers.

**DHD — investigated but not resolved.** A genuinely rich 5-input calculator (age, height, weight, 5-tier experience, 4-tier fitness) with two outputs (soft-wave and powerful-wave volumes) — confirmed real via live browser rendering. Its first-party bundled script (`bottom-eafc8a154.js`) was located and fetched but contains **no** reference to any calculator-related terms (weight, age, fitness, volume, liter) at all, meaning the actual computation happens elsewhere (a separate bundle not identified, or a live request triggered on slider interaction). Not pursued further: triggering that interaction live would mean submitting real request data to their backend, and this project's ethics rules (brief §20) call for avoiding exactly that kind of unnecessary live request when the formula can't first be confirmed by reading source. Left as a genuine unresolved case, not silently dropped — see Next Steps.

**Redz Surfboards, Stuart Surfboards — disqualified, not calculators.** Redz's "calculator" is a CaptainForm lead-capture embed. Stuart's submits to `formmail.php`, i.e. it emails a human for a manual reply. Neither computes or displays a liters figure — brief §12's comparability rule ("the output cannot be verified... cannot be translated into liters") applies directly.

**SolidSurf, Surf Station Store — disqualified, active bot protection.** SolidSurf uses a GoHighLevel lead-capture widget behind reCAPTCHA; Surf Station Store has hCaptcha active on the page. Brief §20 explicitly forbids bypassing CAPTCHAs — both excluded on that basis alone, independent of whether either page even contains a real calculator.

**SMTH Shapes — unresolved, different third-party engine.** Runs "Shape3D BoardAdvisor" (`shape3d.com/BoardDesigner/BoardAdvisor.html`) — a *different* white-label engine than Cavewire, not yet confirmed as shared with any other candidate. Not pursued further within this pass's time budget; a genuine open candidate for later.

- **Barahona Surfboards, Soft Top Surf** — physical board-volume-from-dimensions calculators (enter length/width/thickness, get the board's own volume). Out of scope per brief §6: this project concerns volume recommended *for a surfer*, not a board's physical volume computed from its dimensions.
- **Channel Islands ("Ask Al: Volumes for Different Models")** — a blog post discussing volumes of specific existing board models, not a surfer-input calculator.
- **Surfing-Waves.com** — same physical-dimensions category as Barahona/Soft Top (`Volume = Length × Width × Thickness × shapeFactor / 1000`), despite the page's title suggesting otherwise.
- **Chemistry Surfboards** — confirmed via page source to run on **Cavewire**, the same third-party engine already collected for Rusty. Correlated evidence, not independent; not worth automation effort for a likely parameter-tuned variant (same reasoning as the Boardcave exclusion above).
- **SurferToday** — already used as the citation source for the `weight_rule_heuristic` entry; would double-count the same content as a second "new" source.
