// Build: recorded shark incidents near each buoy, for the diorama's shark shadow.
//
// Reads the snapshots in data/surf-forecast/sharks/ (collect-shark-incidents.ts), normalizes both
// lists to SharkIncident, and summarizes each buoy with sharkSummary (tested): incidents within
// SHARK_RADIUS_KM over SHARK_WINDOW, the species most often identified, the median stated length,
// and how often the shadow crosses (in proportion to the count; sharkPassIntervalS).
//
// Writes public/data/surf-forecast/buoy-sharks.json
// Run: npm run surf-forecast:build-buoy-sharks
import { readFileSync, writeFileSync } from "node:fs";
import {
	SHARK_BASE_INTERVAL_S,
	SHARK_RADIUS_KM,
	SHARK_WINDOW,
	dlnrIsland,
	excelSerialDate,
	geocodeCandidates,
	geocodeKey,
	haversineKm,
	normalizeSpecies,
	parseLengthM,
	sharkPassIntervalS,
	sharkSummary,
	type SharkIncident,
} from "../../src/lib/surf-forecast/sharks";
import { BUOYS, regionOfStation } from "../../src/lib/surf-forecast/spots";

const DIR = "data/surf-forecast/sharks";
const OUT = "public/data/surf-forecast/buoy-sharks.json";

type Geocode = { lat: number; lon: number; name: string } | null;

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ",") {
			row.push(cell);
			cell = "";
		} else if (ch === "\n") {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += ch;
	}
	if (cell || row.length) rows.push([...row, cell]);
	return rows;
}

function hawaii(): { incidents: SharkIncident[]; unlocated: string[] } {
	// Reviewed corrections (hawaii-geocode-overrides.json, each with its reason) win over Nominatim.
	const geocodes = {
		...(JSON.parse(readFileSync(`${DIR}/hawaii-geocodes.json`, "utf8")) as Record<string, Geocode>),
		...(JSON.parse(readFileSync(`${DIR}/hawaii-geocode-overrides.json`, "utf8")) as Record<string, Geocode>),
	};
	const unlocated: string[] = [];
	const [, ...dlnrRows] = parseCsv(readFileSync(`${DIR}/dlnr-incidents.csv`, "utf8"));
	const rows = dlnrRows.filter((r) => r.length >= 3 && r[0]).map(([date, location, shark]) => ({ date, location, shark }));
	const incidents = rows.map((r): SharkIncident => {
		const island = dlnrIsland(r.location);
		const hit = island
			? geocodeCandidates(r.location)
					.map((p) => geocodes[geocodeKey(island, p)])
					.find((g): g is NonNullable<Geocode> => !!g)
			: undefined;
		if (!hit) unlocated.push(`${r.date} ${r.location}`);
		return {
			source: "dlnr",
			date: r.date,
			place: r.location,
			latitude: hit?.lat ?? null,
			longitude: hit?.lon ?? null,
			species: normalizeSpecies(r.shark),
			length_m: parseLengthM(r.shark),
		};
	});
	return { incidents, unlocated };
}

function california(): SharkIncident[] {
	const [header, ...rows] = parseCsv(readFileSync(`${DIR}/cdfw-shark-incidents.csv`, "utf8"));
	const col = (name: string) => header.indexOf(name);
	const [date, place, species, comment, lon, lat] = ["Date", "Location", "Species", "Comment", "Longitude", "Latitude"].map(col);
	return rows
		.filter((r) => Number.isFinite(Number(r[date])) && r[date] !== "")
		.map((r) => ({
			source: "cdfw" as const,
			date: excelSerialDate(Number(r[date])),
			place: r[place] ?? "",
			latitude: r[lat] ? Number(r[lat]) : null,
			longitude: r[lon] ? Number(r[lon]) : null,
			species: normalizeSpecies(r[species] ?? ""),
			length_m: parseLengthM(r[comment] ?? ""),
		}));
}

function main(): void {
	const hi = hawaii();
	const ca = california();
	console.log(`Hawaii: ${hi.incidents.length} incidents, ${hi.unlocated.length} unlocated`);
	for (const u of hi.unlocated) console.log(`  unlocated: ${u}`);
	console.log(`California: ${ca.length} incidents, ${ca.filter((i) => i.latitude === null).length} without coordinates`);

	const summaries = Object.values(BUOYS).map((b) => {
		const regional = regionOfStation(b.station) === "hawaii" ? hi.incidents : ca;
		return { station: b.station, name: b.name, ...sharkSummary(b, regional, regional) };
	});
	const maxN = Math.max(...summaries.map((s) => s.incidents_n));
	const stations = Object.fromEntries(
		summaries.map(({ station, name, ...s }) => [station, { name, ...s, pass_interval_s: sharkPassIntervalS(s.incidents_n, maxN) }]),
	);
	for (const [st, s] of Object.entries(stations)) {
		const nearest = (regionOfStation(st) === "hawaii" ? hi.incidents : ca)
			.filter((i) => i.latitude !== null && i.date >= SHARK_WINDOW.from && i.date <= SHARK_WINDOW.to)
			.map((i) => haversineKm(BUOYS[st].latitude, BUOYS[st].longitude, i.latitude!, i.longitude!))
			.sort((a, b) => a - b)[0];
		console.log(
			`${st} ${s.name.padEnd(22)} n=${String(s.incidents_n).padStart(3)}  ${s.species ?? "-"}  ${s.length_m ?? "-"} m (${s.length_scope}, ${s.lengths_n})  every ${s.pass_interval_s ?? "never"} s  nearest ${nearest?.toFixed(0)} km`,
		);
	}

	writeFileSync(
		OUT,
		`${JSON.stringify(
			{
				window: SHARK_WINDOW,
				radius_km: SHARK_RADIUS_KM,
				base_interval_s: SHARK_BASE_INTERVAL_S,
				method:
					"Recorded shark incidents within the radius of each buoy over the window. Hawaii: DLNR's incident list, place names geocoded with OpenStreetMap Nominatim within the island; California: CDFW's Shark Incident Database coordinates. The shadow's length is the median stated length nearby (at least 3), else the region's.",
				sources: [
					{ name: "Hawaii DLNR, Shark Incidents List", url: "https://dlnr.hawaii.gov/sharks/shark-incidents/incidents-list/" },
					{ name: "CDFW, Shark Incident Database (1950–2022)", url: "https://data.cnra.ca.gov/dataset/shark-incident-database-california" },
				],
				hawaii_unlocated_n: hi.unlocated.length,
				stations,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`\nWrote ${OUT}`);
}

main();
