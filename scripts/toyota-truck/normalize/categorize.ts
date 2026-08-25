// Transparent, rule-based categorization: a thread is assigned to the FIRST category whose
// keyword pattern matches its title + first-post text, checked in the fixed order below, not a
// hidden ML classifier, matching this project's "documented derivation, auditable by reading the
// code" ethos elsewhere in this repo (e.g. every surf-volume source's methodology comment).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fromCsv } from "../../surf-volume/lib/csv.ts";
import type { FailurePoint } from "../../../src/lib/toyota-truck/aggregate.ts";

const RAW_DIR = path.resolve(import.meta.dirname, "../../../data/toyota-truck/raw");
const PROCESSED_DIR = path.resolve(import.meta.dirname, "../../../data/toyota-truck/processed");

const SOURCE_NAMES: Record<string, string> = {
	yotatech: "YotaTech",
	ih8mud: "IH8MUD",
	tacomaworld: "TacomaWorld",
};

export const CATEGORY_RULES: { category: string; pattern: RegExp }[] = [
	{ category: "Timing chain", pattern: /timing chain|timing belt|chain tensioner|chain guide/i },
	{ category: "Head gasket", pattern: /head gasket|blown head|warp(ed|ing)? head/i },
	{ category: "Cooling / overheating", pattern: /overheat|radiator|water pump|thermostat|coolant|clutch fan/i },
	{
		category: "Fuel / carburetor / EFI",
		pattern:
			/carburetor|\bcarb\b|fuel pump|fuel injector|fuel line|fuel tank|\befi\b|throttle position|mass airflow|\bmaf\b|running rich|running lean|rough idle|high idle|charcoal canister|fuel vapor|vapor canister|\bevap\b/i,
	},
	{
		category: "Electrical",
		pattern: /wiring|wire harness|\becu\b|alternator|\bbattery\b|\bfuse\b|\brelay\b|speedometer|gauge cluster|distributor cap|ignition/i,
	},
	{ category: "AC / climate control", pattern: /\bac\b|air condition|idle up diaphragm|a\/c compressor|a\/c system/i },
	{ category: "Oil leaks", pattern: /oil leak|valve cover gasket|oil pan gasket|rear main seal|front main seal/i },
	{
		category: "Transmission / drivetrain",
		pattern: /transmission|\bclutch\b|differential|driveshaft|\b4wd\b|transfer case|\baxle|shifter|won'?t go into gear|sloppy shift/i,
	},
	{
		category: "Steering / brakes / suspension",
		pattern: /\bbrake|caliper|rotor|suspension|\bshock\b|\bstrut\b|leaf spring|\bsteering\b|knuckle|birfield|\bifs\b|king ?pin/i,
	},
	{ category: "Rust / body", pattern: /\brust(ed|ing|y)?\b|body panel|frame rot|rotted/i },
];

export function categorize(text: string): string {
	for (const rule of CATEGORY_RULES) {
		if (rule.pattern.test(text)) return rule.category;
	}
	return "Other / uncategorized";
}

// Applied only to threads that didn't match any CATEGORY_RULES pattern above, never to threads
// that already matched a real category, so a build thread that happens to mention "2016" in
// passing can't get silently dropped from a category it legitimately earned. Two honest, separate
// reasons a thread gets excluded from "Other / uncategorized" and moved to "Excluded / off-topic":
// forum furniture that was never going to describe a mechanical issue (sign-ups, rules, FAQ/manual
// links, roll calls, marketplace posts), and threads that are demonstrably about a different
// engine/platform/generation than the 20R/22R/22R-E trucks this page covers.
const FORUM_META_PATTERN =
	/sign-?up|roll call|\bfaq\b|frequently asked questions|factory service manual|\bfsm\b|\bstolen\b|for sale|\bwtb\b|\bwts\b|readers? rides?|post your pics|part number request|buy \/ sell \/ trade rules|toyota stalking|spotting with charlie|what did you do (with|to) your|live thread|thanks for letting me join/i;

const OFF_TOPIC_PLATFORM_PATTERN =
	/\bland cruiser\b|lexus gx|lexus lx|\brav ?4\b|\bhighlander\b|\bsequoia\b|fj cruiser|\bfj40\b|\bfj60\b|\bfj80\b|\b3vze\b|\bkzn\d+/i;

/** A title mentioning a model year of 1998 or later is almost certainly about a later generation
 * than the 20R/22R/22R-E, which was phased out of Toyota pickups and 4Runners by the mid-to-late
 * 1990s. An imperfect heuristic (a truck could be discussed using a later calendar year in
 * passing), disclosed as such rather than treated as exact. */
function mentionsLaterModelYear(text: string): boolean {
	const years = text.match(/\b(19|20)\d{2}\b/g) ?? [];
	return years.some((year) => Number(year) >= 1998);
}

// Forum-meta signals (sign-ups, "for sale", "stolen") are only checked against the title, not the
// full first-post body: a real ownership story can mention "for sale" in passing (how the truck
// was acquired) without being a marketplace listing itself. Off-topic platform/year signals are
// checked against the full text, since those are reliable wherever they appear.
export function isOffTopic(title: string, combinedText: string): boolean {
	return FORUM_META_PATTERN.test(title) || OFF_TOPIC_PLATFORM_PATTERN.test(combinedText) || mentionsLaterModelYear(combinedText);
}

async function main() {
	const files = (await readdir(RAW_DIR)).filter((f) => f.endsWith("_raw.csv"));
	if (files.length === 0) throw new Error(`No *_raw.csv files found in ${RAW_DIR}, run the collectors first.`);

	const points: FailurePoint[] = [];
	const excludedTitles: string[] = [];
	for (const file of files) {
		const csv = await readFile(path.join(RAW_DIR, file), "utf-8");
		const rows = fromCsv(csv);
		for (const row of rows) {
			const combinedText = `${row.thread_title} ${row.first_post_excerpt}`;
			let category = categorize(combinedText);
			if (category === "Other / uncategorized" && isOffTopic(row.thread_title, combinedText)) {
				category = "Excluded / off-topic";
				excludedTitles.push(`[${row.source_id}] ${row.thread_title}`);
			}
			points.push({
				thread_id: row.thread_id,
				thread_title: row.thread_title,
				thread_url: row.thread_url,
				source_id: row.source_id,
				source_name: SOURCE_NAMES[row.source_id] ?? row.source_id,
				category,
			});
		}
	}

	await mkdir(PROCESSED_DIR, { recursive: true });
	await writeFile(path.join(PROCESSED_DIR, "failure_points.json"), JSON.stringify(points, null, 2));
	console.log(`Excluded ${excludedTitles.length} off-topic/forum-meta threads before categorization:`);
	excludedTitles.forEach((t) => console.log(`  ${t}`));
	const bySource = new Map<string, number>();
	for (const p of points) bySource.set(p.source_name, (bySource.get(p.source_name) ?? 0) + 1);
	console.log(`Categorized ${points.length} threads (${[...bySource.entries()].map(([n, c]) => `${n}: ${c}`).join(", ")}) into ${new Set(points.map((p) => p.category)).size} categories`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
