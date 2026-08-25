// Final pipeline step: reads the categorized dataset and writes the frozen JSON the frontend
// actually consumes at public/data/toyota-truck/*.json. No live network calls happen at request
// time, mirroring scripts/surf-volume/build-public-data.ts exactly.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	countByCategory,
	countByCategoryAndSource,
	countBySource,
	type FailurePoint,
} from "../../src/lib/toyota-truck/aggregate.ts";

const PROCESSED_DIR = path.resolve(import.meta.dirname, "../../data/toyota-truck/processed");
const OUT_DIR = path.resolve(import.meta.dirname, "../../public/data/toyota-truck");

async function main() {
	const allPoints: FailurePoint[] = JSON.parse(await readFile(path.join(PROCESSED_DIR, "failure_points.json"), "utf-8"));
	const excludedCount = allPoints.filter((p) => p.category === "Excluded / off-topic").length;
	const points = allPoints.filter((p) => p.category !== "Excluded / off-topic");

	const categoryCounts = countByCategory(points);
	const sourceCounts = countBySource(points);
	const categoryBySourceCounts = countByCategoryAndSource(points);

	await mkdir(OUT_DIR, { recursive: true });
	await Promise.all([
		writeFile(path.join(OUT_DIR, "failure_categories.json"), JSON.stringify(categoryCounts, null, 2)),
		writeFile(path.join(OUT_DIR, "failure_sources.json"), JSON.stringify(sourceCounts, null, 2)),
		writeFile(path.join(OUT_DIR, "failure_category_by_source.json"), JSON.stringify(categoryBySourceCounts, null, 2)),
		writeFile(path.join(OUT_DIR, "failure_points.json"), JSON.stringify(points, null, 2)),
	]);

	console.log(`Built public data: ${points.length} threads across ${categoryCounts.length} categories -> ${OUT_DIR}`);
	console.log(`Excluded as off-topic/forum-meta before this count: ${excludedCount} threads (of ${allPoints.length} total scraped)`);
	console.log(`By source: ${sourceCounts.map((s) => `${s.source_name}: ${s.count}`).join(", ")}`);
	console.log(`Top category: ${categoryCounts[0]?.category} (${categoryCounts[0]?.count}, ${categoryCounts[0]?.percentage.toFixed(1)}%)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
