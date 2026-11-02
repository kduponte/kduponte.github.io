// Discovers which Hawaii buoys actually exist and are reporting, then ranks them against the
// Hawaii breaks under consideration.
//
// Needed because Hawaii station coverage is sparse and uneven: the North Shore is well
// instrumented, but whether anything sits off the Kona coast or the Hamakua coast is an open
// question, and guessing at station IDs would be a bad way to find out.
//
// Run: npx tsx scripts/surf-forecast/collect/probe-hawaii-buoys.ts
const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const DELAY_MS = 500;

interface Break {
	name: string;
	region: string;
	lat: number;
	lon: number;
	facing: string;
}

const HAWAII_BREAKS: Break[] = [
	// Oahu, North Shore
	{ name: "Pipeline", region: "North Shore, Oahu", lat: 21.665, lon: -158.053, facing: "NW through N" },
	{ name: "Sunset Beach", region: "North Shore, Oahu", lat: 21.679, lon: -158.041, facing: "NW through N" },
	{ name: "Waimea Bay", region: "North Shore, Oahu", lat: 21.642, lon: -158.066, facing: "NW through N" },
	{ name: "Haleiwa", region: "North Shore, Oahu", lat: 21.593, lon: -158.111, facing: "NW through N" },
	// Oahu, South Shore
	{ name: "Ala Moana Bowls", region: "South Shore, Oahu", lat: 21.283, lon: -157.846, facing: "S through SW" },
	{ name: "Waikiki", region: "South Shore, Oahu", lat: 21.272, lon: -157.826, facing: "S through SW" },
	{ name: "Diamond Head", region: "South Shore, Oahu", lat: 21.255, lon: -157.805, facing: "S through SE" },
	{ name: "Ewa Beach", region: "South Shore, Oahu", lat: 21.312, lon: -158.007, facing: "S through SW" },
	// Oahu, east
	{ name: "Makapu'u", region: "East Shore, Oahu", lat: 21.31, lon: -157.66, facing: "E through SE" },
	// Maui
	{ name: "Ho'okipa", region: "North Shore, Maui", lat: 20.934, lon: -156.358, facing: "NW through NE" },
	{ name: "Pe'ahi (Jaws)", region: "North Shore, Maui", lat: 20.945, lon: -156.305, facing: "N through NW" },
	{ name: "Honolua Bay", region: "West Maui", lat: 21.013, lon: -156.638, facing: "N through NW" },
	{ name: "Lahaina Harbor", region: "West Maui", lat: 20.871, lon: -156.677, facing: "W through SW" },
	// Kauai
	{ name: "Hanalei Bay", region: "North Shore, Kauai", lat: 22.205, lon: -159.503, facing: "N through NW" },
	{ name: "Poipu", region: "South Shore, Kauai", lat: 21.874, lon: -159.456, facing: "S through SW" },
	// Big Island
	{ name: "Honoli'i", region: "Hilo, Big Island", lat: 19.767, lon: -155.09, facing: "NE through E" },
	{ name: "Waipi'o Bay", region: "Hamakua, Big Island", lat: 20.13, lon: -155.59, facing: "N through NE" },
	{ name: "Banyans", region: "Kona, Big Island", lat: 19.606, lon: -155.976, facing: "W through SW" },
];

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

const COL = { WVHT: 8, DPD: 9, APD: 10, MWD: 11, WSPD: 6 };
function isReal(t: string | undefined): boolean {
	return t !== undefined && t !== "MM" && t !== "99.0" && t !== "999" && t !== "9999";
}

interface Station {
	id: string;
	lat: number;
	lon: number;
	name: string;
	waveRows: number;
	dirRows: number;
	windRows: number;
}

async function probeStation(id: string): Promise<Station | null> {
	try {
		const dataRes = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`, { headers: { "User-Agent": UA } });
		if (!dataRes.ok) return null;
		const rows = (await dataRes.text()).split("\n").slice(2).filter(Boolean).slice(0, 150);
		let waveRows = 0;
		let dirRows = 0;
		let windRows = 0;
		for (const row of rows) {
			const t = row.trim().split(/\s+/);
			if (isReal(t[COL.WVHT])) waveRows++;
			if (isReal(t[COL.MWD])) dirRows++;
			if (isReal(t[COL.WSPD])) windRows++;
		}
		if (waveRows === 0) return null;

		const pageRes = await fetch(`https://www.ndbc.noaa.gov/station_page.php?station=${id}`, { headers: { "User-Agent": UA } });
		const html = pageRes.ok ? await pageRes.text() : "";
		const pos = html.match(/([0-9]+\.[0-9]+)\s*N\s*([0-9]+\.[0-9]+)\s*W/);
		const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
		if (!pos) return null;
		return {
			id,
			lat: Number(pos[1]),
			lon: -Number(pos[2]),
			name: (nameMatch?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
			waveRows,
			dirRows,
			windRows,
		};
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	console.log("Probing Hawaii station range for live wave data...\n");
	const ids = Array.from({ length: 22 }, (_, i) => String(51200 + i));
	const stations: Station[] = [];
	for (const id of ids) {
		const s = await probeStation(id);
		if (s) {
			stations.push(s);
			console.log(`  ${id}  ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}  waves=${s.waveRows} dir=${s.dirRows} wind=${s.windRows}  ${s.name}`);
		}
		await new Promise((r) => setTimeout(r, DELAY_MS));
	}

	if (stations.length === 0) {
		console.log("No reporting Hawaii stations found.");
		return;
	}

	console.log(`\n${stations.length} reporting stations found.\n`);
	console.log("Nearest buoy per Hawaii break:\n");
	for (const brk of HAWAII_BREAKS) {
		const ranked = stations
			.map((s) => ({ ...s, km: haversineKm(brk.lat, brk.lon, s.lat, s.lon) }))
			.sort((a, b) => a.km - b.km)
			.slice(0, 2);
		const best = ranked[0];
		const tier = best.km <= 15 ? "close" : best.km <= 30 ? "marginal" : "too far, disagreement only";
		console.log(`${brk.name} (${brk.region}), faces ${brk.facing}`);
		for (const r of ranked) {
			console.log(`    ${r.km.toFixed(0).padStart(4)} km  ${r.id}  ${r.name}  [dir=${r.dirRows > 0 ? "yes" : "no"}]`);
		}
		console.log(`    => ${tier}\n`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Probe failed:", err);
		process.exit(1);
	});
}
