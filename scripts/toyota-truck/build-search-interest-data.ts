// Reads the hand-captured search-interest CSV (a one-time pull, not an automated scrape, see
// src/lib/toyota-truck/search-interest.ts for why) and writes the frozen JSON the frontend fetches
// at runtime, same pattern as every other build-*.ts script in this project.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fromCsv } from "../surf-volume/lib/csv.ts";
import { toSearchInterestPoints, yearlyAverage, type SearchInterestRow } from "../../src/lib/toyota-truck/search-interest.ts";

const RAW_DIR = path.resolve(import.meta.dirname, "../../data/toyota-truck/raw/market-value");
const OUT_DIR = path.resolve(import.meta.dirname, "../../public/data/toyota-truck");

async function main() {
	const text = await readFile(path.join(RAW_DIR, "search_interest_raw.csv"), "utf-8");
	const rows = fromCsv(text) as unknown as SearchInterestRow[];
	const points = toSearchInterestPoints(rows);
	const yearly = yearlyAverage(points);

	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(path.join(OUT_DIR, "search_interest_yearly.json"), JSON.stringify(yearly, null, 2));

	const peak22re = yearly.reduce((max, y) => (y.avg_22re > max.avg_22re ? y : max));
	const latestFull = yearly.filter((y) => !y.partial_year).at(-1);
	console.log(`Search interest: ${yearly.length} years, "22re" peaked in ${peak22re.year} (avg ${peak22re.avg_22re.toFixed(1)})`);
	if (latestFull) console.log(`Most recent complete year (${latestFull.year}): 22re avg ${latestFull.avg_22re.toFixed(1)}, vintage-framing avg ${latestFull.avg_vintage_toyota_pickup.toFixed(2)}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
