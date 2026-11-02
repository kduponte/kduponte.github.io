// Build: the pairs table in, small frozen JSON files for the page out.
//
// Everything computed here goes through tested functions in src/lib/surf-forecast. This script
// decides only what to group by and what to write.
//
// Writes to public/data/surf-forecast/:
//   skill_decay.json   error and skill by scope (all, region), source, variable and lead
//   stations.json      the same, per buoy
//   comparisons.json   paired source comparisons with block-bootstrap and naive intervals
//   coverage.json      share of synoptic hours each buoy actually reported, by month
//   metadata.json      window, models, grid snapping, exclusions, the period-definition check
//
// Run: npx tsx scripts/surf-forecast/build-public-data.ts
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { blockBootstrapMean, excludesZero } from "../../src/lib/surf-forecast/bootstrap";
import { binByWithinStationSpread, spreadOf, type DisagreementPoint } from "../../src/lib/surf-forecast/disagreement";
import { LEAD_DAYS, MODEL_IDS, MODELS, SYSTEM_LABEL, representativeModels, type ModelId } from "../../src/lib/surf-forecast/models";
import { VARIABLES, pairFromCsv, type PairRow, type Source, type Variable } from "../../src/lib/surf-forecast/pairs";
import {
	VARIABLE_CONFIG,
	pairedAbsDifferencesByDay,
	persistenceIndex,
	targetKey,
	skillAgainstPersistence,
	summarize,
} from "../../src/lib/surf-forecast/skill";
import { BUOYS, REGION_LABEL, regionOfStation, type Region } from "../../src/lib/surf-forecast/spots";
import { WINDOW_END, WINDOW_MONTHS, WINDOW_START, monthRange } from "./collect/window";

const PAIRS = "data/surf-forecast/processed/pairs.csv";
const REPORT = "data/surf-forecast/processed/pairing-report.json";
const MODEL_PROBE = "data/surf-forecast/cache/spikes/model-coverage.json";
const OUT_DIR = "public/data/surf-forecast";
const REGIONS: Region[] = ["hawaii", "norcal", "socal"];
const SOURCES: Source[] = [...MODEL_IDS, "persistence"];

/** Four significant figures: plenty for a chart, and it keeps the files small. */
function sig(x: number | null): number | null {
	if (x === null || !Number.isFinite(x)) return null;
	if (x === 0) return 0;
	return Number(x.toPrecision(4));
}

async function loadPairs(): Promise<PairRow[]> {
	const rows: PairRow[] = [];
	const rl = createInterface({ input: createReadStream(PAIRS), crlfDelay: Infinity });
	for await (const line of rl) {
		const r = pairFromCsv(line);
		if (r) rows.push(r);
	}
	return rows;
}

function key(source: Source, variable: Variable, lead: number): string {
	return `${source}|${variable}|${lead}`;
}

interface SummaryRow {
	scope: string;
	source: Source;
	variable: Variable;
	lead_days: number;
	n: number;
	bias: number | null;
	mae: number | null;
	rmse: number | null;
	centered_rmse: number | null;
	correlation: number | null;
	relative_mae: number | null;
	share_within: number | null;
	/** MSE skill against persistence on shared targets; null for persistence itself and lead 0. */
	skill: number | null;
	skill_n: number;
}

function summaryRows(
	scope: string,
	grouped: Map<string, PairRow[]>,
	include: (r: PairRow) => boolean,
	pIndex: Map<string, number>,
): SummaryRow[] {
	const out: SummaryRow[] = [];
	for (const source of SOURCES) {
		for (const variable of VARIABLES) {
			for (const lead of LEAD_DAYS) {
				const rows = (grouped.get(key(source, variable, lead)) ?? []).filter(include);
				if (rows.length === 0) continue;
				const s = summarize(rows, variable);
				const sk = source === "persistence" || lead === 0 ? null : skillAgainstPersistence(rows, pIndex);
				out.push({
					scope,
					source,
					variable,
					lead_days: lead,
					n: s.n,
					bias: sig(s.bias),
					mae: sig(s.mae),
					rmse: sig(s.rmse),
					centered_rmse: sig(s.centered_rmse),
					correlation: sig(s.correlation),
					relative_mae: sig(s.relative_mae),
					share_within: sig(s.share_within),
					skill: sk ? sig(sk.skill) : null,
					skill_n: sk ? sk.n : 0,
				});
			}
		}
	}
	return out;
}

interface ComparisonSpec {
	a: ModelId;
	b: ModelId;
	kind: "system" | "resolution";
	question: string;
}

const COMPARISONS: ComparisonSpec[] = [
	{ a: "ecmwf_wam", b: "ncep_gfswave016", kind: "system", question: "ECMWF against NOAA" },
	{ a: "ecmwf_wam", b: "gwam", kind: "system", question: "ECMWF against DWD" },
	{ a: "ncep_gfswave016", b: "gwam", kind: "system", question: "NOAA against DWD" },
	{ a: "ncep_gfswave016", b: "ncep_gfswave025", kind: "resolution", question: "NOAA fine grid against NOAA coarse grid" },
	{ a: "ecmwf_wam", b: "ecmwf_wam025", kind: "resolution", question: "ECMWF native grid against ECMWF 0.25 degree" },
];
const COMPARISON_LEADS = [1, 3, 5];

async function main(): Promise<void> {
	console.log("Loading pairs...");
	const all = await loadPairs();
	console.log(`  ${all.length.toLocaleString()} pairs`);

	const grouped = new Map<string, PairRow[]>();
	for (const r of all) {
		const k = key(r.source, r.variable, r.lead_days);
		const g = grouped.get(k);
		if (g) g.push(r);
		else grouped.set(k, [r]);
	}
	const pIndex = persistenceIndex(all);
	const regionOf = new Map(Object.keys(BUOYS).map((s) => [s, regionOfStation(s)]));

	// ---- skill decay: all buoys, then each region
	const decay: SummaryRow[] = [...summaryRows("all", grouped, () => true, pIndex)];
	for (const region of REGIONS) decay.push(...summaryRows(region, grouped, (r) => regionOf.get(r.station) === region, pIndex));
	console.log(`  skill decay rows: ${decay.length}`);

	// ---- per station
	const stationRows: SummaryRow[] = [];
	for (const station of Object.keys(BUOYS)) stationRows.push(...summaryRows(station, grouped, (r) => r.station === station, pIndex));
	console.log(`  station rows: ${stationRows.length}`);

	// ---- paired comparisons with honest and naive intervals
	const comparisons = [];
	for (const spec of COMPARISONS) {
		for (const variable of VARIABLES) {
			for (const lead of COMPARISON_LEADS) {
				const days = pairedAbsDifferencesByDay(
					grouped.get(key(spec.a, variable, lead)) ?? [],
					grouped.get(key(spec.b, variable, lead)) ?? [],
				);
				const r = blockBootstrapMean(days, { blockDays: 5, resamples: 2000, seed: 20260915 + lead });
				if (!r) continue;
				comparisons.push({
					a: spec.a,
					b: spec.b,
					kind: spec.kind,
					question: spec.question,
					variable,
					lead_days: lead,
					/** Mean of |error a| - |error b|, in the variable's unit. Negative favours a. */
					mean_abs_error_difference: sig(r.estimate),
					ci_low: sig(r.ci_low),
					ci_high: sig(r.ci_high),
					naive_ci_low: sig(r.naive_ci_low),
					naive_ci_high: sig(r.naive_ci_high),
					se_block: sig(r.se_block),
					se_naive: sig(r.se_naive),
					n_values: r.n_values,
					n_days: r.n_days,
					effective_n: Math.round(r.effective_n),
					distinguishable: excludesZero(r.ci_low, r.ci_high),
					naively_distinguishable: excludesZero(r.naive_ci_low, r.naive_ci_high),
				});
			}
		}
	}
	console.log(`  comparisons: ${comparisons.length}`);

	// ---- does disagreement between the three systems predict error? Height only: period is not
	// comparable across systems (see period_definition) and direction spread is circular.
	const reps = representativeModels();
	const disagreement = [];
	for (const lead of COMPARISON_LEADS) {
		const byTarget = new Map<string, { station: string; observed: number; f: Partial<Record<ModelId, number>> }>();
		for (const m of reps) {
			for (const r of grouped.get(key(m, "wave_height", lead)) ?? []) {
				const k = targetKey(r);
				const t = byTarget.get(k) ?? { station: r.station, observed: r.observed, f: {} };
				t.f[m] = r.forecast;
				byTarget.set(k, t);
			}
		}
		const best: DisagreementPoint[] = [];
		let ecmwfAbs = 0;
		let consensusAbs = 0;
		let complete = 0;
		for (const t of byTarget.values()) {
			const values = reps.map((m) => t.f[m]).filter((v): v is number => v !== undefined);
			if (values.length !== reps.length) continue;
			const ecmwf = t.f.ecmwf_wam as number;
			const consensus = values.reduce((a, b) => a + b, 0) / values.length;
			best.push({ station: t.station, spread: spreadOf(values), abs_error: Math.abs(ecmwf - t.observed) });
			ecmwfAbs += Math.abs(ecmwf - t.observed);
			consensusAbs += Math.abs(consensus - t.observed);
			complete++;
		}
		disagreement.push({
			lead_days: lead,
			judged: "ecmwf_wam",
			systems: reps,
			n: complete,
			bins: binByWithinStationSpread(best, 5).map((b) => ({ ...b, mean_spread: sig(b.mean_spread), mae: sig(b.mae) })),
			/** Same targets: the best single system against the plain average of all three. */
			ecmwf_mae: sig(ecmwfAbs / complete),
			consensus_mae: sig(consensusAbs / complete),
		});
	}
	console.log(`  disagreement leads: ${disagreement.length}`);

	// ---- coverage: share of synoptic hours with a wave-height reading, by station and month
	const heightHours = new Map<string, Set<string>>();
	for (const r of all) {
		if (r.variable !== "wave_height" || r.source === "persistence") continue;
		const k = `${r.station}|${r.valid_time.slice(0, 7)}`;
		const set = heightHours.get(k);
		if (set) set.add(r.valid_time);
		else heightHours.set(k, new Set([r.valid_time]));
	}
	const coverage = Object.keys(BUOYS).flatMap((station) =>
		WINDOW_MONTHS.map((month) => {
			const { start, end } = monthRange(month);
			const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
			const hours = heightHours.get(`${station}|${month}`)?.size ?? 0;
			return { station, region: regionOf.get(station), month, synoptic_hours: days * 4, hours_with_obs: hours, share: sig(hours / (days * 4)) };
		}),
	);

	// ---- metadata
	const report = JSON.parse(readFileSync(REPORT, "utf8"));
	const probe = JSON.parse(readFileSync(MODEL_PROBE, "utf8")) as {
		results: { station: string; model: string; grid_lat: number | null; grid_lon: number | null; snap_km: number | null }[];
	};
	const snap = probe.results
		.filter((r) => (MODEL_IDS as string[]).includes(r.model))
		.map((r) => ({ station: r.station, model: r.model, grid_lat: r.grid_lat, grid_lon: r.grid_lon, snap_km: sig(r.snap_km) }));

	const metadata = {
		generated_at: new Date().toISOString(),
		window: { start: WINDOW_START, end: WINDOW_END, months: WINDOW_MONTHS.length },
		total_pairs: all.length,
		model_pairs: all.filter((r) => r.source !== "persistence").length,
		grid: "00, 06, 12 and 18 UTC",
		match_window_minutes: 30,
		leads: LEAD_DAYS,
		variables: Object.fromEntries(VARIABLES.map((v) => [v, VARIABLE_CONFIG[v]])),
		systems: SYSTEM_LABEL,
		models: Object.values(MODELS),
		regions: REGION_LABEL,
		stations: Object.values(BUOYS).map((b) => {
			const st = report.stations.find((s: { station: string }) => s.station === b.station);
			return {
				station: b.station,
				name: b.name,
				region: regionOf.get(b.station),
				latitude: b.latitude,
				longitude: b.longitude,
				height_obs_coverage: sig(st?.height_obs_coverage ?? null),
				models_excluded_as_masked: st?.models_excluded_as_masked ?? [],
			};
		}),
		grid_snapping: snap,
		period_definition: report.period_definition,
	};

	mkdirSync(OUT_DIR, { recursive: true });
	const write = (name: string, data: unknown) => {
		const path = `${OUT_DIR}/${name}`;
		writeFileSync(path, `${JSON.stringify(data)}\n`);
		console.log(`  wrote ${path} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
	};
	write("skill_decay.json", { rows: decay });
	write("stations.json", { rows: stationRows });
	write("comparisons.json", { rows: comparisons });
	write("coverage.json", { rows: coverage });
	write("disagreement.json", { rows: disagreement });
	write("metadata.json", metadata);
}

main().catch((err) => {
	console.error("Build failed:", err);
	process.exit(1);
});
