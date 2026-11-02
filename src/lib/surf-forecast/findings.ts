// Build-time lookups for the numbers quoted in the page's prose.
//
// Every figure a sentence states is read from the same frozen JSON the charts draw from, at build
// time, so prose and chart cannot drift apart. A lookup that finds nothing throws, which fails the
// build: a sentence quoting a number that no longer exists should break loudly, not render as
// "undefined" or, worse, keep a stale figure typed in by hand.

export const METRES_TO_FEET = 3.28084;

export interface LookupRow {
	scope: string;
	source: string;
	variable: string;
	lead_days: number;
}

export function pick<T extends LookupRow>(rows: T[], scope: string, source: string, variable: string, lead: number): T {
	const found = rows.find((r) => r.scope === scope && r.source === source && r.variable === variable && r.lead_days === lead);
	if (!found) throw new Error(`no row for ${scope}/${source}/${variable}/lead ${lead}`);
	return found;
}

export function need<T>(value: T | null | undefined, what: string): T {
	if (value === null || value === undefined) throw new Error(`missing value: ${what}`);
	return value;
}

/** Metres to a feet string with a fixed number of decimals. */
export function ft(metres: number, digits = 2): string {
	return (metres * METRES_TO_FEET).toFixed(digits);
}

/** Signed feet, with an explicit plus for positive values. */
export function signedFt(metres: number, digits = 2): string {
	const v = metres * METRES_TO_FEET;
	return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

export function signed(x: number, digits = 2): string {
	return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)}`;
}

export function pct(fraction: number): string {
	return `${Math.round(fraction * 100)}%`;
}

/** Joins region names into prose: "Hawaii", "Hawaii and Northern California", "a, b and c". */
export function listJoin(items: string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
