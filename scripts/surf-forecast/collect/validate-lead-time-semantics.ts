// The semantics gate.
//
// Everything retrospective in this project rests on one unproven assumption: that
// `wave_height_previous_dayN` means "what the model predicted N days before this valid time". If
// that is off by one, every skill-decay curve, every bias number, and every finding on the page is
// wrong, and wrong in a way that still looks completely plausible.
//
// The check: a live forecast was snapshotted on 2026-09-15. That snapshot contains forecasts for
// 2026-09-16 (issued 1 day ahead) and 2026-09-17 (issued 2 days ahead). Query the archive now and
// compare the snapshot against every available lead time. If the assumption holds, the snapshot's
// 09-16 values should match _previous_day1 most closely, and its 09-17 values _previous_day2.
//
// Exact equality is not the bar. Models run several times a day and the snapshot was taken at
// whatever run was current, so small differences are expected. What is being tested is whether the
// BEST-matching lead time lands where the assumption says it should. An off-by-one would be
// glaring: the minimum would sit one column over, consistently.
//
// Run: npx tsx scripts/surf-forecast/collect/validate-lead-time-semantics.ts
import { readFileSync } from "node:fs";

const SNAPSHOT_PATH = "data/surf-forecast/cache/spikes/s5-snapshot-2026-09-15.json";
const SNAPSHOT_ISSUED = "2026-09-15";
const MODEL = "ncep_gfswave025";
const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const LEAD_TIMES = [1, 2, 3, 4, 5, 6, 7];

interface Hourly {
	time?: string[];
	[key: string]: unknown;
}

function loadSnapshot(): { times: string[]; waveHeight: (number | null)[]; lat: number; lon: number } {
	const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as {
		latitude: number;
		longitude: number;
		hourly: Hourly;
	};
	const hourly = raw.hourly;
	return {
		times: (hourly.time ?? []) as string[],
		waveHeight: (hourly.wave_height ?? []) as (number | null)[],
		lat: raw.latitude,
		lon: raw.longitude,
	};
}

/**
 * Whole calendar days between the issue date and a valid timestamp, both UTC.
 *
 * Compares date to date, not timestamp to midnight. An earlier version measured the elapsed time
 * from midnight on the issue date and rounded it, which turned every noon valid-time into a lead
 * one day too high (09-16T12:00 is 1.5 raw days after 09-15T00:00, which rounded to 2). That made
 * a correct API look like it was off by one, which is exactly the failure this gate exists to
 * catch, so it is worth being precise about.
 */
function leadDays(issuedDate: string, validTime: string): number {
	const issued = new Date(`${issuedDate}T00:00:00Z`).getTime();
	const validDateOnly = new Date(`${validTime.slice(0, 10)}T00:00:00Z`).getTime();
	return Math.round((validDateOnly - issued) / 86_400_000);
}

async function fetchArchive(lat: number, lon: number, startDate: string, endDate: string): Promise<Hourly> {
	const vars = ["wave_height", ...LEAD_TIMES.map((d) => `wave_height_previous_day${d}`)].join(",");
	const qs = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		hourly: vars,
		models: MODEL,
		start_date: startDate,
		end_date: endDate,
		timezone: "UTC",
		timeformat: "iso8601",
	});
	const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${qs}`, { headers: { "User-Agent": UA } });
	if (!res.ok) throw new Error(`archive request failed: ${res.status} ${await res.text()}`);
	const body = (await res.json()) as { hourly?: Hourly };
	return body.hourly ?? {};
}

/** Tolerates the model-suffixed key names the API returns when models= is set. */
function seriesFor(hourly: Hourly, variable: string): (number | null)[] {
	const exact = hourly[variable];
	if (Array.isArray(exact)) return exact as (number | null)[];
	const suffixed = Object.keys(hourly).find((k) => k.startsWith(`${variable}_`) || k === `${variable}_${MODEL}`);
	const series = suffixed ? hourly[suffixed] : undefined;
	return Array.isArray(series) ? (series as (number | null)[]) : [];
}

function meanAbsDiff(a: (number | null)[], b: (number | null)[]): { mae: number | null; n: number } {
	let sum = 0;
	let n = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		const x = a[i];
		const y = b[i];
		if (typeof x === "number" && typeof y === "number") {
			sum += Math.abs(x - y);
			n++;
		}
	}
	return { mae: n === 0 ? null : sum / n, n };
}

async function main(): Promise<void> {
	const snapshot = loadSnapshot();
	console.log(`Snapshot issued ${SNAPSHOT_ISSUED}, grid point ${snapshot.lat}, ${snapshot.lon}, model ${MODEL}`);

	// Group the snapshot's hours by how far ahead they were at issue time.
	const byLead = new Map<number, { times: string[]; values: (number | null)[] }>();
	snapshot.times.forEach((t, i) => {
		const lead = leadDays(SNAPSHOT_ISSUED, t);
		if (lead < 1) return; // same-day hours are a nowcast, not a lead time
		if (!byLead.has(lead)) byLead.set(lead, { times: [], values: [] });
		const bucket = byLead.get(lead)!;
		bucket.times.push(t);
		bucket.values.push(snapshot.waveHeight[i] ?? null);
	});

	if (byLead.size === 0) {
		console.log("Snapshot contains no forward-looking hours. Cannot validate.");
		return;
	}

	let verdictLines: string[] = [];

	for (const [trueLead, bucket] of [...byLead.entries()].sort((a, b) => a[0] - b[0])) {
		const day = bucket.times[0].slice(0, 10);
		const archive = await fetchArchive(snapshot.lat, snapshot.lon, day, day);
		const archiveTimes = (archive.time ?? []) as string[];

		// Align the snapshot's hours for this day to the archive's hour ordering.
		const alignedSnapshot: (number | null)[] = archiveTimes.map((t) => {
			const idx = bucket.times.indexOf(t);
			return idx === -1 ? null : bucket.values[idx];
		});

		console.log(`\nValid day ${day}, which was ${trueLead} day(s) ahead when the snapshot was taken:`);
		const scores: { lead: number; mae: number; n: number }[] = [];
		for (const lead of LEAD_TIMES) {
			const series = seriesFor(archive, `wave_height_previous_day${lead}`);
			const { mae, n } = meanAbsDiff(alignedSnapshot, series);
			if (mae === null) {
				console.log(`  previous_day${lead}: no overlapping data`);
				continue;
			}
			scores.push({ lead, mae, n });
			console.log(`  previous_day${lead}: MAE ${mae.toFixed(4)} m over ${n} hours`);
		}

		if (scores.length === 0) {
			verdictLines.push(`${day}: no comparable archive data`);
			continue;
		}
		const best = scores.reduce((a, b) => (a.mae <= b.mae ? a : b));
		const matches = best.lead === trueLead;
		console.log(`  => closest match is previous_day${best.lead} (expected previous_day${trueLead}) ${matches ? "OK" : "MISMATCH"}`);
		verdictLines.push(`${day}: expected day${trueLead}, best match day${best.lead} ${matches ? "OK" : "MISMATCH"}`);

		await new Promise((r) => setTimeout(r, 1200));
	}

	console.log("\n=== GATE RESULT ===");
	for (const line of verdictLines) console.log(`  ${line}`);
	const allOk = verdictLines.every((l) => l.endsWith("OK"));
	console.log(
		allOk
			? "\nPASS. _previous_dayN means what the retrospective design assumes. Retro numbers can be trusted."
			: "\nFAIL or INCONCLUSIVE. Do not publish retrospective numbers until this is understood.",
	);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Validation failed to run:", err);
		process.exit(1);
	});
}
