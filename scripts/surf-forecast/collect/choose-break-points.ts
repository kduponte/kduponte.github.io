// Applies the offshore sample-point rule to every break and records the result.
//
// For each break, candidates are tried nearest first (see src/lib/surf-forecast/offshore.ts). A
// candidate is accepted when all three forecasting systems return a real, strictly positive wave
// height for at least 95% of the hours in a probe week, at both the latest run and three days out.
// Zeros count as failures: a land-masked cell answers with exactly 0.0, which looks like data.
//
// Writes data/surf-forecast/break-points.json, which is small and committed, so the point every
// break was judged from is part of the public record.
//
// Run: npx tsx scripts/surf-forecast/collect/choose-break-points.ts
import { writeFileSync } from "node:fs";
import { offshoreCandidates, swellWindowCentreDeg, type Candidate } from "../../../src/lib/surf-forecast/offshore";
import { SURF_BREAKS } from "../../../src/lib/surf-forecast/spots";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const OUT = "data/surf-forecast/break-points.json";
const MODELS = ["ecmwf_wam", "ncep_gfswave016", "gwam"];
const PROBE_START = "2026-06-01";
const PROBE_END = "2026-06-07";
const REQUIRED = 0.95;
const GAP_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function realShare(series: unknown): number {
	if (!Array.isArray(series) || series.length === 0) return 0;
	return series.filter((v) => typeof v === "number" && v > 0).length / series.length;
}

async function probe(c: Candidate): Promise<{ ok: boolean; shares: Record<string, number>; error?: string }> {
	const qs = new URLSearchParams({
		latitude: c.latitude.toFixed(4),
		longitude: c.longitude.toFixed(4),
		hourly: "wave_height,wave_height_previous_day3",
		models: MODELS.join(","),
		start_date: PROBE_START,
		end_date: PROBE_END,
		timezone: "UTC",
		timeformat: "iso8601",
	});
	for (let attempt = 1; attempt <= 4; attempt++) {
		const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${qs}`, { headers: { "User-Agent": UA } });
		if (res.status === 429 || res.status >= 500) {
			await sleep(GAP_MS * 2 ** attempt);
			continue;
		}
		if (!res.ok) return { ok: false, shares: {}, error: `HTTP ${res.status}` };
		const h = ((await res.json()) as { hourly?: Record<string, unknown> }).hourly ?? {};
		const shares: Record<string, number> = {};
		for (const m of MODELS) {
			shares[m] = Math.min(realShare(h[`wave_height_${m}`]), realShare(h[`wave_height_previous_day3_${m}`]));
		}
		return { ok: Object.values(shares).every((s) => s >= REQUIRED), shares };
	}
	return { ok: false, shares: {}, error: "retries exhausted" };
}

async function main(): Promise<void> {
	const results = [];
	for (const b of SURF_BREAKS) {
		const candidates = offshoreCandidates(b.latitude, b.longitude, b.facing);
		let chosen: (Candidate & { shares: Record<string, number> }) | null = null;
		let tried = 0;
		for (const c of candidates) {
			tried++;
			const r = await probe(c);
			await sleep(GAP_MS);
			if (r.ok) {
				chosen = { ...c, shares: r.shares };
				break;
			}
		}
		results.push({
			id: b.id,
			name: b.name,
			region: b.region,
			swell_window_centre_deg: swellWindowCentreDeg(b.facing),
			candidates_tried: tried,
			point: chosen
				? {
						latitude: Number(chosen.latitude.toFixed(4)),
						longitude: Number(chosen.longitude.toFixed(4)),
						distance_km: chosen.distance_km,
						bearing_deg: chosen.bearing_deg,
						deviation_deg: chosen.deviation_deg,
					}
				: null,
		});
		console.log(
			`${b.name.padEnd(26)} ${chosen ? `${String(chosen.distance_km).padStart(2)} km at ${chosen.bearing_deg.toFixed(0).padStart(3)}° (${chosen.deviation_deg >= 0 ? "+" : ""}${chosen.deviation_deg}°)` : "NO VALID POINT"}  after ${tried}`,
		);
	}
	writeFileSync(
		OUT,
		`${JSON.stringify({ generated_at: new Date().toISOString(), rule: { models: MODELS, probe_window: [PROBE_START, PROBE_END], required_real_share: REQUIRED }, breaks: results }, null, "\t")}\n`,
	);
	console.log(`\nWrote ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Point selection failed:", err);
		process.exit(1);
	});
}
