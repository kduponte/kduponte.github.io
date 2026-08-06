# kyleduponte.com

Personal site and portfolio, built with [Astro](https://astro.build) + TypeScript + Tailwind CSS v4.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
npm test         # run the Vitest suite
```

Requires Node >= 22.12.0.

## Project structure

```
src/
  components/          shared site components (Header, Footer, ProjectCard, TagPill, ...)
  components/editorial/ reusable data-essay building blocks (ProjectHeader, KeyFindings, Methodology, ...)
  components/projects/  project-specific section components, one folder per project
  content/projects/     content-collection entries — one per portfolio project (title, summary, status, tags)
  layouts/               BaseLayout used by every page
  lib/surf-volume/       pure calculation core for "The Volume Gap" (no fs/network — shared by
                          the collection pipeline and the browser bundle)
  pages/                 file-based routes
  scripts/surf-volume/   client-side TS mounted as Astro <script> islands
  styles/global.css      design tokens (Tailwind v4 @theme block)
scripts/surf-volume/     Node data pipeline (collection, normalization, analysis) — run via tsx,
                          never imported by src/
data/surf-volume/        raw + processed data, plus documentation of collection/normalization
public/data/surf-volume/ frozen JSON actually consumed by the frontend at build/runtime
tests/                    Vitest suite
```

## "The Volume Gap" data pipeline

`/projects/the-volume-gap` is a data essay comparing how different surfboard volume
recommendation systems disagree for the same surfer. It reads from frozen JSON in
`public/data/surf-volume/` — the production site never scrapes anything live.

To regenerate that data from scratch:

```bash
npx tsx scripts/surf-volume/collect/collect-firewire.ts
npx tsx scripts/surf-volume/collect/collect-surf-simply.ts
npx tsx scripts/surf-volume/collect/collect-roberts.ts
npx tsx scripts/surf-volume/collect/collect-lost.ts
npx tsx scripts/surf-volume/collect/collect-rusty.ts        # requires `npx playwright install chromium` once
npx tsx scripts/surf-volume/collect/collect-js.ts
npx tsx scripts/surf-volume/collect/collect-heuristic-guild-factor.ts
npx tsx scripts/surf-volume/collect/collect-heuristic-weight-rule.ts

npx tsx scripts/surf-volume/normalize/normalize.ts   # raw/*.csv -> processed/calculator_observations.*
npx tsx scripts/surf-volume/build-public-data.ts     # processed/* -> public/data/surf-volume/*.json (scores, regression, consensus)
```

Each collector writes to `data/surf-volume/raw/<source>_raw.csv` and is independently
re-runnable. `normalize.ts` never overwrites raw data — it only reads `raw/` and writes
`processed/`. `build-public-data.ts` is the only script that touches `public/`.

Full documentation of collection methods, normalization mappings, comparability rules, and
heuristic provenance lives in `data/surf-volume/documentation/`:

- `collection_log.md` — what was attempted per source and why that collection method was chosen
- `normalization_rules.md` — every skill/fitness/etc. label mapping, with confidence
- `comparability_rules.md` — which sources are excluded from the consensus and why
- `heuristic_sources.md` — provenance for the two community heuristics
- `source_notes.md` — a summary table plus disclosed methodology overlaps

### Adding a new source

1. Write `scripts/surf-volume/collect/collect-<source>.ts` following the pattern of an
   existing collector — prefer reading a published table/formula/ratio directly (Method A/D)
   over browser automation (Method B) when the source publishes one.
2. Add a `SourceMetadata` entry to `scripts/surf-volume/normalize/source-metadata.ts`.
3. Add a `normalize<Source>()` function to `scripts/surf-volume/normalize/normalize.ts` and
   include it in `normalize()`'s `Promise.all`.
4. Re-run `normalize.ts` then `build-public-data.ts`.
5. `npm test` — the data-quality tests in `tests/surf-volume/data/` run against whatever is in
   `data/surf-volume/processed/`, so they'll immediately validate the new source.

### Tests

```bash
npm test
```

- `tests/surf-volume/data/` — schema and comparability checks against the real collected dataset
- `tests/surf-volume/calc/` — pure-function unit tests (consensus, interpolation, scoring, regression) against synthetic fixtures
- `tests/surf-volume/ui-logic/` — client-side logic (event wiring) — see individual test files
