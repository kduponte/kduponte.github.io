// Drives the Linda Mar toy: fetch the live forecast, rate it, then draw the forecast it rated.
//
// The drawing is the point. An earlier version showed a verdict word next to a fixed decorative
// squiggle and discarded the numbers it had just fetched, which made it a mood board. Here every
// mark comes from the reading: crest spacing from the real deep-water wavelength, amplitude from
// wave height, surface texture from the wind, and the drift rate from the wave period itself.
//
// The only live third-party fetch on this site. Built to fail visibly rather than quietly: any
// timeout, non-200, offline browser, or null value for the current hour lands in the "unknown"
// state, which says so plainly instead of showing an invented verdict.
import { degreesToCompass } from "../../lib/surf-forecast/angles";
import { rateConditions, type ConditionsInput, type ConditionsRating } from "../../lib/surf-forecast/conditions";
import { LINDA_MAR, type SpotProfile } from "../../lib/surf-forecast/spots";
import {
	VERTICAL_EXAGGERATION,
	VIEW,
	WINDOW_M,
	bearingToPoint,
	swellFillPath,
	swellGeometry,
	swellPath,
	type SwellGeometry,
} from "../../lib/surf-forecast/swell-viz";

const FETCH_TIMEOUT_MS = 6000;
const CACHE_KEY_PREFIX = "linda-mar-conditions:";

const HEADLINES: Record<"junk" | "fun" | "firing", string> = {
	junk: "Not today.",
	fun: "Go. Right now.",
	firing: "It's on.",
};

const EYEBROWS: Record<"junk" | "fun" | "firing" | "unknown", string> = {
	junk: "Verdict: junk",
	fun: "Verdict: worth it",
	firing: "Verdict: firing",
	unknown: "No call",
};

/** Original one-liners, chosen by day of year so the joke is stable for a day rather than
 * re-rolling on every scroll. */
const JOKES: Record<"junk" | "fun" | "firing", string[]> = {
	junk: [
		"The ocean is closed. Try again tomorrow.",
		"Good day to finally deal with the wax buildup on that board.",
		"Somewhere out there a swell is forming. It is not here and it is not today.",
		"On the bright side, the parking is excellent.",
		"This is what a rest day looks like when the ocean picks it for you.",
	],
	fun: [
		"Stop reading this.",
		"The board is in the car. The car is right there.",
		"You have a meeting? The meeting has a phone. Take the phone to the beach.",
		"This is the part of the forecast nobody complains about.",
	],
	firing: [
		"Bring the bigger board.",
		"Check your leash. Actually check it, do not just look at it.",
		"This is a day you will describe to people who were not there.",
		"Respectfully: know your limit today.",
	],
};

function pickJoke(tier: "junk" | "fun" | "firing"): string {
	const pool = JOKES[tier];
	const start = new Date(new Date().getFullYear(), 0, 0);
	const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86_400_000);
	return pool[dayOfYear % pool.length];
}

// ---------------------------------------------------------------- data

function currentUtcHourIso(): string {
	const now = new Date();
	now.setUTCMinutes(0, 0, 0);
	return now.toISOString().slice(0, 13);
}

interface HourlyResponse {
	hourly?: Record<string, unknown>;
}

async function fetchJson(url: string, signal: AbortSignal): Promise<HourlyResponse | null> {
	try {
		const res = await fetch(url, { signal });
		if (!res.ok) return null;
		return (await res.json()) as HourlyResponse;
	} catch {
		return null;
	}
}

/** Finds the array index whose timestamp matches the current UTC hour. Never assumes index 0:
 * the API's window does not necessarily start at the current hour. */
function indexForCurrentHour(hourly: Record<string, unknown> | undefined): number {
	const times = hourly?.time;
	if (!Array.isArray(times)) return -1;
	const target = currentUtcHourIso();
	return times.findIndex((t) => typeof t === "string" && t.startsWith(target));
}

function valueAt(hourly: Record<string, unknown> | undefined, key: string, index: number): number | null {
	if (!hourly || index < 0) return null;
	const series = hourly[key];
	if (!Array.isArray(series)) return null;
	const v = series[index];
	return typeof v === "number" ? v : null;
}

async function loadConditions(): Promise<ConditionsInput> {
	const empty: ConditionsInput = {
		wave_height_m: null,
		wave_period_s: null,
		wave_direction_deg: null,
		wind_speed_ms: null,
		wind_direction_deg: null,
		valid_time_utc: `${currentUtcHourIso()}:00:00Z`,
	};

	if (typeof navigator !== "undefined" && navigator.onLine === false) return empty;

	const cacheKey = `${CACHE_KEY_PREFIX}${currentUtcHourIso()}`;
	try {
		const cached = sessionStorage.getItem(cacheKey);
		if (cached) return JSON.parse(cached) as ConditionsInput;
	} catch {
		/* sessionStorage can be unavailable in private modes; not worth failing over */
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	const common = `latitude=${LINDA_MAR.latitude}&longitude=${LINDA_MAR.longitude}&timezone=UTC&timeformat=iso8601&forecast_days=2`;
	const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${common}&hourly=wave_height,wave_period,wave_direction`;
	const windUrl = `https://api.open-meteo.com/v1/forecast?${common}&hourly=wind_speed_10m,wind_direction_10m`;

	const [marine, wind] = await Promise.all([fetchJson(marineUrl, controller.signal), fetchJson(windUrl, controller.signal)]);
	clearTimeout(timer);

	const marineIndex = indexForCurrentHour(marine?.hourly);
	const windIndex = indexForCurrentHour(wind?.hourly);

	const result: ConditionsInput = {
		wave_height_m: valueAt(marine?.hourly, "wave_height", marineIndex),
		wave_period_s: valueAt(marine?.hourly, "wave_period", marineIndex),
		wave_direction_deg: valueAt(marine?.hourly, "wave_direction", marineIndex),
		wind_speed_ms: valueAt(wind?.hourly, "wind_speed_10m", windIndex),
		wind_direction_deg: valueAt(wind?.hourly, "wind_direction_10m", windIndex),
		valid_time_utc: `${currentUtcHourIso()}:00:00Z`,
	};

	try {
		sessionStorage.setItem(cacheKey, JSON.stringify(result));
	} catch {
		/* non-fatal */
	}
	return result;
}

// ---------------------------------------------------------------- drawing

/**
 * Three layers of the same swell train, offset in phase to give the water some depth. All share
 * one drift duration because they are one swell: giving them different speeds would look livelier
 * and would be a lie about the period.
 */
const LAYERS = [
	{ yOffset: -11, ampScale: 0.45, phase: 0.43, opacity: 0.28, width: 1.5 },
	{ yOffset: -5, ampScale: 0.72, phase: 0.19, opacity: 0.5, width: 1.75 },
	{ yOffset: 0, ampScale: 1, phase: 0, opacity: 1, width: 2.25 },
];

/** Spray flecks off the crest tops, drawn only when the wind is offshore. Positioned at the crest
 * peaks, which sit a quarter wavelength along from the start of each cycle. */
function sprayMarks(geometry: SwellGeometry): string {
	if (!geometry.spray) return "";
	const spacing = geometry.crest_spacing_px;
	const crestTop = VIEW.waterline - geometry.amplitude_px * 1.18;
	const marks: string[] = [];
	const last = Math.ceil((VIEW.width + spacing * 2) / spacing);

	for (let k = -1; k <= last; k++) {
		const x = spacing * (0.25 + k);
		for (let i = 0; i < 3; i++) {
			const len = 9 + i * 5;
			const rise = 5 + i * 3.5;
			marks.push(
				`<path d="M ${x.toFixed(1)} ${(crestTop + i * 2).toFixed(1)} q ${(-len * 0.5).toFixed(1)} ${(-rise).toFixed(1)} ${(-len).toFixed(1)} ${(-rise * 0.7).toFixed(1)}" fill="none" stroke="var(--color-ink-soft)" stroke-width="1" stroke-linecap="round" opacity="${(0.45 - i * 0.12).toFixed(2)}" />`,
			);
		}
	}
	return marks.join("");
}

/** Distance scale bar. The horizontal axis is the one that is genuinely to scale, so it is the one
 * worth marking. */
function scaleBar(): string {
	const hundredM = (VIEW.width / WINDOW_M) * 100;
	const x = 14;
	const y = 18;
	return [
		`<g stroke="var(--color-ink-soft)" stroke-width="1" opacity="0.7">`,
		`<line x1="${x}" y1="${y}" x2="${(x + hundredM).toFixed(1)}" y2="${y}" />`,
		`<line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}" />`,
		`<line x1="${(x + hundredM).toFixed(1)}" y1="${y - 3}" x2="${(x + hundredM).toFixed(1)}" y2="${y + 3}" />`,
		`</g>`,
		`<text x="${x}" y="${y - 8}" font-size="9" fill="var(--color-ink-soft)" opacity="0.8" style="font-family:var(--font-mono,monospace)">100 m</text>`,
	].join("");
}

function buildDiagram(geometry: SwellGeometry): string {
	const spacing = geometry.crest_spacing_px;

	const layers = LAYERS.map((layer) => {
		const scaled: SwellGeometry = { ...geometry, amplitude_px: geometry.amplitude_px * layer.ampScale };
		const stroke = swellPath(scaled, { yOffset: layer.yOffset });
		const body =
			layer.ampScale === 1
				? `<path d="${swellFillPath(scaled, { yOffset: layer.yOffset })}" fill="url(#toy-water)" />`
				: "";
		return [
			`<g transform="translate(${(layer.phase * spacing).toFixed(1)} 0)">`,
			`<g class="toy-drift">`,
			body,
			`<path d="${stroke}" fill="none" stroke="var(--toy-accent)" stroke-width="${layer.width}" opacity="${layer.opacity}" stroke-linejoin="round" />`,
			layer.ampScale === 1 ? sprayMarks(geometry) : "",
			`</g></g>`,
		].join("");
	}).join("");

	return [
		`<svg viewBox="0 0 ${VIEW.width} ${VIEW.height}" role="img" aria-label="A cross-section of the forecast swell, drawn to scale horizontally." style="--drift-px:${spacing.toFixed(1)}px;--drift-duration:${geometry.drift_seconds.toFixed(1)}s">`,
		`<defs>`,
		`<linearGradient id="toy-water" x1="0" y1="0" x2="0" y2="1">`,
		`<stop offset="0%" stop-color="var(--toy-accent)" stop-opacity="0.35" />`,
		`<stop offset="100%" stop-color="var(--toy-accent)" stop-opacity="0.08" />`,
		`</linearGradient>`,
		`<clipPath id="toy-frame"><rect x="0" y="0" width="${VIEW.width}" height="${VIEW.height}" /></clipPath>`,
		`</defs>`,
		scaleBar(),
		`<g clip-path="url(#toy-frame)">${layers}</g>`,
		`</svg>`,
	].join("");
}

function arrow(bearingDeg: number, cx: number, cy: number, outer: number, inner: number, color: string, width: number): string {
	// Bearings are "from" directions, so the arrow starts out at the rim and points inward.
	const tail = bearingToPoint(bearingDeg, outer, cx, cy);
	const head = bearingToPoint(bearingDeg, inner, cx, cy);
	const back = bearingToPoint(bearingDeg, inner + 9, cx, cy);
	const left = bearingToPoint(bearingDeg + 90, 4.5, back.x, back.y);
	const right = bearingToPoint(bearingDeg - 90, 4.5, back.x, back.y);
	return [
		`<line x1="${tail.x.toFixed(1)}" y1="${tail.y.toFixed(1)}" x2="${back.x.toFixed(1)}" y2="${back.y.toFixed(1)}" stroke="${color}" stroke-width="${width}" />`,
		`<path d="M ${head.x.toFixed(1)} ${head.y.toFixed(1)} L ${left.x.toFixed(1)} ${left.y.toFixed(1)} L ${right.x.toFixed(1)} ${right.y.toFixed(1)} Z" fill="${color}" />`,
	].join("");
}

/**
 * Compass rose showing the two bearings against the beach's own orientation, so the offshore or
 * onshore call is visible rather than only asserted. The shaded wedge is the water: the half of
 * the compass the beach looks out at.
 */
function buildCompass(rating: ConditionsRating, profile: SpotProfile): string {
	const { wave_direction_deg: swellDir, wind_direction_deg: windDir } = rating.inputs;
	const cx = 75;
	const cy = 64;
	const r = 44;

	const wedgeStart = bearingToPoint(profile.beach_normal_deg - 90, r, cx, cy);
	const wedgeEnd = bearingToPoint(profile.beach_normal_deg + 90, r, cx, cy);

	const ticks = (["N", "E", "S", "W"] as const)
		.map((label, i) => {
			const p = bearingToPoint(i * 90, r + 9, cx, cy);
			return `<text x="${p.x.toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="middle" font-size="8" fill="var(--color-ink-soft)" opacity="0.75" style="font-family:var(--font-mono,monospace)">${label}</text>`;
		})
		.join("");

	const windColor =
		rating.wind_relation === "offshore"
			? "var(--color-accent-green)"
			: rating.wind_relation === "onshore"
				? "var(--color-accent-yellow)"
				: "var(--color-ink-soft)";

	return [
		`<svg viewBox="0 0 150 128" class="w-full max-w-[150px]" role="img" aria-label="Compass showing swell and wind bearings against the direction the beach faces.">`,
		`<path d="M ${cx} ${cy} L ${wedgeStart.x.toFixed(1)} ${wedgeStart.y.toFixed(1)} A ${r} ${r} 0 0 1 ${wedgeEnd.x.toFixed(1)} ${wedgeEnd.y.toFixed(1)} Z" fill="var(--color-accent-blue)" opacity="0.1" />`,
		`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--color-line)" stroke-width="1" />`,
		ticks,
		swellDir === null ? "" : arrow(swellDir, cx, cy, r, 13, "var(--color-ink)", 2),
		windDir === null ? "" : arrow(windDir, cx, cy, r - 13, 20, windColor, 1.5),
		`</svg>`,
		// The key lives in HTML rather than inside the SVG: text drawn in the SVG was cropped by
		// the viewBox and scaled with the drawing, and the two arrows had no key at all.
		`<div class="mt-2 space-y-1 font-mono text-[0.7rem] leading-snug text-ink-soft">`,
		swellDir === null ? "" : compassKey(`<span style="width:14px;height:2px;background:var(--color-ink)"></span>`, "Swell, pointing the way it travels"),
		windDir === null ? "" : compassKey(`<span style="width:14px;height:2px;background:${windColor}"></span>`, `Wind, ${rating.wind_relation}`),
		compassKey(`<span style="width:10px;height:10px;border-radius:50%;background:var(--color-accent-blue);opacity:0.18"></span>`, "Shaded half is open water"),
		`</div>`,
	].join("");
}

function compassKey(swatch: string, label: string): string {
	return `<p class="flex items-center gap-2"><span aria-hidden="true" class="inline-flex w-[14px] shrink-0 items-center justify-center">${swatch.replace("<span style=\"", "<span style=\"display:inline-block;")}</span>${label}</p>`;
}

function numberRow(label: string, value: string, sub: string): HTMLElement[] {
	const dt = document.createElement("dt");
	dt.className = "font-mono text-[0.7rem] uppercase tracking-wide text-ink-soft";
	dt.textContent = label;
	const dd = document.createElement("dd");
	dd.className = "mb-1 md:mb-0";
	const strong = document.createElement("span");
	strong.className = "font-display text-xl font-semibold";
	strong.textContent = value;
	const small = document.createElement("span");
	small.className = "ml-2 font-mono text-[0.7rem] text-ink-soft";
	small.textContent = sub;
	dd.append(strong, small);
	return [dt, dd];
}

function buildNumbers(rating: ConditionsRating, geometry: SwellGeometry | null): HTMLElement[] {
	const i = rating.inputs;
	const rows: HTMLElement[] = [];

	rows.push(
		...numberRow(
			"Height",
			rating.wave_height_ft === null ? "—" : `${rating.wave_height_ft.toFixed(1)} ft`,
			i.wave_height_m === null ? "" : `${i.wave_height_m.toFixed(2)} m`,
		),
	);
	rows.push(
		...numberRow(
			"Period",
			i.wave_period_s === null ? "—" : `${i.wave_period_s.toFixed(0)} s`,
			geometry === null ? "" : `crest every ${geometry.wavelength_m.toFixed(0)} m`,
		),
	);
	rows.push(
		...numberRow(
			"Swell",
			i.wave_direction_deg === null ? "—" : degreesToCompass(i.wave_direction_deg),
			i.wave_direction_deg === null ? "" : `${i.wave_direction_deg.toFixed(0)}°`,
		),
	);
	rows.push(
		...numberRow(
			"Wind",
			i.wind_speed_ms === null ? "—" : `${Math.round(i.wind_speed_ms * 1.94384)} kt`,
			i.wind_direction_deg === null ? "" : `${degreesToCompass(i.wind_direction_deg)}, ${rating.wind_relation}`,
		),
	);

	return rows;
}

function captionFor(geometry: SwellGeometry): string {
	const crests = geometry.crests_in_view;
	const density =
		crests >= 4
			? "packed together, which is what local windswell looks like"
			: crests <= 1.2
				? "barely one crest across the frame, which is what real groundswell looks like"
				: "spaced like mid-period swell";
	return `One frame spans ${WINDOW_M} m of open water, with a crest every ${geometry.wavelength_m.toFixed(0)} m: ${density}. Crests advance one wavelength every ${geometry.drift_seconds.toFixed(0)} s, the actual wave period. Horizontal distance is to scale; height is exaggerated about ${VERTICAL_EXAGGERATION.toFixed(1)} times, as in any wave diagram.`;
}

// ---------------------------------------------------------------- render

function wirePlayer(container: HTMLElement): void {
	const button = container.querySelector<HTMLButtonElement>("[data-toy-load-player]");
	const slot = container.querySelector<HTMLElement>("[data-toy-player-slot]");
	if (!button || !slot || button.dataset.wired === "true") return;
	button.dataset.wired = "true";

	button.addEventListener(
		"click",
		() => {
			const src = button.dataset.toyLoadPlayer;
			if (!src) return;
			const frame = document.createElement("iframe");
			frame.src = src;
			frame.height = "152";
			frame.loading = "lazy";
			frame.allow = "clipboard-write; encrypted-media; fullscreen; picture-in-picture";
			frame.title = `Spotify player: ${button.dataset.playlistName ?? "playlist"}`;
			slot.replaceChildren(frame);
			button.remove();
		},
		{ once: true },
	);
}

function render(root: HTMLElement, rating: ConditionsRating, profile: SpotProfile): void {
	root.dataset.tier = rating.tier;

	const eyebrow = root.querySelector<HTMLElement>("[data-toy-eyebrow]");
	if (eyebrow) eyebrow.textContent = EYEBROWS[rating.tier];

	const stamp = root.querySelector<HTMLElement>("[data-toy-stamp]");
	if (stamp) {
		const when = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		stamp.textContent = `${profile.name} · ${when}`;
	}

	const headline = root.querySelector<HTMLElement>("[data-toy-headline]");
	if (headline) {
		headline.textContent =
			rating.tier === "unknown" ? "The forecast didn't come through." : HEADLINES[rating.tier];
	}

	const reasons = root.querySelector<HTMLElement>("[data-toy-reasons]");
	if (reasons) {
		reasons.replaceChildren(
			...rating.reasons.map((text) => {
				const li = document.createElement("li");
				li.textContent = text;
				return li;
			}),
		);
	}

	const joke = root.querySelector<HTMLElement>("[data-toy-joke]");
	if (joke) joke.textContent = rating.tier === "unknown" ? "" : pickJoke(rating.tier);

	const i = rating.inputs;
	const geometry =
		i.wave_height_m === null || i.wave_period_s === null || i.wind_speed_ms === null
			? null
			: swellGeometry({
					wave_height_m: i.wave_height_m,
					wave_period_s: i.wave_period_s,
					wind_speed_ms: i.wind_speed_ms,
					wind_relation: rating.wind_relation,
				});

	const numbers = root.querySelector<HTMLElement>("[data-toy-numbers]");
	if (numbers) numbers.replaceChildren(...buildNumbers(rating, geometry));

	const compass = root.querySelector<HTMLElement>("[data-toy-compass]");
	if (compass) compass.innerHTML = rating.tier === "unknown" ? "" : buildCompass(rating, profile);

	const diagram = root.querySelector<HTMLElement>("[data-toy-diagram]");
	const caption = root.querySelector<HTMLElement>("[data-toy-caption]");
	if (diagram && caption) {
		if (geometry) {
			diagram.innerHTML = buildDiagram(geometry);
			caption.textContent = captionFor(geometry);
		} else {
			diagram.innerHTML = "";
			caption.textContent =
				"No drawing, because there is no reading to draw. Rather than invent a number, this says nothing.";
		}
	}

	for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-toy-playlist]"))) {
		const matches = el.dataset.toyPlaylist === rating.tier;
		el.classList.toggle("hidden", !matches);
		if (matches) wirePlayer(el);
	}
}

function failClosed(): void {
	const root = document.getElementById("toy-root");
	if (!root) return;
	render(
		root,
		rateConditions(
			{
				wave_height_m: null,
				wave_period_s: null,
				wave_direction_deg: null,
				wind_speed_ms: null,
				wind_direction_deg: null,
				valid_time_utc: new Date().toISOString(),
			},
			LINDA_MAR,
		),
		LINDA_MAR,
	);
}

async function init(): Promise<void> {
	const root = document.getElementById("toy-root");
	if (!root) return;
	const input = await loadConditions();
	render(root, rateConditions(input, LINDA_MAR), LINDA_MAR);
}

document.addEventListener("DOMContentLoaded", () => {
	init().catch(failClosed);
});
