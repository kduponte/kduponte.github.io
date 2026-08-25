// Pure parsing/aggregation for Google Trends search-interest data (data/toyota-truck/raw/
// market-value/search_interest_raw.csv). That file is a one-time, hand-captured snapshot, not an
// automated scrape: trends.google.com/robots.txt explicitly disallows /trends/explore? for every
// crawler, so this project pulled the real monthly series once, by hand, the same way the 1984
// MSRP fact was captured, rather than building a recurring collector against a page the site has
// asked not to be crawled. See MarketValueSection.astro for the full disclosure.

export interface SearchInterestRow {
	month: string; // "YYYY-MM"
	term_22re: string;
	term_22r: string;
	term_vintage_toyota_pickup: string;
	term_90s_toyota_truck: string;
}

export interface SearchInterestPoint {
	month: string;
	term_22re: number;
	term_22r: number;
	term_vintage_toyota_pickup: number;
	term_90s_toyota_truck: number;
}

export function toSearchInterestPoints(rows: SearchInterestRow[]): SearchInterestPoint[] {
	return rows
		.map((row) => ({
			month: row.month,
			term_22re: Number(row.term_22re),
			term_22r: Number(row.term_22r),
			term_vintage_toyota_pickup: Number(row.term_vintage_toyota_pickup),
			term_90s_toyota_truck: Number(row.term_90s_toyota_truck),
		}))
		.filter(
			(p) =>
				/^\d{4}-\d{2}$/.test(p.month) &&
				Number.isFinite(p.term_22re) &&
				Number.isFinite(p.term_22r) &&
				Number.isFinite(p.term_vintage_toyota_pickup) &&
				Number.isFinite(p.term_90s_toyota_truck),
		);
}

export interface YearlyAverage {
	year: number;
	avg_22re: number;
	avg_22r: number;
	avg_vintage_toyota_pickup: number;
	avg_90s_toyota_truck: number;
	months_counted: number;
	partial_year: boolean;
}

/** Averages the noisy monthly series into one point per calendar year, the real, readable signal
 * for a chart. A year with fewer than 12 months (only the current year, 2026, in this dataset) is
 * marked partial rather than silently averaged as if it were a complete year. */
export function yearlyAverage(points: SearchInterestPoint[]): YearlyAverage[] {
	const byYear = new Map<number, SearchInterestPoint[]>();
	for (const point of points) {
		const year = Number(point.month.slice(0, 4));
		const group = byYear.get(year) ?? [];
		group.push(point);
		byYear.set(year, group);
	}
	const avg = (group: SearchInterestPoint[], key: keyof SearchInterestPoint) =>
		group.reduce((sum, p) => sum + (p[key] as number), 0) / group.length;
	return [...byYear.entries()]
		.map(([year, group]) => ({
			year,
			avg_22re: avg(group, "term_22re"),
			avg_22r: avg(group, "term_22r"),
			avg_vintage_toyota_pickup: avg(group, "term_vintage_toyota_pickup"),
			avg_90s_toyota_truck: avg(group, "term_90s_toyota_truck"),
			months_counted: group.length,
			partial_year: group.length < 12,
		}))
		.sort((a, b) => a.year - b.year);
}
