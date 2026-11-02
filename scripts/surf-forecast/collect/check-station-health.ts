// Checks which NDBC stations are currently reporting usable wave data.
//
// Worth re-running rather than trusting an earlier result: buoys get pulled for maintenance, lose
// sensors, and come back. A station that was dead a month ago may be fine now, and vice versa.
//
// Reads realtime2 directly (about 45 days of recent observations) because it reflects current
// sensor health more directly than an archive query, and does not depend on ERDDAP being up.
//
// Run: npx tsx scripts/surf-forecast/collect/check-station-health.ts
const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const DELAY_MS = 800;

const CANDIDATES: { station: string; label: string; servesSpot: string }[] = [
	// California, for Linda Mar
	{ station: "46026", label: "San Francisco, 18nm W", servesSpot: "Linda Mar" },
	{ station: "46012", label: "Half Moon Bay, 24nm SSW of SF", servesSpot: "Linda Mar" },
	{ station: "46237", label: "San Francisco Bar", servesSpot: "Linda Mar" },
	{ station: "46042", label: "Monterey, 27nm WNW", servesSpot: "Monterey Bay" },
	// Oahu south shore, for Waikiki
	{ station: "51211", label: "Pearl Harbor Entrance", servesSpot: "Waikiki" },
	{ station: "51212", label: "Barbers Point", servesSpot: "Waikiki" },
	{ station: "51210", label: "Kaneohe Bay (windward)", servesSpot: "Oahu windward" },
	{ station: "51207", label: "Kaneohe Bay", servesSpot: "Oahu windward" },
	// Oahu north shore
	{ station: "51201", label: "Waimea Bay", servesSpot: "Waimea Bay" },
	// Big Island, for Honoli'i
	{ station: "51206", label: "Hilo", servesSpot: "Honoli'i" },
	// Los Angeles, for Malibu and the Santa Monica Bay breaks
	{ station: "46221", label: "Santa Monica Bay", servesSpot: "Malibu / LA" },
	{ station: "46025", label: "Santa Monica Basin, 33nm WSW", servesSpot: "Malibu / LA" },
	{ station: "46222", label: "San Pedro", servesSpot: "LA south bay" },
	// North San Diego County, for San Onofre
	{ station: "46242", label: "Camp Pendleton Nearshore", servesSpot: "San Onofre" },
	{ station: "46224", label: "Oceanside Offshore", servesSpot: "San Onofre" },
	{ station: "46086", label: "San Clemente Basin", servesSpot: "San Onofre" },
	// San Diego proper
	{ station: "46254", label: "Scripps Nearshore", servesSpot: "San Diego" },
	{ station: "46232", label: "Point Loma South", servesSpot: "San Diego" },
];

interface Health {
	station: string;
	label: string;
	servesSpot: string;
	reachable: boolean;
	rows: number;
	waveHeight: number;
	domPeriod: number;
	avgPeriod: number;
	direction: number;
	wind: number;
	latestWaveTime: string | null;
}

/** Column indices in the NDBC realtime2 fixed layout. */
const COL = { WDIR: 5, WSPD: 6, WVHT: 8, DPD: 9, APD: 10, MWD: 11 };

function isReal(token: string | undefined): boolean {
	return token !== undefined && token !== "MM" && token !== "99.0" && token !== "999" && token !== "9999";
}

async function checkStation(c: { station: string; label: string; servesSpot: string }): Promise<Health> {
	const base: Health = {
		station: c.station,
		label: c.label,
		servesSpot: c.servesSpot,
		reachable: false,
		rows: 0,
		waveHeight: 0,
		domPeriod: 0,
		avgPeriod: 0,
		direction: 0,
		wind: 0,
		latestWaveTime: null,
	};
	try {
		const res = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${c.station}.txt`, { headers: { "User-Agent": UA } });
		if (!res.ok) return base;
		const text = await res.text();
		// Skip the two header lines, then sample the most recent 200 observations.
		const rows = text.split("\n").slice(2).filter(Boolean).slice(0, 200);
		const out = { ...base, reachable: true, rows: rows.length };
		for (const row of rows) {
			const t = row.trim().split(/\s+/);
			if (isReal(t[COL.WVHT])) {
				out.waveHeight++;
				if (out.latestWaveTime === null) out.latestWaveTime = `${t[0]}-${t[1]}-${t[2]} ${t[3]}:${t[4]}Z`;
			}
			if (isReal(t[COL.DPD])) out.domPeriod++;
			if (isReal(t[COL.APD])) out.avgPeriod++;
			if (isReal(t[COL.MWD])) out.direction++;
			if (isReal(t[COL.WSPD])) out.wind++;
		}
		return out;
	} catch {
		return base;
	}
}

async function main(): Promise<void> {
	console.log("Checking current NDBC station health (most recent 200 observations each)\n");
	const results: Health[] = [];
	for (const c of CANDIDATES) {
		results.push(await checkStation(c));
		await new Promise((r) => setTimeout(r, DELAY_MS));
	}

	const pad = (s: string, n: number) => s.padEnd(n);
	console.log(pad("STATION", 9) + pad("SERVES", 16) + pad("ROWS", 6) + pad("HEIGHT", 8) + pad("DOMPER", 8) + pad("AVGPER", 8) + pad("DIR", 7) + pad("WIND", 7) + "LATEST WAVE OBS");
	for (const r of results) {
		if (!r.reachable) {
			console.log(pad(r.station, 9) + pad(r.servesSpot, 16) + "unreachable");
			continue;
		}
		console.log(
			pad(r.station, 9) +
				pad(r.servesSpot, 16) +
				pad(String(r.rows), 6) +
				pad(String(r.waveHeight), 8) +
				pad(String(r.domPeriod), 8) +
				pad(String(r.avgPeriod), 8) +
				pad(String(r.direction), 7) +
				pad(String(r.wind), 7) +
				(r.latestWaveTime ?? "none"),
		);
	}

	console.log("\nUsable for the full analysis means non-zero height, period and direction.");
	for (const r of results) {
		if (!r.reachable) continue;
		const full = r.waveHeight > 0 && r.domPeriod > 0 && r.direction > 0;
		const partial = r.waveHeight > 0 && !full;
		console.log(`  ${r.station} (${r.label}): ${full ? "FULL" : partial ? "PARTIAL, no direction" : "NO WAVE DATA"}`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Health check failed:", err);
		process.exit(1);
	});
}
