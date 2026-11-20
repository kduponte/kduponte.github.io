// What NDBC's station page says about each of the twelve buoys: who runs it, what hull it is, how
// deep the water is under it, and where its sensors sit. The page is the one public place each
// station describes itself, so the buoy profiles at the end of the Forecast Gap read these fields
// (collected by scripts/surf-forecast/collect/collect-buoy-stations.ts) rather than generic specs.
//
// A page describes the station as deployed on the day it is fetched, which can postdate the
// January to September 2026 window.

export interface StationPage {
	station: string;
	/** The page's own name for the station, without the CDIP number. */
	title: string;
	/** Scripps' Coastal Data Information Program station number, where the page gives one. */
	cdip: string | null;
	owner: string | null;
	/** "Data provided by" or "Information submitted by". */
	data_from: string | null;
	/** The page's hull line, verbatim (e.g. "Waverider Buoy"). */
	hull: string;
	/** Further lines between the hull and the position (e.g. "SCOOP payload"). */
	payload: string[];
	latitude: number;
	longitude: number;
	water_depth_m: number | null;
	sea_temp_depth_m: number | null;
	air_temp_height_m: number | null;
	anemometer_height_m: number | null;
	watch_circle_m: number | null;
}

const YARD_M = 0.9144;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
	return s
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
		.replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** The page's visible text, one trimmed, non-empty line per text node. */
export function pageLines(html: string): string[] {
	return decode(html.replace(/<script[\s\S]*?<\/script>/gi, "\n").replace(/<style[\s\S]*?<\/style>/gi, "\n").replace(/<[^>]*>/g, "\n"))
		.split("\n")
		.map((l) => l.replace(/\s+/g, " ").trim())
		.filter(Boolean);
}

/** A leading number and unit, in metres: "16.76 m", "0.46 m below water line", "1757 yards". */
export function lengthM(value: string): number | null {
	const m = value.match(/^(\d+(?:\.\d+)?)\s*(m|yards?|yds?)\b/i);
	if (!m) return null;
	const n = Number(m[1]);
	return /^y/i.test(m[2]) ? n * YARD_M : n;
}

/** "Waimea Bay, HI (106)" -> name and CDIP number; "MONTEREY - 27NM WNW of Monterey, CA" has none. */
export function splitTitle(raw: string): { title: string; cdip: string | null } {
	const t = raw.replace(/\s+/g, " ").trim();
	const m = t.match(/^(.*?)\s*\((\d{3})\)$/);
	return m ? { title: m[1], cdip: m[2] } : { title: t, cdip: null };
}

const STOP = /^(Latest NWS Marine Forecast|Search And Rescue|Important Notice|Meteorological Observations)/;
const POSITION = /^(\d+(?:\.\d+)?) ([NS]) (\d+(?:\.\d+)?) ([EW])\b/;

/** One station page's fields. Throws if the page has no station block or position. */
export function parseStationPage(station: string, html: string): StationPage {
	const lines = pageLines(html);
	const start = lines.findIndex((l) => new RegExp(`^Station ${station}\\b`).test(l));
	if (start < 0) throw new Error(`${station}: no station block`);
	const stop = lines.findIndex((l, i) => i > start && STOP.test(l));
	const block = lines.slice(start, stop < 0 ? undefined : stop);

	const jsTitle = html.match(/currentstnname\s*=\s*'([^']*)'/)?.[1];
	const headTitle = block[0].replace(new RegExp(`^Station ${station}\\s*-?\\s*`), "");
	const { title, cdip } = splitTitle(decode(jsTitle ?? headTitle));

	// "Owned and maintained by" and "Data provided by" carry their value on the same line or the next.
	let cursor = 1;
	const labelled = (label: RegExp): string | null => {
		const i = block.findIndex((l) => label.test(l));
		if (i < 0) return null;
		const rest = block[i].replace(label, "").trim();
		cursor = Math.max(cursor, rest ? i + 1 : i + 2);
		return rest || block[i + 1] || null;
	};
	const owner = labelled(/^Owned and maintained by/);
	const dataFrom = labelled(/^(Data provided by|Information submitted by)/);

	const posAt = block.findIndex((l) => POSITION.test(l));
	if (posAt < 0) throw new Error(`${station}: no position`);
	const [, lat, ns, lon, ew] = block[posAt].match(POSITION)!;
	// Between the owner lines and the position: the hull, then anything it carries. The LLNR light
	// list number and the station's own name line sit above the owner and are skipped.
	const between = block.slice(cursor, posAt).filter((l) => !/^\(LLNR/.test(l) && !/^- /.test(l));
	if (!between.length) throw new Error(`${station}: no hull line`);

	const field = (label: string): string | null => {
		const i = block.findIndex((l) => l === `${label}:`);
		return i < 0 ? null : (block[i + 1] ?? null);
	};
	const len = (label: string) => {
		const v = field(label);
		return v === null ? null : lengthM(v);
	};

	return {
		station,
		title,
		cdip,
		owner,
		data_from: dataFrom,
		hull: between[0],
		payload: between.slice(1),
		latitude: Number(lat) * (ns === "S" ? -1 : 1),
		longitude: Number(lon) * (ew === "W" ? -1 : 1),
		water_depth_m: len("Water depth"),
		sea_temp_depth_m: len("Sea temp depth"),
		air_temp_height_m: len("Air temp height"),
		anemometer_height_m: len("Anemometer height"),
		watch_circle_m: len("Watch circle radius"),
	};
}
