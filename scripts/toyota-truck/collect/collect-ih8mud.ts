// Collects real thread data from IH8MUD's "95-older Minitruck / 4Runner" subforum, verified by
// hand before writing this: IH8MUD's top-level forum listing is almost entirely regional Land
// Cruiser club subforums, the genuinely relevant 22R/22RE-era content lives one level deeper, in
// this specific technical subforum (confirmed real, active, on-topic threads like "Rear tray for
// my rusty '86 pickup" and "86 Xtra Cab Build"). XenForo platform, thread URLs look like
// /threads/some-slug.830141/, cleaner than YotaTech's vBulletin pattern, no query-string pitfall.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { toCsv } from "../../surf-volume/lib/csv.ts";

const SOURCE_ID = "ih8mud";
const FORUM_SLUG = "95-older-minitruck-4runner.22";
const FORUM_NAME = "95-older Minitruck / 4Runner";
const BASE_URL = "https://forum.ih8mud.com";
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

// Matches /threads/some-real-slug.830141/ (with or without a trailing page/#post fragment) and
// captures the numeric ID. Rejects anything without a real slug segment before the ID.
function extractThreadId(href: string): string | null {
	const match = href.match(/\/threads\/[a-z0-9-]*[a-z]\.(\d+)\/?/i);
	return match ? match[1] : null;
}

export async function collectIh8mud(): Promise<RawRow[]> {
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
		$(`a[href*="/threads/"]`).each((_, el) => {
			const href = $(el).attr("href") ?? "";
			const threadId = extractThreadId(href);
			const title = $(el).text().trim();
			if (!threadId || !title || threadLinks.has(threadId)) return;
			const url = `${BASE_URL}/threads/${href.split("/threads/")[1].split("/")[0]}/`;
			threadLinks.set(threadId, { url, title });
		});
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(`IH8MUD: found ${threadLinks.size} distinct threads across ${LISTING_PAGES} listing pages`);

	const rows: RawRow[] = [];
	const entries = [...threadLinks.entries()].slice(0, MAX_THREADS);
	for (const [threadId, { url, title }] of entries) {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
		await page.waitForTimeout(1200);
		const html = await page.content();
		await writeFile(path.join(CACHE_DIR, `thread_${threadId}.html`), html);

		const $ = cheerio.load(html);
		const firstPostEl = $(".message-body .bbWrapper").first();
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
	await writeFile(path.join(RAW_DIR, "ih8mud_raw.csv"), csv);
	console.log(`IH8MUD: wrote ${rows.length} threads to ih8mud_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectIh8mud().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
