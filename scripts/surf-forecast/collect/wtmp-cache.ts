// NDBC monthly standard meteorological files, cached decompressed, for the snapshot water
// temperatures (collect-snapshot-water-temp.ts) and the snapshot build that re-attaches them.
export const STDMET_CACHE_DIR = "data/surf-forecast/cache/ndbc-stdmet";

/** Cache file for one station's month of the snapshot hour, e.g. 51201_2026-09.txt. */
export const stdmetCachePath = (station: string, validTime: string) => `${STDMET_CACHE_DIR}/${station}_${validTime.slice(0, 7)}.txt`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * NDBC's URL for a station's month of the current year's quality-controlled data: the month's
 * folder, and a file named station + month code (1-9, then a-c) + year.
 */
export function stdmetMonthUrl(station: string, validTime: string): string {
	const year = validTime.slice(0, 4);
	const m = Number(validTime.slice(5, 7));
	const code = m < 10 ? String(m) : "abc"[m - 10];
	return `https://www.ndbc.noaa.gov/data/stdmet/${MONTHS[m - 1]}/${station}${code}${year}.txt.gz`;
}
