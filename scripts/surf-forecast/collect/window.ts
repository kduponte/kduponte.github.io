// The analysis window, fixed rather than rolling so every number on the page is reproducible.
//
// Open-Meteo's marine archive serves lead-time forecasts from January 2026 onward and nothing
// earlier, on any host (see spike-final.ts). Nine complete months keeps every monthly breakdown on
// equal footing and avoids publishing a partial month that would change on the next run.

export const WINDOW_START = "2026-01-01";
export const WINDOW_END = "2026-09-30";

export const WINDOW_MONTHS = [
	"2026-01",
	"2026-02",
	"2026-03",
	"2026-04",
	"2026-05",
	"2026-06",
	"2026-07",
	"2026-08",
	"2026-09",
];

/** First and last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export function monthRange(month: string): { start: string; end: string } {
	const [y, m] = month.split("-").map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}
