// Build: forecast disagreement at every break, from the offshore sample points.
//
// Writes public/data/surf-forecast/breaks.json. All arithmetic goes through tested functions
// (decomposeSpread, spreadOf, pearson); this script reads caches and groups.
//
// Breaks whose sample points snap to the same grid cell in all three systems are the same place
// as far as the forecasts are concerned (Pipeline, Sunset and Waimea, for one). They share a
// cell_group, verified by comparing the forecasts themselves rather than assumed from coordinates,
// so the page can show them as one sample instead of repeating the same data as separate evidence.
//
// Includes one validation: at breaks that have a buoy, does day-to-day disagreement at the break's
// sample point move with disagreement at the buoy? Disagreement was shown to predict error at the
// buoys; if break and buoy disagreement track each other, that result plausibly carries to the
// break, and if they do not, the page should not imply it does.
//
// Run: npx tsx scripts/surf-forecast/build-break-data.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { decomposeSpread, spreadOf } from "../../src/lib/surf-forecast/disagreement";
import { pearson } from "../../src/lib/surf-forecast/error-metrics";
import { isAnalysisHour, parseOpenMeteoTime } from "../../src/lib/surf-forecast/matching";
import { SURF_BREAKS } from "../../src/lib/surf-forecast/spots";
import { BREAK_LEADS, BREAK_MODELS } from "./collect/collect-break-forecasts";
import { WINDOW_MONTHS } from "./collect/window";

const POINTS = "data/surf-forecast/break-points.json";
const BREAK_CACHE = "data/surf-forecast/cache/open-meteo-breaks";
const BUOY_CACHE = "data/surf-forecast/cache/open-meteo";
const OUT = "public/data/surf-forecast/breaks.json";
const VALIDATION_LEAD = 3;

const sig = (x: number | null) => (x === null || !Number.isFinite(x) ? null : x === 0 ? 0 : Number(x.toPrecision(4)));
const key = (lead: number, model: string) => (lead === 0 ? `wave_height_${model}` : `wave_height_previous_day${lead}_${model}`);

/** Synoptic-hour targets with a real forecast from every system: time -> forecasts in system order. */
function targetsFrom(hourly: Record<string, unknown>, lead: number): Map<string, number[]> {
	const times = (hourly.time as string[]) ?? [];
	const series = BREAK_MODELS.map((m) => hourly[key(lead, m)] as unknown[] | undefined);
	const out = new Map<string, number[]>();
	times.forEach((t, i) => {
		if (!isAnalysisHour(parseOpenMeteoTime(t))) return;
		const values = series.map((s) => (Array.isArray(s) ? s[i] : null));
		if (values.every((v): v is number => typeof v === "number" && v > 0)) out.set(t, values as number[]);
	});
	return out;
}

function buoyRanges(station: string, lead: number): Map<string, number> {
	const out = new Map<string, number>();
	for (const month of WINDOW_MONTHS) {
		const path = `${BUOY_CACHE}/${station}_${month}.json`;
		if (!existsSync(path)) continue;
		const hourly = JSON.parse(readFileSync(path, "utf8")).response?.hourly;
		if (!hourly) continue;
		for (const [t, values] of targetsFrom(hourly, lead)) out.set(t, spreadOf(values));
	}
	return out;
}

function main(): void {
	const points = JSON.parse(readFileSync(POINTS, "utf8")) as {
		breaks: {
			id: string;
			point: { distance_km: number; bearing_deg: number; deviation_deg: number } | null;
			grid_cells?: Record<string, { latitude: number; longitude: number; km_from_break: number } | null>;
		}[];
	};
	// Group breaks by the cells all three systems answered from.
	const cellKey = (id: string) => {
		const cells = points.breaks.find((b) => b.id === id)?.grid_cells ?? {};
		return BREAK_MODELS.map((m) => (cells[m] ? `${cells[m]?.latitude},${cells[m]?.longitude}` : "?")).join("|");
	};
	const groupOf = new Map<string, string[]>();
	for (const b of SURF_BREAKS) {
		const k = cellKey(b.id);
		groupOf.set(k, [...(groupOf.get(k) ?? []), b.id]);
	}
	const fingerprint = (id: string) => {
		const path = `${BREAK_CACHE}/${id}.json`;
		if (!existsSync(path)) return null;
		const h = JSON.parse(readFileSync(path, "utf8")).response?.hourly as Record<string, unknown>;
		return JSON.stringify([...targetsFrom(h, VALIDATION_LEAD).entries()]);
	};
	for (const [k, ids] of groupOf) {
		if (ids.length < 2) continue;
		const first = fingerprint(ids[0]);
		if (ids.some((id) => fingerprint(id) !== first)) throw new Error(`breaks ${ids.join(", ")} share cells but not forecasts (${k})`);
	}
	const groupIndex = new Map([...groupOf.keys()].map((k, i) => [k, i]));
	const buoyCache = new Map<string, Map<string, number>>();
	const rows = [];

	for (const brk of SURF_BREAKS) {
		const meta = points.breaks.find((b) => b.id === brk.id);
		const path = `${BREAK_CACHE}/${brk.id}.json`;
		if (!meta?.point || !existsSync(path)) {
			console.log(`  ${brk.id}: no data`);
			continue;
		}
		const hourly = JSON.parse(readFileSync(path, "utf8")).response?.hourly as Record<string, unknown>;

		const leads = BREAK_LEADS.filter((l) => l > 0).map((lead) => {
			const targets = [...targetsFrom(hourly, lead).values()];
			const d = decomposeSpread(targets);
			// The two leading systems alone, to show how much of the disagreement the third one adds.
			const ie = BREAK_MODELS.indexOf("ecmwf_wam");
			const ino = BREAK_MODELS.indexOf("ncep_gfswave016");
			const pair = targets.map((t) => Math.abs(t[ie] - t[ino])).sort((a, b) => a - b);
			return {
				lead_days: lead,
				n: d?.n ?? 0,
				median_range: sig(d?.median_range ?? null),
				p90_range: sig(d?.p90_range ?? null),
				systematic: sig(d?.systematic ?? null),
				daily_median: sig(d?.daily_median ?? null),
				mean_forecast: sig(d?.mean_forecast ?? null),
				system_means: d ? Object.fromEntries(BREAK_MODELS.map((m, i) => [m, sig(d.system_means[i])])) : null,
				outlier: d ? BREAK_MODELS[d.outlier] : null,
				ecmwf_noaa_median: pair.length ? sig(pair[Math.floor((pair.length - 1) / 2)]) : null,
			};
		});

		let buoyR: number | null = null;
		let buoyN = 0;
		if (brk.buoy_station && brk.proxy_tier !== "disagreement_only") {
			if (!buoyCache.has(brk.buoy_station)) buoyCache.set(brk.buoy_station, buoyRanges(brk.buoy_station, VALIDATION_LEAD));
			const atBuoy = buoyCache.get(brk.buoy_station) as Map<string, number>;
			const a: number[] = [];
			const b: number[] = [];
			for (const [t, values] of targetsFrom(hourly, VALIDATION_LEAD)) {
				const br = atBuoy.get(t);
				if (br === undefined) continue;
				a.push(spreadOf(values));
				b.push(br);
			}
			buoyR = pearson(a, b);
			buoyN = a.length;
		}

		const cells = meta.grid_cells ?? {};
		rows.push({
			id: brk.id,
			name: brk.name,
			locality: brk.locality,
			region: brk.region,
			proxy_tier: brk.proxy_tier,
			buoy_station: brk.buoy_station,
			point: meta.point,
			grid_km_from_break: Object.fromEntries(BREAK_MODELS.map((m) => [m, cells[m]?.km_from_break ?? null])),
			cell_group: groupIndex.get(cellKey(brk.id)),
			shares_cells_with: (groupOf.get(cellKey(brk.id)) ?? []).filter((id) => id !== brk.id),
			leads,
			buoy_spread_correlation: sig(buoyR),
			buoy_spread_n: buoyN,
		});
		const l3 = leads.find((l) => l.lead_days === 3);
		console.log(
			`  [g${String(groupIndex.get(cellKey(brk.id))).padStart(2)}] ${l3?.outlier?.padEnd(15)} ${brk.name.padEnd(22)} 3d range med ${((l3?.median_range ?? 0) * 3.28084).toFixed(2)} ft  p90 ${((l3?.p90_range ?? 0) * 3.28084).toFixed(2)}  systematic ${((l3?.systematic ?? 0) * 3.28084).toFixed(2)}  daily ${((l3?.daily_median ?? 0) * 3.28084).toFixed(2)}  mean ${((l3?.mean_forecast ?? 0) * 3.28084).toFixed(1)} ft${buoyR === null ? "" : `  r(buoy) ${buoyR.toFixed(2)}`}`,
		);
	}

	writeFileSync(
		OUT,
		`${JSON.stringify({ generated_at: new Date().toISOString(), systems: BREAK_MODELS, validation_lead_days: VALIDATION_LEAD, distinct_samples: groupOf.size, rows })}\n`,
	);
	console.log(`\nWrote ${OUT} (${rows.length} breaks in ${groupOf.size} distinct model samples)`);
}

main();
