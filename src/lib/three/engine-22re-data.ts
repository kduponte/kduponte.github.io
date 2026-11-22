/**
 * The numbers behind the 3D 22R-E: the engine's cited geometry, the crank and firing-order math
 * that moves its pistons, and the mapping from forum failure categories to the parts that carry
 * them. No three.js here, so the page can compute the same colors and labels at build time.
 */

/** Where each figure comes from, so the page can cite it next to the number. */
export const SOURCES = {
	wiki: { label: "Wikipedia, Toyota R engine", href: "https://en.wikipedia.org/wiki/Toyota_R_engine#22R" },
	charm: {
		label: "Toyota factory service manual, 1991 Pickup 2WD 22R-E (Operation CHARM)",
		href: "https://charm.li/Toyota/1991/Pickup%202WD%20L4-144.4%202366cc%202.4L%20SOHC%20%2822R-E%29/",
	},
	lceBlock: {
		label: "LC Engineering, 22R block identification",
		href: "https://www.lceperformance.com/tech-articles/engine-specific/20r-22r-re-rt-e-bottom-end/engine-block-identification/",
	},
	lceHead: { label: "LC Engineering, proper deck heights", href: "https://lceperformance.com/category-s/23352.htm" },
	lceRod: { label: "LC Engineering, 22R pistons, rods and crankshafts", href: "https://lceperformance.com/category-s/23265.htm" },
} as const;

export type SourceKey = keyof typeof SOURCES;

const INCH = 0.0254;

/**
 * Engine geometry in meters. Everything the model draws to scale comes from here; anything else
 * on the model is proportioned from photos and says so where it's built.
 */
export const ENGINE = {
	/** 92.0 mm; the factory manual gives 3.6220-3.6232 in standard. */
	bore: 0.092,
	/** 89 mm. */
	stroke: 0.089,
	/** Connecting rod, center to center: 5.830 in. */
	rod: 5.83 * INCH,
	/** 1985-95 "laser block", crankshaft center to the top of the deck: 8.950 in. */
	crankToDeck: 8.95 * INCH,
	/** Same block, oil-pan rail to the top of the deck: 11.090 in. */
	panRailToDeck: 11.09 * INCH,
	/** 1985-95 head, head surface to the bottom of the camshaft journal: 3.130 in. */
	headDeck: 3.13 * INCH,
	cylinders: 4,
	valvesPerCylinder: 2,
	/** Factory manual: 1-3-4-2. */
	firingOrder: [1, 3, 4, 2] as const,
	/** Factory manual idle speed. */
	idleRpm: 750,
	/**
	 * Not published in any source I could find. Drawn as the bore plus a 10 mm wall, and labeled
	 * as an estimate wherever it shows.
	 */
	boreSpacingEstimate: 0.102,
} as const;

/** Displacement from bore and stroke, in cubic centimeters: 4 x pi/4 x bore^2 x stroke. */
export function displacementCc(bore = ENGINE.bore, stroke = ENGINE.stroke, cylinders = ENGINE.cylinders): number {
	return cylinders * (Math.PI / 4) * (bore * 100) ** 2 * (stroke * 100);
}

/** Piston pin height above the crown, implied by the deck height, rod and stroke (a zero-deck engine). */
export const COMPRESSION_HEIGHT = ENGINE.crankToDeck - ENGINE.rod - ENGINE.stroke / 2;

/**
 * Crank phase of each cylinder (1-indexed): in an inline-4, 1 and 4 share a crankpin angle and 2
 * and 3 sit opposite them.
 */
export function crankPhase(cylinder: number): number {
	return cylinder === 1 || cylinder === 4 ? 0 : Math.PI;
}

/**
 * Height of a piston crown above the crank centerline at crank angle `theta` (radians, 0 = cylinder
 * 1 at top dead center), from the slider-crank relation with the real rod length.
 */
export function pistonCrownY(theta: number, cylinder: number): number {
	const r = ENGINE.stroke / 2;
	const a = theta + crankPhase(cylinder);
	return r * Math.cos(a) + Math.sqrt(ENGINE.rod ** 2 - (r * Math.sin(a)) ** 2) + COMPRESSION_HEIGHT;
}

/** Crank angle (radians, within the 720 degree cycle) at which a cylinder fires, from the firing order. */
export function firingAngle(cylinder: number): number {
	const slot = ENGINE.firingOrder.indexOf(cylinder as 1 | 2 | 3 | 4);
	if (slot < 0) throw new Error(`No cylinder ${cylinder}`);
	return slot * Math.PI;
}

/**
 * How bright a cylinder's combustion flash is at crank angle `theta`: 1 the instant it fires,
 * fading over the next ~60 degrees of rotation, 0 for the rest of the 720 degree cycle.
 */
export function firingGlow(theta: number, cylinder: number): number {
	const cycle = 4 * Math.PI;
	const since = (((theta - firingAngle(cylinder)) % cycle) + cycle) % cycle;
	return since < Math.PI / 3 ? 1 - since / (Math.PI / 3) : 0;
}

/** Display speed: the 750 rpm idle slowed this many times, so each firing can be seen. */
export const SLOWDOWN = 25;

/** Crank angle at time `t` seconds, running at the factory idle slowed by SLOWDOWN. */
export function crankAngleAt(t: number): number {
	return ((ENGINE.idleRpm / SLOWDOWN) / 60) * 2 * Math.PI * t;
}

/** The engine systems the model colors, each tied to one forum failure category. */
export type EngineSystem = "drivetrain" | "electrical" | "fuel" | "cooling" | "ac" | "timing" | "headGasket" | "oil";

export interface SystemInfo {
	key: EngineSystem;
	/** Exactly as it appears in failure_categories.json. */
	category: string;
	/** Short label for the readout. */
	label: string;
	/** Which parts of the model carry the color. */
	parts: string;
	/** A caveat when the category is wider than the parts drawn. */
	note?: string;
}

export const ENGINE_SYSTEMS: SystemInfo[] = [
	{
		key: "drivetrain",
		category: "Transmission / drivetrain",
		label: "Transmission / drivetrain",
		parts: "bellhousing and the front of the gearbox",
		note: "Not the engine at all, and still the biggest category.",
	},
	{
		key: "electrical",
		category: "Electrical",
		label: "Electrical",
		parts: "alternator, starter, distributor and plug wires",
		note: "These threads cover the whole truck's wiring, not only the engine's.",
	},
	{ key: "fuel", category: "Fuel / carburetor / EFI", label: "Fuel / EFI", parts: "intake plenum, throttle body, injectors and fuel rail" },
	{ key: "cooling", category: "Cooling / overheating", label: "Cooling", parts: "water pump, fan, thermostat housing and upper hose" },
	{ key: "ac", category: "AC / climate control", label: "AC", parts: "AC compressor", note: "AC was an option; not every truck has one." },
	{ key: "timing", category: "Timing chain", label: "Timing chain", parts: "timing chain cover (the single-row chain and its plastic guides sit behind it)" },
	{ key: "headGasket", category: "Head gasket", label: "Head gasket", parts: "the gasket between the iron block and the aluminum head" },
	{ key: "oil", category: "Oil leaks", label: "Oil leaks", parts: "oil pan and valve cover gasket" },
];

/** Forum categories with no part on the engine, listed beside the model so the totals add up. */
export const OFF_ENGINE_CATEGORIES = ["Steering / brakes / suspension", "Rust / body", "Other / uncategorized"] as const;

export interface CategoryCount {
	category: string;
	count: number;
	percentage: number;
}

export interface SystemCount extends SystemInfo {
	count: number;
	percentage: number;
}

/** Join the frozen category counts onto the engine systems. Throws if the data is missing one. */
export function systemCounts(categories: CategoryCount[]): SystemCount[] {
	return ENGINE_SYSTEMS.map((s) => {
		const row = categories.find((c) => c.category === s.category);
		if (!row) throw new Error(`failure_categories.json has no "${s.category}"`);
		return { ...s, count: row.count, percentage: row.percentage };
	});
}

/** Color ramp stops, low count to high: pale sun, the site's tomato, deep truck red. */
const RAMP = ["#fff1a8", "#ffb000", "#ff5a1f", "#b3161f"] as const;

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Tint for a failure count, on a scale from 0 to `max` threads. Linear in the count, so a part
 * twice as red-shifted has twice the threads.
 */
export function failureTint(count: number, max: number): string {
	const f = Math.max(0, Math.min(1, max > 0 ? count / max : 0)) * (RAMP.length - 1);
	const i = Math.min(Math.floor(f), RAMP.length - 2);
	const t = f - i;
	const a = hexToRgb(RAMP[i]);
	const b = hexToRgb(RAMP[i + 1]);
	return `#${a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The stops as CSS, for the legend's scale bar. */
export function rampGradient(): string {
	return `linear-gradient(to right, ${RAMP.join(", ")})`;
}
