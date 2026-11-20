// Shark incident records for the buoy diorama's shark shadow (see src/lib/surf-forecast/sharks.ts).
//
// Snapshots both official lists into data/surf-forecast/sharks/ (committed: the DLNR page changes
// as incidents are added, so the copy used is kept), and geocodes Hawaii's place names:
//   - dlnr-incidents.csv: Hawaii DLNR's shark incidents list, reduced to the three fields used
//     (date, location, the shark). The page also names victims; that stays out of the repo (the
//     page as fetched is kept in the gitignored cache/dlnr/ instead).
//   - cdfw-shark-incidents.csv: the incident sheet of CDFW's Shark Incident Database (1950 to
//     early 2022), extracted from the published ZIP/XLSX with its columns unchanged.
//   - hawaii-geocodes.json: each island and place name tried, and what OpenStreetMap's Nominatim
//     found for it inside that island's bounds (null if nothing). The island goes in the bounds,
//     not the query: OSM files O'ahu's places under Honolulu County, so "X, Oahu" finds nothing.
//     Cached: a re-run only asks about new places.
//   - hawaii-geocode-overrides.json (hand-reviewed, not written here): corrections where Nominatim
//     matched the wrong place, each with its reason. The build applies them over the cache.
//   - manifest.json: where and when each file came from.
//
// Run: npm run surf-forecast:collect-shark-incidents
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { asciiFold, dlnrIsland, geocodeCandidates, geocodeKey, parseDlnrHtml } from "../../../src/lib/surf-forecast/sharks";
import { readZip, xlsxRows } from "./zip-lite";

export const SHARK_DIR = "data/surf-forecast/sharks";
const DLNR_URL = "https://dlnr.hawaii.gov/sharks/shark-incidents/incidents-list/";
const CDFW_URL =
	"https://data.cnra.ca.gov/dataset/022f670f-eb4e-4314-9fad-74f7f9560400/resource/fa77215c-a06c-4fa2-b8bc-ffbcaaa65286/download/sharkincidents_1950_2022_220302.zip";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "forecast-gap-shark-geocoder/1.0";
const GAP_MS = 1100; // Nominatim's usage policy: at most one request per second.

/** Island bounds (west, south, east, north), a little generous, so a place name can't land on the wrong island. */
const ISLAND_BOUNDS: Record<string, [number, number, number, number]> = {
	Oahu: [-158.32, 21.23, -157.62, 21.74],
	Maui: [-156.72, 20.55, -155.95, 21.06],
	Hawaii: [-156.1, 18.88, -154.78, 20.3],
	Kauai: [-159.82, 21.84, -159.26, 22.26],
	Lanai: [-157.09, 20.7, -156.79, 20.94],
	Molokai: [-157.34, 21.04, -156.69, 21.24],
	Niihau: [-160.27, 21.75, -160.04, 22.03],
	Kahoolawe: [-156.72, 20.5, -156.52, 20.62],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Buffer> {
	const res = await fetch(url, { headers: { "User-Agent": UA } });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return Buffer.from(await res.arrayBuffer());
}

const csvCell = (v: string | null) => (v === null ? "" : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

type Geocode = { lat: number; lon: number; name: string } | null;

async function main(): Promise<void> {
	mkdirSync(SHARK_DIR, { recursive: true });
	const fetched = new Date().toISOString();

	// Hawaii DLNR list.
	const dlnrHtml = (await get(DLNR_URL)).toString("utf8");
	mkdirSync("data/surf-forecast/cache/dlnr", { recursive: true });
	writeFileSync("data/surf-forecast/cache/dlnr/incidents.html", dlnrHtml);
	const dlnr = parseDlnrHtml(dlnrHtml);
	writeFileSync(
		`${SHARK_DIR}/dlnr-incidents.csv`,
		`date,location,shark\n${dlnr.map((r) => [r.date, r.location, r.shark].map(csvCell).join(",")).join("\n")}\n`,
	);
	console.log(`DLNR: ${dlnr.length} incidents`);

	// CDFW database: the ZIP holds one XLSX; its first sheet is the incident list.
	const outer = readZip(await get(CDFW_URL));
	const xlsxName = [...outer.keys()].find((n) => n.endsWith(".xlsx"));
	if (!xlsxName) throw new Error("CDFW ZIP has no XLSX");
	const rows = xlsxRows(readZip(outer.get(xlsxName)!)).filter((r) => r.some((c) => c !== null));
	writeFileSync(`${SHARK_DIR}/cdfw-shark-incidents.csv`, `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`);
	console.log(`CDFW: ${rows.length - 1} incidents (${xlsxName})`);

	// Geocode Hawaii place names, island-bounded, cached.
	const cachePath = `${SHARK_DIR}/hawaii-geocodes.json`;
	const cache: Record<string, Geocode> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
	let asked = 0;
	for (const row of dlnr) {
		const island = dlnrIsland(row.location);
		if (!island) continue;
		const [w, s, e, n] = ISLAND_BOUNDS[island];
		for (const place of geocodeCandidates(row.location)) {
			const key = geocodeKey(island, place);
			if (!(key in cache)) {
				let hit: Geocode = null;
				for (const q of [...new Set([place, asciiFold(place)])]) {
					const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=us&bounded=1&viewbox=${w},${n},${e},${s}&q=${encodeURIComponent(q)}`;
					const hits = JSON.parse((await get(url)).toString("utf8")) as { lat: string; lon: string; display_name: string }[];
					asked++;
					await sleep(GAP_MS);
					if (hits[0]) {
						hit = { lat: Number(hits[0].lat), lon: Number(hits[0].lon), name: hits[0].display_name };
						break;
					}
				}
				cache[key] = hit;
			}
			if (cache[key]) break; // the most specific place that was found wins
		}
	}
	writeFileSync(cachePath, `${JSON.stringify(cache, null, "\t")}\n`);
	console.log(`Geocoding: ${asked} new queries, ${Object.keys(cache).length} cached`);

	writeFileSync(
		`${SHARK_DIR}/manifest.json`,
		`${JSON.stringify(
			{
				"dlnr-incidents.csv": {
					source: DLNR_URL,
					publisher: "Hawaii Department of Land and Natural Resources",
					fields: "date, location, shark (victim names and descriptions omitted)",
					fetched,
				},
				"cdfw-shark-incidents.csv": {
					source: CDFW_URL,
					publisher: "California Department of Fish and Wildlife, Shark Incident Database",
					sheet: `${xlsxName}, first sheet`,
					fetched,
				},
				"hawaii-geocodes.json": { source: NOMINATIM, publisher: "OpenStreetMap contributors (ODbL), via Nominatim", fetched },
			},
			null,
			"\t",
		)}\n`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
