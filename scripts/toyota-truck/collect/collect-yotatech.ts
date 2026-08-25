// Collects real thread data from YotaTech's "86-95 Trucks & 4Runners" subforum (f116), the exact
// generation that used the 22R/22RE engine. Verified by hand before writing this: a plain fetch()
// gets served a stripped page missing thread listings (YotaTech's response varies by User-Agent,
// see the response `vary: User-Agent` header), so this uses a real headless browser (Playwright,
// the same tool collect-rusty.ts already uses in this repo for a JS-dependent source), then parses
// the rendered HTML with cheerio for the actual extraction, matching every other collector's style.
//
// ToyotaNation is deliberately not scraped: its robots.txt redirects through Tollbit, an AI-bot
// licensing intermediary, signaling the publisher wants compensated bulk access, not a scrape
// around that mechanism even though an unlisted user-agent isn't technically disallowed.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { toCsv } from "../../surf-volume/lib/csv.ts";

const SOURCE_ID = "yotatech";
const FORUM_ID = "f116";
const FORUM_NAME = "86-95 Trucks & 4Runners";
const BASE_URL = "https://www.yotatech.com";
const LISTING_PAGES = 3; // ~40 threads/page, 3 pages is a real, bounded, polite sample
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

// Real thread URLs look like /forums/f116/some-slug-320771/ (a slug, a numeric ID, a trailing
// slash, no query string). Column-header/utility links like ".../f116/?daysprune=-1" (the "sort by
// last post" control) technically end in "-<digits>" too and were slipping through an earlier,
// looser version of this regex, that's how "Last Post" ended up looking like a thread title.
// Requiring a real slug before the ID and rejecting query strings rules those out.
function extractThreadId(href: string): string | null {
	if (href.includes("?")) return null;
	const match = href.match(/\/f\d+\/[a-z0-9-]*[a-z]-(\d+)\/$/i);
	return match ? match[1] : null;
}

export async function collectYotatech(): Promise<RawRow[]> {
	await mkdir(CACHE_DIR, { recursive: true });
	await mkdir(RAW_DIR, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ userAgent: USER_AGENT });

	const threadLinks = new Map<string, { url: string; title: string }>();
	for (let listingPage = 1; listingPage <= LISTING_PAGES; listingPage++) {
		const listingUrl = listingPage === 1 ? `${BASE_URL}/forums/${FORUM_ID}/` : `${BASE_URL}/forums/${FORUM_ID}/index${listingPage}.html`;
		await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
		await page.waitForTimeout(1500);
		const html = await page.content();
		await writeFile(path.join(CACHE_DIR, `listing_page${listingPage}.html`), html);

		const $ = cheerio.load(html);
		$(`a[href*="/forums/${FORUM_ID}/"]`).each((_, el) => {
			const href = $(el).attr("href") ?? "";
			const threadId = extractThreadId(href);
			const title = $(el).text().trim();
			if (!threadId || !title || threadLinks.has(threadId)) return;
			const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
			threadLinks.set(threadId, { url, title });
		});
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(`YotaTech: found ${threadLinks.size} distinct threads across ${LISTING_PAGES} listing pages`);

	const rows: RawRow[] = [];
	const entries = [...threadLinks.entries()].slice(0, MAX_THREADS);
	for (const [threadId, { url, title }] of entries) {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
		await page.waitForTimeout(1200);
		const html = await page.content();
		await writeFile(path.join(CACHE_DIR, `thread_${threadId}.html`), html);

		const $ = cheerio.load(html);
		const firstPostEl = $('[id^="post_message_"]').first();
		const firstPostText = firstPostEl
			.text()
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 1200);

		rows.push({
			source_id: SOURCE_ID,
			forum_id: FORUM_ID,
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
	await writeFile(path.join(RAW_DIR, "yotatech_raw.csv"), csv);
	console.log(`YotaTech: wrote ${rows.length} threads to yotatech_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectYotatech().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
