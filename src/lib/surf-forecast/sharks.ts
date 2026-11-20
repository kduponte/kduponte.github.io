// Recorded shark incidents near each buoy, for the shark shadow that sometimes crosses the hero
// diorama's water.
//
// Two official lists, one rule:
//   - Hawaii: the Department of Land and Natural Resources' list of shark incidents (1995 on). It
//     gives an island and a place name, not coordinates, so place names are geocoded (cached and
//     committed for review; an incident whose place can't be found is left out and counted).
//   - California: the Department of Fish and Wildlife's Shark Incident Database (1950 to early
//     2022), which carries coordinates.
//   - Per buoy: incidents within SHARK_RADIUS_KM of the buoy, over the years both lists cover
//     (SHARK_WINDOW). A radius rather than an island or county, because the Big Island's Kona
//     coast is 107 km from the Hilo buoy, and the San Francisco Bar buoy sits off three counties.
//
// These are incidents (bites and bumps on people and boards), a measure of encounters where people
// are in the water, not of how many sharks live there.

export interface SharkIncident {
	source: "dlnr" | "cdfw";
	/** YYYY-MM-DD. */
	date: string;
	place: string;
	latitude: number | null;
	longitude: number | null;
	/** Lower-case common name, or "unknown". */
	species: string;
	/** Estimated length in metres, when the record gives one. */
	length_m: number | null;
}

export const SHARK_RADIUS_KM = 50;
export const SHARK_WINDOW = { from: "1995-01-01", to: "2021-12-31" } as const;

const FT = 0.3048;

/**
 * An estimated shark length from free text, in metres: "est. 15.4 feet", "10 ft.", "length 7-8
 * feet" (a range gives its midpoint), "Approximately 8'", "18-22 inches". Null when there is none.
 */
export function parseLengthM(text: string): number | null {
	const m = text.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(feet|foot|ft\b|ft\.|'|inches|inch|in\.)/i);
	if (!m) return null;
	const a = Number(m[1]);
	const b = m[2] ? Number(m[2]) : a;
	const value = (a + b) / 2;
	const unit = m[3].toLowerCase();
	const metres = unit.startsWith("in") ? value * 0.0254 : value * FT;
	// Anything outside the size of real sharks is a misread (a depth, a distance), not a length.
	return metres > 0.2 && metres < 8 ? Math.round(metres * 100) / 100 : null;
}

/** A lower-case common name from a record's species text; "unknown" when not identified. */
export function normalizeSpecies(text: string): string {
	const t = text.toLowerCase();
	if (/species (and length )?unknown|data insufficient|^unknown|not identified/.test(t)) return "unknown";
	if (t.startsWith("white") || t.includes("white shark") || t.includes("great white")) return "white shark";
	const m = t.match(/^([a-z' -]+?shark)/);
	return m ? m[1].trim() : t.split(/[,;(]/)[0].trim() || "unknown";
}

/** DLNR's island spellings (with and without the ʻokina and kahakō) to one name. */
export function dlnrIsland(location: string): string | null {
	const first = location.split(",")[0].normalize("NFD").replace(/[̀-ͯ‘ʻ'`]/g, "").trim().toLowerCase();
	const islands: Record<string, string> = {
		oahu: "Oahu",
		maui: "Maui",
		hawaii: "Hawaii",
		kauai: "Kauai",
		lanai: "Lanai",
		molokai: "Molokai",
		niihau: "Niihau",
		kahoolawe: "Kahoolawe",
	};
	return islands[first] ?? null;
}

/**
 * Place names to try for geocoding a DLNR location, most specific first: each part after the
 * island, with distances ("approx 100 yards from shore", "1 mile offshore of") stripped.
 */
export function geocodeCandidates(location: string): string[] {
	const parts = location.split(/[,;]/).slice(1);
	const out: string[] = [];
	for (const raw of parts) {
		const p = raw
			.replace(/\b(approx\.?|approximately|about|roughly)\b/gi, "")
			.replace(/\b\d+(\.\d+)?\s*(-\s*\d+\s*)?(yards?|yds?\.?|feet|ft\.?|miles?|mi\.?|meters?|m)\b\s*(offshore|from|off|out)?\s*(of)?\s*(shore)?/gi, "")
			.replace(/\b(off\s*shore|offshore|off|near|outside|inside|in front)\s+(of\s+)?/gi, "")
			.replace(/\bfrom shore\b|\bshore\b/gi, "")
			.replace(/^\s*of\s+/i, "")
			.replace(/\s+/g, " ")
			.trim();
		if (p.length >= 3 && /[a-z]/i.test(p) && !out.includes(p)) out.push(p);
	}
	return out;
}

/** Hawaiian diacritics (ʻokina, kahakō) folded to plain ASCII, as a second geocoding attempt. */
export function asciiFold(text: string): string {
	return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[‘ʻ’`]/g, "");
}

/** The geocode cache key for a place on an island. */
export const geocodeKey = (island: string, place: string) => `${island}|${place}`;

/** The DLNR incidents table (date, location, activity, ..., shark), as text cells. */
export function parseDlnrHtml(html: string): { date: string; location: string; shark: string; description: string }[] {
	const text = (s: string) =>
		s
			.replace(/<[^>]+>/g, "")
			.replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "‘")
			.replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
			.replace(/&amp;/g, "&")
			.replace(/&#039;|&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
			.trim();
	const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => text(c[1])));
	const header = rows.findIndex((r) => r[0]?.toLowerCase().startsWith("date"));
	if (header < 0) return [];
	const h = rows[header].map((c) => c.toLowerCase());
	const col = (name: string) => h.findIndex((c) => c.startsWith(name));
	const [di, li, si, ds] = [col("date"), col("location"), col("shark"), col("description")];
	return rows
		.slice(header + 1)
		.filter((r) => /^\d{4}\/\d{2}\/\d{2}/.test(r[di] ?? ""))
		.map((r) => ({ date: r[di].slice(0, 10).replace(/\//g, "-"), location: r[li], shark: r[si] ?? "", description: r[ds] ?? "" }));
}

/** An Excel date serial (1900 system, as CDFW's workbook stores dates) to YYYY-MM-DD. */
export function excelSerialDate(serial: number): string {
	return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10);
}

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const r = (d: number) => (d * Math.PI) / 180;
	const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Fewer stated lengths than this nearby, and the shadow takes the region's median instead. */
export const MIN_LOCAL_LENGTHS = 3;

export interface SharkSummary {
	incidents_n: number;
	per_year: number;
	/** Most often identified species among them, or null if none was identified. */
	species: string | null;
	/** Median stated length, metres: local when enough incidents give one, else the region's. */
	length_m: number | null;
	length_scope: "local" | "regional" | null;
	lengths_n: number;
}

const yearsIn = (w: { from: string; to: string }) => (Date.parse(w.to) - Date.parse(w.from)) / (365.25 * 86_400_000) + 1 / 365.25;

/**
 * The incidents within `radiusKm` of a buoy in the window, with the species and length the shadow
 * draws. `regional` are the same region's incidents (any distance), for the length fallback.
 */
export function sharkSummary(
	buoy: { latitude: number; longitude: number },
	incidents: SharkIncident[],
	regional: SharkIncident[],
	radiusKm = SHARK_RADIUS_KM,
	window: { from: string; to: string } = SHARK_WINDOW,
): SharkSummary {
	const inWindow = (i: SharkIncident) => i.date >= window.from && i.date <= window.to;
	const near = incidents.filter(
		(i) => inWindow(i) && i.latitude !== null && i.longitude !== null && haversineKm(buoy.latitude, buoy.longitude, i.latitude, i.longitude) <= radiusKm,
	);
	const counts = new Map<string, number>();
	for (const i of near) if (i.species !== "unknown") counts.set(i.species, (counts.get(i.species) ?? 0) + 1);
	const species = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
	const local = near.map((i) => i.length_m).filter((l): l is number => l !== null);
	const region = regional.filter(inWindow).map((i) => i.length_m).filter((l): l is number => l !== null);
	const useLocal = local.length >= MIN_LOCAL_LENGTHS;
	return {
		incidents_n: near.length,
		per_year: Math.round((near.length / yearsIn(window)) * 100) / 100,
		species,
		length_m: useLocal ? median(local) : region.length ? median(region) : null,
		length_scope: useLocal ? "local" : region.length ? "regional" : null,
		lengths_n: useLocal ? local.length : region.length,
	};
}

/**
 * The sharkiest buoy's shadow crosses this often, in seconds; every other buoy proportionally
 * less. A crossing takes about 15 s at the buoys' drawing scale, so even there the water is
 * empty most of the time.
 */
export const SHARK_BASE_INTERVAL_S = 45;

/**
 * Seconds between shadow passes for a buoy with `n` incidents when the most at any buoy is
 * `maxN`: in proportion to the incident count, so a buoy with half the incidents sees the shadow
 * half as often. Null (never) for no incidents.
 */
export function sharkPassIntervalS(n: number, maxN: number, base = SHARK_BASE_INTERVAL_S): number | null {
	if (n <= 0 || maxN <= 0) return null;
	return Math.round(base * (maxN / n));
}

/** "45 s" under a minute and a half, else whole minutes. */
export function formatInterval(seconds: number): string {
	return seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
}

/** The readout line for a buoy's sharks. */
export function sharkReadout(
	s: { incidents_n: number; species: string | null; length_m: number | null; pass_interval_s: number | null },
	radiusKm = SHARK_RADIUS_KM,
	window: { from: string; to: string } = SHARK_WINDOW,
): string {
	const span = `within ${radiusKm} km, ${window.from.slice(0, 4)}–${window.to.slice(0, 4)}`;
	if (s.incidents_n === 0 || s.pass_interval_s === null) return `No recorded shark incidents ${span}, so no shadow`;
	const what = s.species ? `mostly ${s.species}s` : "species not identified";
	const shadow = s.length_m ? `a ${s.length_m.toFixed(1)} m shadow crosses about every ${formatInterval(s.pass_interval_s)}` : `a shadow crosses about every ${formatInterval(s.pass_interval_s)}`;
	return `${s.incidents_n} recorded shark incident${s.incidents_n === 1 ? "" : "s"} ${span}, ${what}: ${shadow}`;
}
