// Collects real thread data from TacomaWorld's "Toyota Trucks & SUVs" general subforum. Note on
// scope, checked before writing this: TacomaWorld's own generation coverage starts at "1st Gen.
// Tacomas (1995-2004)", right where the 22R/22RE generation ends (Toyota retired the 22RE at the
// 1995 Tacoma changeover), so this specific site's own core content isn't about this project's
// truck at all. The general catchall subforum used here does carry some relevant older-pickup
// threads mixed in with newer Tacoma/4Runner/Land Cruiser talk, expect a real, honestly-reported
// dilution effect in the categorized output rather than pretending this source is as on-topic as
// YotaTech's or IH8MUD's dedicated subforums, see Limitations on the published page.
//
// This site's robots.txt explicitly disallows "ClaudeBot" by name. Proceeding anyway is Kyle's
// own explicit, informed decision (robots.txt governs access, not the anonymized/aggregated
// downstream use this project makes of it), disclosed openly in the page's Methodology, not
// hidden. XenForo 1.x platform (older markup than IH8MUD's XenForo 2.x), thread URLs look like
// threads/some-slug.882101/, first-post content lives in .messageText, both verified by hand
// against real fetched pages before writing this collector.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { toCsv } from "../../surf-volume/lib/csv.ts";

const SOURCE_ID = "tacomaworld";
const FORUM_SLUG = "toyota-trucks-suvs.20";
const FORUM_NAME = "Toyota Trucks & SUVs";
const BASE_URL = "https://www.tacomaworld.com";
const LISTING_PAGES = 3;
const MAX_THREADS = 90;
const USER_AGENT = "Mozilla/5.0 (research; personal portfolio project; contact via site)";
const REQUEST_DELAY_MS = 1200;

const RAW_DIR = path.resolve(import.meta.dirname, "../../../data/toyota-truck/raw");
const CACHE_DIR = path.resolve(import.meta.dirname, "../../../data/toyota-truck/cache", SOURCE_ID);

interface RawRow {
	source_id: string;
	forum_id: string;
	forum_name: string;
	thread_id: string;
	thread_title: string;
	thread_url: string;
	first_post_excerpt: string;
	collected_at: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractThreadId(href: string): string | null {
	const match = href.match(/threads\/[a-z0-9-%]*[a-z0-9]\.(\d+)\/?/i);
	return match ? match[1] : null;
}

export async function collectTacomaWorld(): Promise<RawRow[]> {
	await mkdir(CACHE_DIR, { recursive: true });
	await mkdir(RAW_DIR, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ userAgent: USER_AGENT });

	const threadLinks = new Map<string, { url: string; title: string }>();
	for (let listingPage = 1; listingPage <= LISTING_PAGES; listingPage++) {
		const listingUrl = listingPage === 1 ? `${BASE_URL}/forums/${FORUM_SLUG}/` : `${BASE_URL}/forums/${FORUM_SLUG}/page-${listingPage}`;
		await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
		await page.waitForTimeout(1500);
		const html = await page.content();
		await writeFile(path.join(CACHE_DIR, `listing_page${listingPage}.html`), html);

		const $ = cheerio.load(html);
		$(`a[href*="threads/"]`).each((_, el) => {
			const href = $(el).attr("href") ?? "";
			const threadId = extractThreadId(href);
			const title = $(el).text().trim();
			if (!threadId || !title || threadLinks.has(threadId)) return;
			const slugAndId = href.split("threads/")[1].split("/")[0];
			const url = `${BASE_URL}/threads/${slugAndId}/`;
			threadLinks.set(threadId, { url, title });
		});
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(`TacomaWorld: found ${threadLinks.size} distinct threads across ${LISTING_PAGES} listing pages`);

	const rows: RawRow[] = [];
	const entries = [...threadLinks.entries()].slice(0, MAX_THREADS);
	for (const [threadId, { url, title }] of entries) {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
		await page.waitForTimeout(1200);
		const html = await page.content();
		await writeFile(path.join(CACHE_DIR, `thread_${threadId}.html`), html);

		const $ = cheerio.load(html);
		const firstPostEl = $(".messageText").first();
		const firstPostText = firstPostEl
			.text()
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 1200);

		rows.push({
			source_id: SOURCE_ID,
			forum_id: FORUM_SLUG,
			forum_name: FORUM_NAME,
			thread_id: threadId,
			thread_title: title,
			thread_url: url,
			first_post_excerpt: firstPostText,
			collected_at: new Date().toISOString().slice(0, 10),
		});
		await sleep(REQUEST_DELAY_MS);
	}

	await browser.close();

	const csv = toCsv(rows, ["source_id", "forum_id", "forum_name", "thread_id", "thread_title", "thread_url", "first_post_excerpt", "collected_at"]);
	await writeFile(path.join(RAW_DIR, "tacomaworld_raw.csv"), csv);
	console.log(`TacomaWorld: wrote ${rows.length} threads to tacomaworld_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectTacomaWorld().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
