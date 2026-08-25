// Collects real per-year condition-price data and real individual past sales (which Hagerty
// itself pulls from Bring a Trailer and Cars & Bids) from Hagerty's Valuation Tools, for the
// "Toyota Pickup" and "Toyota 4Runner" model pages. Verified by hand before writing this: a real
// headless-browser look at the rendered page found the #1/#2/#4 condition tiers are gated behind
// a free account ("Join for free to view"), only #3 Good is publicly visible, so that's the only
// condition price this collector pulls, honestly labeled. Hagerty's own coverage for this truck
// genuinely stops around 1988-1989, later years aren't in their price guide at all, a real gap,
// not a scraping failure, reflected here rather than papered over.
//
// robots.txt: no "ClaudeBot" entry at all, and the default (unnamed-bot) section doesn't block
// ordinary content pages, but it does carry a real Disallow: /api/ for every AI-crawler-category
// bot it does name (Claude-User, Claude-SearchBot, CCBot, PerplexityBot, etc). This collector
// respects the spirit of that even though its own identity isn't literally listed: it scrapes the
// rendered HTML content pages a real visitor sees, never the internal
// /valuation-tools/api/vehicle-dashboard/... JSON endpoint the page's own chart calls internally.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { chromium, type Page } from "playwright";
import { toCsv } from "../../surf-volume/lib/csv.ts";

const SOURCE_ID = "hagerty";
const BASE_URL = "https://www.hagerty.com";
const MODELS = ["pickup", "4runner"] as const;
const MAX_CONFIGS_PER_YEAR = 3; // a real, bounded, polite sample per year, not exhaustive
const USER_AGENT = "Mozilla/5.0 (research; personal portfolio project; contact via site)";
const REQUEST_DELAY_MS = 1500;

const RAW_DIR = path.resolve(import.meta.dirname, "../../../data/toyota-truck/raw/market-value");
const CACHE_DIR = path.resolve(import.meta.dirname, "../../../data/toyota-truck/cache", SOURCE_ID);

interface ValueRow {
	source_id: string;
	model: string;
	year: string;
	config_label: string;
	condition_tier: string;
	price_usd: string;
	config_url: string;
	collected_at: string;
}

interface PastSaleRow {
	source_id: string;
	sale_year_model_trim: string;
	price_usd: string;
	mileage: string;
	sale_date: string;
	auction_platform: string;
	detail_url: string;
	found_via_config_url: string;
	collected_at: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverYears(page: Page, model: string): Promise<string[]> {
	await page.goto(`${BASE_URL}/valuation-tools/toyota/${model}`, { waitUntil: "domcontentloaded", timeout: 20000 });
	await page.waitForTimeout(1200);
	const html = await page.content();
	const $ = cheerio.load(html);
	const years = new Set<string>();
	$("a").each((_, el) => {
		const text = $(el).text().trim();
		if (/^(19|20)\d{2}$/.test(text)) years.add(text);
	});
	return [...years].sort();
}

async function discoverConfigLinks(page: Page, model: string, year: string): Promise<string[]> {
	await page.goto(`${BASE_URL}/valuation-tools/toyota/${model}/${year}`, { waitUntil: "domcontentloaded", timeout: 20000 });
	await page.waitForTimeout(1200);
	const links: string[] = await page.evaluate(() => [...document.querySelectorAll(`a[href*="?id="]`)].map((a) => (a as HTMLAnchorElement).href));
	return [...new Set(links)].slice(0, MAX_CONFIGS_PER_YEAR);
}

function extractConditionPrice($: cheerio.CheerioAPI): { tier: string; price: string } | null {
	let result: { tier: string; price: string } | null = null;
	$('[class*="conditionChunkWrapper"]').each((_, el) => {
		const text = $(el).text();
		if (!/#3 Good/.test(text)) return;
		const priceMatch = text.match(/\$([\d,]+)/);
		if (priceMatch) result = { tier: "#3 Good", price: priceMatch[1] };
	});
	return result;
}

function extractPastSales($: cheerio.CheerioAPI, configUrl: string): PastSaleRow[] {
	const rows: PastSaleRow[] = [];
	$('a[class*="past-sales-card_cardContainer"]').each((_, el) => {
		const href = $(el).attr("href") ?? "";
		const text = $(el).text().replace(/\s+/g, " ").trim();
		// Price and year run together with no separator ("Sold$17,5881988 Toyota Pickup SR5"), a
		// greedy digit match on price swallows the year's leading digits. Non-greedy price capture,
		// requiring a real "<year> Toyota" to follow, fixes it (verified against real captured HTML
		// before trusting this, same discipline as every other collector on this project).
		const priceMatch = text.match(/^Sold\$([\d,]+?)(?=(?:19|20)\d{2} Toyota)/);
		const titleMatch = text.match(/((?:19|20)\d{2} Toyota [^$]+?)\$/);
		const mileageMatch = text.match(/([\d,]+)\s*M(?:Transmision|$)/);
		const dateMatch = text.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
		const platformMatch = text.match(/Dot Icon ([A-Za-z& ]+?)View details/);
		if (!priceMatch || !titleMatch) return;
		rows.push({
			source_id: SOURCE_ID,
			sale_year_model_trim: titleMatch[1].trim(),
			price_usd: priceMatch[1],
			mileage: mileageMatch ? mileageMatch[1] : "",
			sale_date: dateMatch ? dateMatch[1] : "",
			auction_platform: platformMatch ? platformMatch[1].trim() : "",
			detail_url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
			found_via_config_url: configUrl,
			collected_at: new Date().toISOString().slice(0, 10),
		});
	});
	return rows;
}

export async function collectHagerty(): Promise<{ values: ValueRow[]; pastSales: PastSaleRow[] }> {
	await mkdir(CACHE_DIR, { recursive: true });
	await mkdir(RAW_DIR, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ userAgent: USER_AGENT });

	const values: ValueRow[] = [];
	const pastSalesByUrl = new Map<string, PastSaleRow>();

	for (const model of MODELS) {
		const years = await discoverYears(page, model);
		console.log(`Hagerty ${model}: years covered = ${years.join(", ") || "(none found)"}`);
		await sleep(REQUEST_DELAY_MS);

		for (const year of years) {
			const configLinks = await discoverConfigLinks(page, model, year);
			await sleep(REQUEST_DELAY_MS);

			for (const configUrl of configLinks) {
				await page.goto(configUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
				await page.waitForTimeout(1200);
				const html = await page.content();
				const cacheName = configUrl.replace(/[^a-z0-9]/gi, "_").slice(-120);
				await writeFile(path.join(CACHE_DIR, `${cacheName}.html`), html);

				const $ = cheerio.load(html);
				const titleText = $("h1").first().text().trim() || $("title").text().trim();
				const conditionPrice = extractConditionPrice($);
				if (conditionPrice) {
					values.push({
						source_id: SOURCE_ID,
						model,
						year,
						config_label: titleText,
						condition_tier: conditionPrice.tier,
						price_usd: conditionPrice.price,
						config_url: configUrl,
						collected_at: new Date().toISOString().slice(0, 10),
					});
				}

				for (const sale of extractPastSales($, configUrl)) {
					pastSalesByUrl.set(sale.detail_url, sale); // de-dupe, neighboring pages often share sales
				}

				await sleep(REQUEST_DELAY_MS);
			}
		}
	}

	await browser.close();

	const pastSales = [...pastSalesByUrl.values()];
	const valuesCsv = toCsv(values, ["source_id", "model", "year", "config_label", "condition_tier", "price_usd", "config_url", "collected_at"]);
	const salesCsv = toCsv(pastSales, ["source_id", "sale_year_model_trim", "price_usd", "mileage", "sale_date", "auction_platform", "detail_url", "found_via_config_url", "collected_at"]);
	await writeFile(path.join(RAW_DIR, "hagerty_values_raw.csv"), valuesCsv);
	await writeFile(path.join(RAW_DIR, "hagerty_past_sales_raw.csv"), salesCsv);
	console.log(`Hagerty: wrote ${values.length} condition-price rows and ${pastSales.length} distinct past sales`);
	return { values, pastSales };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectHagerty().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
