// Method B (browser_automation): Rusty's calculator is a genuine multi-input form (weight,
// height, age, fitness, frequency, skill) backed by a live AJAX service at
// cavewire.com/calculatevolume — not a static formula we can extract, unlike Firewire/
// Pyzel/Roberts/Lost. This is the only source in this project that needs a real browser
// driving the real page for every profile, including the Dataset B sensitivity variants.
//
// Rusty's form has no wave/wetsuit inputs, so only the "age", "fitness", and "frequency"
// one-factor-at-a-time variants apply here — "conditions" and "wetsuit" variants are skipped
// entirely rather than submitted as a no-op duplicate of the archetype's own request.
//
// Skill: Rusty has 6 levels; we use Beginner(1)->beginner, Experienced(3)->intermediate,
// Advanced(4)->advanced (see normalization_rules.md — Competent(2) also plausibly maps to
// intermediate, medium confidence).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { toCsv } from "../lib/csv.ts";
import { generateDatasetA, generateDatasetBArchetypes, generateDatasetBSensitivityVariants } from "../../../src/lib/surf-volume/profiles.ts";
import type { SampleProfile } from "../../../src/lib/surf-volume/types.ts";

const SOURCE_ID = "rusty";
const SOURCE_URL = "https://rustysurfboards.com/pages/volume-calculator";

const SKILL_MAP: Record<string, { levelValue: string; levelLabel: string; confidence: string }> = {
	beginner: { levelValue: "1", levelLabel: "Beginner", confidence: "high" },
	intermediate: { levelValue: "3", levelLabel: "Experienced", confidence: "medium" },
	advanced: { levelValue: "4", levelLabel: "Advanced", confidence: "high" },
};
// Fitness: "Could be fitter"(1) / "Reasonably"(2) / "Very fit"(3).
const FITNESS_MAP: Record<string, string> = { low: "1", average: "2", high: "3" };
// Frequency: "Never"(1) / "Monthly"(2) / "Weekly"(3) / "Daily"(4).
const FREQUENCY_MAP: Record<string, string> = { occasional: "2", weekly: "3", frequent: "4" };

const CACHE_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/cache", SOURCE_ID);
const RAW_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/raw");

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	profile_id: string;
	weight_lb: number;
	weight_kg_input: number;
	height_cm_input: number;
	age: number;
	skill_source_label: string;
	skill_normalized: string;
	recommended_volume_min_l: number | "";
	recommended_volume_max_l: number | "";
	recommended_volume_point_l: number | "";
	collection_status: string;
	notes: string;
}

function lbToNearestKg(lb: number): number {
	return Math.round(lb * 0.45359237);
}

/** Dataset A + Dataset B archetypes + only the B variants Rusty's form can actually express. */
function buildProfileList(): SampleProfile[] {
	const variants = generateDatasetBSensitivityVariants().filter(
		(v) => v.variant_factor === "age" || v.variant_factor === "fitness" || v.variant_factor === "frequency",
	);
	return [...generateDatasetA(), ...generateDatasetBArchetypes(), ...variants];
}

export async function collectRusty(): Promise<RawRow[]> {
	await mkdir(CACHE_DIR, { recursive: true });
	const browser = await chromium.launch();
	const page = await browser.newPage({ userAgent: "Mozilla/5.0 (research; personal portfolio project)" });
	const rows: RawRow[] = [];
	const profiles = buildProfileList();

	function emptyRow(profile: SampleProfile, weightKg: number, heightCm: number, skill: { levelLabel: string }, reason: string): RawRow {
		return {
			source_id: SOURCE_ID,
			source_name: "Rusty Surfboards",
			source_url: SOURCE_URL,
			collected_at: new Date().toISOString().slice(0, 10),
			collection_method: "browser_automation",
			profile_id: profile.profile_id,
			weight_lb: profile.weight_lb,
			weight_kg_input: weightKg,
			height_cm_input: heightCm,
			age: profile.age ?? 35,
			skill_source_label: skill.levelLabel,
			skill_normalized: profile.skill,
			recommended_volume_min_l: "",
			recommended_volume_max_l: "",
			recommended_volume_point_l: "",
			collection_status: "failed",
			notes: reason,
		};
	}

	try {
		await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

		// Cookie/consent banners vary by region; dismiss if present, but don't fail if absent.
		const consentButton = page.locator("button:has-text('Accept')").first();
		if (await consentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
			await consentButton.click().catch(() => {});
		}

		await page.waitForSelector("#options\\[weight\\]", { state: "attached", timeout: 15000 });
		// The visible controls are jQuery UI sliders layered on top of the real <select>
		// elements, which are CSS-hidden — Playwright's selectOption requires visibility, so we
		// set the underlying <select> value directly and dispatch 'change', exactly what the
		// slider's own `slide` callback does (select[0].selectedIndex=...; select.change()).
		for (const profile of profiles) {
			const weightKg = lbToNearestKg(profile.weight_lb);
			const heightCm = Math.round(profile.height_in * 2.54);
			const age = profile.age ?? 35;
			const skill = SKILL_MAP[profile.skill];
			const fitnessValue = FITNESS_MAP[profile.fitness ?? "average"];
			const frequencyValue = FREQUENCY_MAP[profile.frequency ?? "weekly"];

			async function submitOnce(): Promise<{ ok: true; json: { volume: unknown; rangeMin: unknown; rangeMax: unknown } } | { ok: false; reason: string } | { ok: false; whitelisted: false }> {
				await page.evaluate(
					({ weightKg, heightCm, age, fitness, frequency, level }) => {
						const fields: [string, string][] = [
							["options[weight]", String(weightKg)],
							["options[height]", String(heightCm)],
							["options[age]", String(age)],
							["options[fitness]", fitness],
							["options[frequency]", frequency],
							["options[level]", level],
						];
						for (const [id, value] of fields) {
							const el = document.querySelector<HTMLSelectElement>(`#${CSS.escape(id)}`);
							if (!el) throw new Error(`select #${id} not found`);
							el.value = value;
							el.dispatchEvent(new Event("change", { bubbles: true }));
						}
					},
					{ weightKg, heightCm, age, fitness: fitnessValue, frequency: frequencyValue, level: skill.levelValue },
				);

				const responsePromise = page.waitForResponse((r) => r.url().includes("cavewire.com/calculatevolume") && r.request().method() === "POST", { timeout: 15000 });
				await page.click(".board-engine__button");
				const response = await responsePromise;
				const json = await response.json().catch(() => null);
				await writeFile(path.join(CACHE_DIR, `${profile.profile_id}.json`), JSON.stringify(json, null, 2));

				if (json?.error === "NOW") return { ok: false, whitelisted: false };
				if (json && json.error !== "NOW" && typeof json.volume !== "undefined") return { ok: true, json };
				return { ok: false, reason: "Unexpected response shape" };
			}

			try {
				// The very first submission on a freshly loaded page consistently returns an
				// unexpected shape (observed across multiple runs) — a real cold-start quirk in
				// the site's own validation, not our bug. One immediate retry self-heals it
				// rather than requiring a full script re-run.
				let result = await submitOnce();
				if (!result.ok && "reason" in result) {
					await page.waitForTimeout(800);
					result = await submitOnce();
				}

				if (result.ok) {
					rows.push({
						source_id: SOURCE_ID,
						source_name: "Rusty Surfboards",
						source_url: SOURCE_URL,
						collected_at: new Date().toISOString().slice(0, 10),
						collection_method: "browser_automation",
						profile_id: profile.profile_id,
						weight_lb: profile.weight_lb,
						weight_kg_input: weightKg,
						height_cm_input: heightCm,
						age,
						skill_source_label: skill.levelLabel,
						skill_normalized: profile.skill,
						recommended_volume_min_l: Number(result.json.rangeMin),
						recommended_volume_max_l: Number(result.json.rangeMax),
						recommended_volume_point_l: Number(result.json.volume),
						collection_status: "ok",
						notes: `skill-label confidence: ${skill.confidence}`,
					});
				} else if ("whitelisted" in result) {
					console.error(`Rusty ${profile.profile_id}: request not on Cavewire's domain whitelist — stopping (brief §7: stop on access-control restriction).`);
					rows.push(emptyRow(profile, weightKg, heightCm, skill, "Blocked: not on Cavewire whitelist"));
					return rows; // hard stop per brief §7/§24 — do not attempt to circumvent access control
				} else {
					rows.push(emptyRow(profile, weightKg, heightCm, skill, result.reason));
				}
			} catch (err) {
				console.error(`Rusty ${profile.profile_id} failed:`, err instanceof Error ? err.message : err);
				rows.push(emptyRow(profile, weightKg, heightCm, skill, String(err)));
			}
			await page.waitForTimeout(500); // polite delay between submissions
		}
	} finally {
		await browser.close();
	}

	await mkdir(RAW_DIR, { recursive: true });
	const csv = toCsv(rows, [
		"source_id",
		"source_name",
		"source_url",
		"collected_at",
		"collection_method",
		"profile_id",
		"weight_lb",
		"weight_kg_input",
		"height_cm_input",
		"age",
		"skill_source_label",
		"skill_normalized",
		"recommended_volume_min_l",
		"recommended_volume_max_l",
		"recommended_volume_point_l",
		"collection_status",
		"notes",
	]);
	await writeFile(path.join(RAW_DIR, "rusty_raw.csv"), csv);
	console.log(`Rusty: wrote ${rows.length} rows to rusty_raw.csv (${rows.filter((r) => r.collection_status === "ok").length} succeeded, ${profiles.length} attempted)`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectRusty().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
