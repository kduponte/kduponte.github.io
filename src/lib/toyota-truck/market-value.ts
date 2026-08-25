// Pure parsing/aggregation for the market-value data (Hagerty condition pricing, Hagerty's own
// aggregated past sales, and a handful of directly-verified Bring a Trailer / Cars & Bids sales
// found and checked by hand). Same "simple counting/parsing, not inference, but tested like every
// other computed claim" discipline as src/lib/toyota-truck/aggregate.ts.

export interface ValueByYearPoint {
	year: number;
	price_usd: number;
	model: string;
	source: string;
}

export interface SaleRecord {
	year: number;
	price_usd: number;
	mileage: number | null;
	sale_date: string | null;
	platform: string;
	description: string;
	detail_url: string;
}

/** Hagerty's past-sales cards render as e.g. "1988 Toyota Pickup SR5", extracts the leading year. */
export function parseYearFromDescription(description: string): number | null {
	const match = description.match(/^(19|20)\d{2}/);
	return match ? Number(match[0]) : null;
}

export interface HagertyValueRow {
	model: string;
	year: string;
	price_usd: string;
}

export function toValueByYearPoints(rows: HagertyValueRow[]): ValueByYearPoint[] {
	return rows
		.map((row) => ({
			year: Number(row.year),
			price_usd: Number(row.price_usd.replace(/,/g, "")),
			model: row.model,
			source: "Hagerty (#3 Good condition)",
		}))
		.filter((p) => Number.isFinite(p.year) && Number.isFinite(p.price_usd));
}

export interface HagertyPastSaleRow {
	sale_year_model_trim: string;
	price_usd: string;
	mileage: string;
	sale_date: string;
	auction_platform: string;
	detail_url: string;
}

export function hagertyPastSalesToRecords(rows: HagertyPastSaleRow[]): SaleRecord[] {
	return rows
		.map((row) => {
			const year = parseYearFromDescription(row.sale_year_model_trim);
			const price = Number(row.price_usd.replace(/,/g, ""));
			if (year === null || !Number.isFinite(price)) return null;
			return {
				year,
				price_usd: price,
				mileage: row.mileage ? Number(row.mileage.replace(/,/g, "")) : null,
				sale_date: row.sale_date || null,
				platform: row.auction_platform,
				description: row.sale_year_model_trim,
				detail_url: row.detail_url,
			};
		})
		.filter((r): r is SaleRecord => r !== null);
}

export interface CuratedSaleRow {
	description: string;
	year: string;
	price_usd: string;
	mileage: string;
	sale_date: string;
	platform: string;
	detail_url: string;
}

export function curatedSalesToRecords(rows: CuratedSaleRow[]): SaleRecord[] {
	return rows.map((row) => ({
		year: Number(row.year),
		price_usd: Number(row.price_usd),
		mileage: row.mileage ? Number(row.mileage) : null,
		sale_date: row.sale_date || null,
		platform: row.platform,
		description: row.description,
		detail_url: row.detail_url,
	}));
}

/** De-dupes sales by detail_url (Hagerty's own listing can overlap with a directly-verified one)
 * and sorts by year ascending, for a clean time-series/scatter input. */
export function combineSales(...groups: SaleRecord[][]): SaleRecord[] {
	const byUrl = new Map<string, SaleRecord>();
	for (const group of groups) {
		for (const record of group) {
			const key = record.detail_url || `${record.year}-${record.price_usd}-${record.description}`;
			byUrl.set(key, record);
		}
	}
	return [...byUrl.values()].sort((a, b) => a.year - b.year);
}

export interface YearSummary {
	year: number;
	median: number;
	min: number;
	max: number;
	count: number;
}

/** Groups sales by model year and summarizes median/min/max, sorted ascending by year. A year
 * with only one sale still gets a row (min === max === median === that price), the chart layer
 * decides whether a single point earns an error bar, this function just reports what's real. */
export function medianByModelYear(sales: SaleRecord[]): YearSummary[] {
	const byYear = new Map<number, number[]>();
	for (const sale of sales) {
		const prices = byYear.get(sale.year) ?? [];
		prices.push(sale.price_usd);
		byYear.set(sale.year, prices);
	}
	return [...byYear.entries()]
		.map(([year, prices]) => {
			const sorted = [...prices].sort((a, b) => a - b);
			const mid = Math.floor(sorted.length / 2);
			const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
			return { year, median, min: sorted[0], max: sorted[sorted.length - 1], count: sorted.length };
		})
		.sort((a, b) => a.year - b.year);
}

/** Hagerty past-sale dates render as "Aug 5, 2026"; directly-verified curated sales use ISO
 * ("2022-06-20") or a bare year ("2020"). Handles all three, returns null for anything else
 * (including no date at all) rather than guessing. */
export function parseSaleCalendarYear(saleDate: string | null): number | null {
	if (!saleDate) return null;
	const isoMatch = saleDate.match(/^(19|20)\d{2}-\d{2}-\d{2}$/);
	if (isoMatch) return Number(saleDate.slice(0, 4));
	const bareYearMatch = saleDate.match(/^(19|20)\d{2}$/);
	if (bareYearMatch) return Number(saleDate);
	const monthDayYearMatch = saleDate.match(/(19|20)\d{2}$/);
	if (monthDayYearMatch) return Number(monthDayYearMatch[0]);
	return null;
}

export interface CalendarSalePoint {
	calendar_year: number;
	price_usd: number;
	model_year: number;
	platform: string;
	description: string;
}

/** Sales with a real, parseable sale date, for a by-calendar-year view. Drops anything undated
 * rather than guessing when it sold. */
export function salesByCalendarYear(sales: SaleRecord[]): CalendarSalePoint[] {
	return sales
		.map((sale) => {
			const calendarYear = parseSaleCalendarYear(sale.sale_date);
			if (calendarYear === null) return null;
			return { calendar_year: calendarYear, price_usd: sale.price_usd, model_year: sale.year, platform: sale.platform, description: sale.description };
		})
		.filter((p): p is CalendarSalePoint => p !== null)
		.sort((a, b) => a.calendar_year - b.calendar_year);
}

export interface ClassicComYearRow {
	year: string;
	median_price_usd: string;
	p25_price_usd: string;
	p75_price_usd: string;
	min_price_usd: string;
	max_price_usd: string;
	note: string;
}

export interface ClassicComYearSummary {
	year: number;
	median: number;
	p25: number | null;
	p75: number | null;
	min: number | null;
	max: number | null;
	note: string;
}

/** classic.com's real market-page chart (median/25th-75th percentile/range by model year) is
 * rendered via a Phoenix LiveView + Vega setup that pushes its data over a live connection after
 * load, not embedded in the static HTML, and the site sits behind Cloudflare's bot-challenge for
 * unauthenticated automated access, so this isn't a repeatable scraper, it's a one-time hand-read
 * of the real chart (canvas exported at its native 1052x600 resolution for an accurate read),
 * same treatment as the 1984 MSRP fact and the Google Trends pull. Values are honest visual reads
 * against the chart's own gridlines, not exact to the dollar, rounded to the nearest $500. */
export function toClassicComYearSummaries(rows: ClassicComYearRow[]): ClassicComYearSummary[] {
	const parseOrNull = (value: string): number | null => (value ? Number(value) : null);
	return rows
		.map((row) => ({
			year: Number(row.year),
			median: Number(row.median_price_usd),
			p25: parseOrNull(row.p25_price_usd),
			p75: parseOrNull(row.p75_price_usd),
			min: parseOrNull(row.min_price_usd),
			max: parseOrNull(row.max_price_usd),
			note: row.note ?? "",
		}))
		.filter((s) => Number.isFinite(s.year) && Number.isFinite(s.median))
		.sort((a, b) => a.year - b.year);
}
