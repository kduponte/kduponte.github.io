import { describe, expect, it } from "vitest";
import {
	MIN_LOCAL_LENGTHS,
	SHARK_BASE_INTERVAL_S,
	dlnrIsland,
	excelSerialDate,
	geocodeCandidates,
	haversineKm,
	normalizeSpecies,
	parseDlnrHtml,
	parseLengthM,
	formatInterval,
	sharkReadout,
	sharkPassIntervalS,
	sharkSummary,
	type SharkIncident,
} from "../../src/lib/surf-forecast/sharks";

describe("parseLengthM", () => {
	it.each([
		["Tiger shark, est. 15.4 feet in length", 4.69],
		["Tiger shark, 10 ft. in length", 3.05],
		["Blacktip shark, length 7-8 feet", 2.29],
		["Shark bit paddleboard. Approximately 8'", 2.44],
		["Cookiecutter sharks, length 18-22 inches", 0.51],
		["Large (9 ft) shark attacked side", 2.74],
	])("reads %s", (text, m) => {
		expect(parseLengthM(text)).toBeCloseTo(m, 2);
	});

	it.each(["Species and length unknown.", "Tiger shark", "bitten 100 yards from shore in 200 ft of water"])("finds no length in %s", (text) => {
		// The last one has a number of feet, but 61 m is a depth, not a shark.
		expect(parseLengthM(text)).toBeNull();
	});
});

describe("normalizeSpecies", () => {
	it.each([
		["Tiger shark, est. 15.4 feet in length", "tiger shark"],
		["Galapagos shark, length 10-12 feet", "galapagos shark"],
		["White", "white shark"],
		["Species and length unknown.", "unknown"],
		["Data insufficient.", "unknown"],
		["Unknown", "unknown"],
	])("%s is %s", (text, species) => {
		expect(normalizeSpecies(text)).toBe(species);
	});
});

describe("dlnrIsland", () => {
	it("reads every spelling of an island", () => {
		expect(dlnrIsland("O‘ahu, Makapu‘u, approx 3 feet from shore")).toBe("Oahu");
		expect(dlnrIsland("Oʻahu, Haleʻiwa")).toBe("Oahu");
		expect(dlnrIsland("Oahu, Portlock")).toBe("Oahu");
		expect(dlnrIsland("Hawai‘i, Ka‘alu‘alu Bay")).toBe("Hawaii");
		expect(dlnrIsland("Lāna‘i, Hulopoe")).toBe("Lanai");
		expect(dlnrIsland("Somewhere, else")).toBeNull();
	});
});

describe("geocodeCandidates", () => {
	it("tries each place after the island, without distances from shore", () => {
		expect(geocodeCandidates("Kaua‘i, Hanalei Bay, Middles break, approx 500 yards from shore")).toEqual(["Hanalei Bay", "Middles break"]);
		expect(geocodeCandidates("Maui, 1 mile offshore of Olowalu")).toEqual(["Olowalu"]);
		expect(geocodeCandidates("Maui, Paukūkalo; 100 yds from shore")).toEqual(["Paukūkalo"]);
	});
});

describe("parseDlnrHtml", () => {
	const html = `<table><thead><tr><th>Date and Time</th><th>Location</th><th>Activity</th><th>Water Clarity</th><th>Water Depth</th><th>Victim</th><th>Description</th><th>Shark</th></tr></thead>
	<tbody><tr><td>2026/09/07, 4:32 pm</td><td>Oahu, Portlock, near China Walls</td><td>Surfing</td><td>Turbid</td><td>15-20 ft.</td><td>A. W.</td><td>No injury, Shark bit tail of surfboard.</td><td>Tiger shark, est. 15.4 feet in length</td></tr>
	<tr><td>1995/06/13, 11:50 am</td><td>Maui, Wailea; 200 yds from shore</td><td>Swimming</td><td>Turbid</td><td>20 ft</td><td>D. B.</td><td>Small punctures.</td><td>Tiger shark, length 11 feet.</td></tr></tbody></table>`;

	it("reads date, location and shark by column name", () => {
		const rows = parseDlnrHtml(html);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ date: "2026-09-07", location: "Oahu, Portlock, near China Walls", shark: "Tiger shark, est. 15.4 feet in length" });
		expect(rows[1].date).toBe("1995-06-13");
	});
});

describe("excelSerialDate", () => {
	it("converts CDFW's workbook dates", () => {
		// The first record in CDFW's database: Imperial Beach, 8 October 1950.
		expect(excelSerialDate(18544)).toBe("1950-10-08");
	});
});

describe("haversineKm", () => {
	it("measures the Hilo buoy to the Kona coast at about 107 km, as the break registry says", () => {
		expect(haversineKm(19.779, -154.97, 19.64, -155.996)).toBeGreaterThan(100);
		expect(haversineKm(19.779, -154.97, 19.64, -155.996)).toBeLessThan(115);
	});
});

describe("sharkSummary", () => {
	const buoy = { latitude: 21.0, longitude: -156.4 };
	const inc = (date: string, lat: number | null, species: string, length_m: number | null): SharkIncident => ({
		source: "dlnr",
		date,
		place: "x",
		latitude: lat,
		longitude: lat === null ? null : -156.4,
		species,
		length_m,
	});
	const near = 21.1; // ~11 km north
	const far = 22.0; // ~111 km north
	const incidents = [
		inc("2000-01-01", near, "tiger shark", 3),
		inc("2001-01-01", near, "tiger shark", 4),
		inc("2002-01-01", near, "galapagos shark", 2.5),
		inc("2003-01-01", near, "unknown", null),
		inc("2004-01-01", far, "tiger shark", 5), // too far
		inc("1990-01-01", near, "tiger shark", 6), // before the window
		inc("2022-06-01", near, "tiger shark", 6), // after the window
		inc("2005-01-01", null, "tiger shark", 6), // never located
	];

	it("counts only located incidents within the radius and the window", () => {
		const s = sharkSummary(buoy, incidents, incidents);
		expect(s.incidents_n).toBe(4);
		expect(s.per_year).toBeCloseTo(4 / 27, 2);
	});

	it("names the most often identified species and the median stated length", () => {
		const s = sharkSummary(buoy, incidents, incidents);
		expect(s.species).toBe("tiger shark");
		expect(s.length_m).toBe(3);
		expect(s.length_scope).toBe("local");
		expect(s.lengths_n).toBe(3);
	});

	it(`falls back to the region's median length with fewer than ${MIN_LOCAL_LENGTHS} local ones`, () => {
		const few = incidents.slice(0, 2);
		const s = sharkSummary(buoy, few, incidents);
		expect(s.length_scope).toBe("regional");
		// In-window regional lengths: 3, 4, 2.5, 5, 6 (2005, unlocated, still in the region) -> 4.
		expect(s.length_m).toBe(4);
	});

	it("has nothing to say with no incidents nearby", () => {
		const s = sharkSummary({ latitude: 0, longitude: 0 }, incidents, []);
		expect(s).toMatchObject({ incidents_n: 0, species: null, length_m: null, length_scope: null });
	});
});

describe("sharkPassIntervalS", () => {
	it("passes most often at the sharkiest buoy and proportionally less elsewhere", () => {
		expect(sharkPassIntervalS(40, 40)).toBe(SHARK_BASE_INTERVAL_S);
		expect(sharkPassIntervalS(20, 40)).toBe(2 * SHARK_BASE_INTERVAL_S);
		expect(sharkPassIntervalS(1, 40)).toBe(40 * SHARK_BASE_INTERVAL_S);
	});

	it("never passes with no incidents", () => {
		expect(sharkPassIntervalS(0, 40)).toBeNull();
	});
});

describe("sharkReadout", () => {
	it("says how many, which species, how long and how often", () => {
		expect(sharkReadout({ incidents_n: 59, species: "tiger shark", length_m: 2.74, pass_interval_s: 45 })).toBe(
			"59 recorded shark incidents within 50 km, 1995–2021, mostly tiger sharks: a 2.7 m shadow crosses about every 45 s",
		);
	});

	it("says so when there is no shadow", () => {
		expect(sharkReadout({ incidents_n: 0, species: null, length_m: null, pass_interval_s: null })).toBe(
			"No recorded shark incidents within 50 km, 1995–2021, so no shadow",
		);
	});

	it("rounds long intervals to minutes", () => {
		expect(formatInterval(45)).toBe("45 s");
		expect(formatInterval(885)).toBe("15 min");
	});
});
