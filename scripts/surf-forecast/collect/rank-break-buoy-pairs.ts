// Picks the best buoy for each surf break, by actual distance rather than by which buoy happens
// to have a convenient name.
//
// The framing this project needs: a buoy is not a break. This compares an offshore model forecast
// against an offshore buoy, which is a real measurement of model skill in open water, but it is
// the upstream half of a surf forecast, not the surf itself. How far the buoy sits from the break,
// and whether it even shares the break's swell window, decides how much the comparison tells you
// about the spot you actually care about. So compute the distance and say it out loud.
//
// Run: npx tsx scripts/surf-forecast/collect/rank-break-buoy-pairs.ts
const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";

interface Break {
	id: string;
	name: string;
	region: string;
	lat: number;
	lon: number;
	/** Rough direction the break faces, for judging whether a buoy shares its swell window. */
	facing: string;
}

const BREAKS: Break[] = [
	{ id: "pipeline", name: "Pipeline", region: "North Shore, Oahu", lat: 21.665, lon: -158.053, facing: "NW through N" },
	{ id: "waimea", name: "Waimea Bay", region: "North Shore, Oahu", lat: 21.642, lon: -158.066, facing: "NW through N" },
	{ id: "waikiki", name: "Waikiki", region: "South Shore, Oahu", lat: 21.272, lon: -157.826, facing: "S through SW" },
	{ id: "honolii", name: "Honoli'i", region: "Hilo, Big Island", lat: 19.767, lon: -155.09, facing: "NE through E" },
	{ id: "rodeo_beach", name: "Rodeo Beach", region: "Marin, CA", lat: 37.832, lon: -122.538, facing: "W through NW" },
	{ id: "ocean_beach_sf", name: "Ocean Beach", region: "San Francisco, CA", lat: 37.7594, lon: -122.5107, facing: "W through NW" },
	{ id: "linda_mar", name: "Linda Mar", region: "Pacifica, CA", lat: 37.594, lon: -122.506, facing: "W through NW" },
	{ id: "montara", name: "Montara", region: "San Mateo, CA", lat: 37.552, lon: -122.517, facing: "W through NW" },
	{ id: "mavericks", name: "Mavericks", region: "Half Moon Bay, CA", lat: 37.495, lon: -122.5, facing: "W through NW" },
	{ id: "hmb_jetty", name: "Half Moon Bay (Princeton Jetty)", region: "Half Moon Bay, CA", lat: 37.502, lon: -122.483, facing: "W through NW" },
	{ id: "waddell", name: "Waddell Creek", region: "Santa Cruz County, CA", lat: 37.095, lon: -122.276, facing: "W through NW" },
	{ id: "steamer_lane", name: "Steamer Lane", region: "Santa Cruz, CA", lat: 36.951, lon: -122.026, facing: "W through NW" },
	{ id: "pleasure_point", name: "Pleasure Point", region: "Santa Cruz, CA", lat: 36.956, lon: -121.966, facing: "S through SW" },
	{ id: "county_line", name: "County Line", region: "LA/Ventura line, CA", lat: 34.045, lon: -118.914, facing: "W through NW" },
	{ id: "zuma", name: "Zuma", region: "Malibu, CA", lat: 34.016, lon: -118.822, facing: "S through W" },
	{ id: "malibu", name: "Malibu (Surfrider)", region: "Los Angeles, CA", lat: 34.037, lon: -118.678, facing: "S through W" },
	{ id: "topanga", name: "Topanga", region: "Los Angeles, CA", lat: 34.039, lon: -118.583, facing: "S through W" },
	{ id: "venice", name: "Venice Breakwater", region: "Los Angeles, CA", lat: 33.985, lon: -118.473, facing: "W through SW" },
	{ id: "el_porto", name: "El Porto", region: "Manhattan Beach, CA", lat: 33.902, lon: -118.42, facing: "W through SW" },
	{ id: "huntington", name: "Huntington Beach", region: "Orange County, CA", lat: 33.655, lon: -118.004, facing: "S through W" },
	{ id: "trestles", name: "Lower Trestles", region: "San Clemente, CA", lat: 33.385, lon: -117.593, facing: "S through W" },
	{ id: "san_onofre", name: "San Onofre", region: "San Diego County, CA", lat: 33.373, lon: -117.566, facing: "SW through W" },
	{ id: "swamis", name: "Swami's", region: "Encinitas, CA", lat: 33.035, lon: -117.293, facing: "SW through W" },
	{ id: "del_mar", name: "Del Mar", region: "Del Mar, CA", lat: 32.959, lon: -117.27, facing: "W through SW" },
	{ id: "blacks", name: "Blacks Beach", region: "La Jolla, CA", lat: 32.889, lon: -117.252, facing: "W through NW" },
	{ id: "la_jolla_shores", name: "La Jolla Shores", region: "La Jolla, CA", lat: 32.857, lon: -117.257, facing: "W through SW" },
	{ id: "windansea", name: "Windansea", region: "La Jolla, CA", lat: 32.833, lon: -117.281, facing: "W through SW" },
	{ id: "tourmaline", name: "Tourmaline", region: "Pacific Beach, CA", lat: 32.803, lon: -117.263, facing: "W through SW" },
	{ id: "sunset_cliffs", name: "Sunset Cliffs", region: "Point Loma, CA", lat: 32.726, lon: -117.256, facing: "W through SW" },
];

/** Candidates that passed the current health check with a full wave set, plus notes on known
 * siting quirks that matter more than raw distance. */
const BUOYS: { station: string; label: string; note?: string }[] = [
	{ station: "46026", label: "San Francisco, 18nm W" },
	{ station: "46012", label: "Half Moon Bay, 24nm SSW of SF", note: "Reports height and dominant period but no direction or average period." },
	{ station: "46237", label: "San Francisco Bar", note: "Inside the Golden Gate approach, so bay outflow and the bar itself affect it." },
	{ station: "46042", label: "Monterey, 27nm WNW" },
	{ station: "46221", label: "Santa Monica Bay" },
	{ station: "46025", label: "Santa Monica Basin, 33nm WSW" },
	{ station: "46222", label: "San Pedro" },
	{ station: "46224", label: "Oceanside Offshore" },
	{ station: "46086", label: "San Clemente Basin" },
	{ station: "46254", label: "Scripps Nearshore" },
	{ station: "46232", label: "Point Loma South" },
	{ station: "51201", label: "Waimea Bay" },
	{ station: "51211", label: "Pearl Harbor Entrance" },
	{ station: "51212", label: "Barbers Point" },
	{ station: "51206", label: "Hilo" },
];

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** Station position, scraped from the station page's own metadata line. */
async function fetchStationPosition(station: string): Promise<{ lat: number; lon: number } | null> {
	try {
		const res = await fetch(`https://www.ndbc.noaa.gov/station_page.php?station=${station}`, { headers: { "User-Agent": UA } });
		if (!res.ok) return null;
		const html = await res.text();
		// Pages render position as e.g. "21.671 N 158.118 W"
		const m = html.match(/([0-9]+\.[0-9]+)\s*N\s*([0-9]+\.[0-9]+)\s*W/);
		if (!m) return null;
		return { lat: Number(m[1]), lon: -Number(m[2]) };
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	console.log("Resolving buoy positions...\n");
	const positions = new Map<string, { lat: number; lon: number }>();
	for (const b of BUOYS) {
		const pos = await fetchStationPosition(b.station);
		if (pos) positions.set(b.station, pos);
		else console.log(`  could not resolve ${b.station}`);
		await new Promise((r) => setTimeout(r, 600));
	}

	console.log("\nBest buoy per break, by great-circle distance:\n");
	for (const brk of BREAKS) {
		const ranked = BUOYS.map((b) => {
			const pos = positions.get(b.station);
			if (!pos) return null;
			return { ...b, km: haversineKm(brk.lat, brk.lon, pos.lat, pos.lon) };
		})
			.filter((x): x is { station: string; label: string; note?: string; km: number } => x !== null)
			.sort((a, b) => a.km - b.km)
			.slice(0, 3);

		console.log(`${brk.name} (${brk.region}), faces ${brk.facing}`);
		for (const r of ranked) {
			console.log(`    ${r.km.toFixed(0).padStart(4)} km  ${r.station}  ${r.label}${r.note ? `  [${r.note}]` : ""}`);
		}
		console.log("");
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Ranking failed:", err);
		process.exit(1);
	});
}
