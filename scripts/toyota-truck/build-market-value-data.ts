// Reads the real collected/curated market-value CSVs and writes frozen JSON the frontend fetches
// at runtime, same pattern as build-public-data.ts for the failure-point data.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fromCsv } from "../surf-volume/lib/csv.ts";
import {
	combineSales,
	curatedSalesToRecords,
	hagertyPastSalesToRecords,
	medianByModelYear,
	salesByCalendarYear,
	toClassicComYearSummaries,
	toValueByYearPoints,
	type ClassicComYearRow,
	type CuratedSaleRow,
	type HagertyPastSaleRow,
	type HagertyValueRow,
} from "../../src/lib/toyota-truck/market-value.ts";

const RAW_DIR = path.resolve(import.meta.dirname, "../../data/toyota-truck/raw/market-value");
const OUT_DIR = path.resolve(import.meta.dirname, "../../public/data/toyota-truck");

async function readCsv<T>(filename: string): Promise<T[]> {
	const text = await readFile(path.join(RAW_DIR, filename), "utf-8");
	return fromCsv(text) as T[];
}

async function main() {
	const [hagertyValues, hagertyPastSales, curatedSales, classicComYears] = await Promise.all([
		readCsv<HagertyValueRow>("hagerty_values_raw.csv"),
		readCsv<HagertyPastSaleRow>("hagerty_past_sales_raw.csv"),
		readCsv<CuratedSaleRow>("curated_sales_raw.csv"),
		readCsv<ClassicComYearRow>("classiccom_years_raw.csv"),
	]);

	const valueByYear = toValueByYearPoints(hagertyValues);
	const sales = combineSales(hagertyPastSalesToRecords(hagertyPastSales), curatedSalesToRecords(curatedSales));
	const modelYearSummary = medianByModelYear(sales);
	const calendarYearSales = salesByCalendarYear(sales);
	const classicComSummary = toClassicComYearSummaries(classicComYears);

	await mkdir(OUT_DIR, { recursive: true });
	await Promise.all([
		writeFile(path.join(OUT_DIR, "market_value_by_year.json"), JSON.stringify(valueByYear, null, 2)),
		writeFile(path.join(OUT_DIR, "market_sales.json"), JSON.stringify(sales, null, 2)),
		writeFile(path.join(OUT_DIR, "market_model_year_summary.json"), JSON.stringify(modelYearSummary, null, 2)),
		writeFile(path.join(OUT_DIR, "market_calendar_year_sales.json"), JSON.stringify(calendarYearSales, null, 2)),
		writeFile(path.join(OUT_DIR, "market_classiccom_years.json"), JSON.stringify(classicComSummary, null, 2)),
	]);

	const years = sales.map((s) => s.year);
	console.log(`Market value: ${valueByYear.length} Hagerty condition-price points, ${sales.length} distinct individually-traceable sales (years ${Math.min(...years)}-${Math.max(...years)})`);
	console.log(`Model-year summary: ${modelYearSummary.length} years, sample sizes: ${modelYearSummary.map((s) => `${s.year} (n=${s.count})`).join(", ")}`);
	console.log(`Calendar-year sales: ${calendarYearSales.length} of ${sales.length} sales have a parseable sale date (${sales.length - calendarYearSales.length} undated, dropped)`);
	console.log(`classic.com years: ${classicComSummary.length} model years, ${classicComSummary[0]?.year}-${classicComSummary.at(-1)?.year}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
