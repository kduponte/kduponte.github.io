// The season: twelve ground + ring pairs, built like Cav Empt's lookbook (cavempt.com/looks), where
// each look sets a near-grey ground and puts the color in its ripples. Nine pairs come from their
// looks (lilac and periwinkle ones left out) and three from the Signal palette. Each page owns one
// pair: its project tile uses the ground, and every ripple on its page uses the ring. Grounds of
// sections stay white, grey or black; color you can click (buttons, nav) is safety orange.

export type SeasonId =
	| "signal"
	| "night"
	| "rose"
	| "shell"
	| "espresso"
	| "moss"
	| "drill"
	| "ash"
	| "coral"
	| "cobalt"
	| "sage"
	| "concrete";

export interface SeasonPair {
	id: SeasonId;
	name: string;
	/** Tile ground. */
	ground: string;
	/** Ripple color on its own ground. */
	ring: string;
	/** Where the pair came from. */
	source: string;
}

export const SEASON: readonly SeasonPair[] = [
	{ id: "signal", name: "Signal", ground: "#2b2d30", ring: "#ff5b1f", source: "Signal" },
	{ id: "night", name: "Night swim", ground: "#1a191c", ring: "#56b2c7", source: "Cav Empt look 23" },
	{ id: "rose", name: "Rose", ground: "#20232d", ring: "#cc7d95", source: "Cav Empt look 30" },
	{ id: "shell", name: "Shell", ground: "#302f32", ring: "#f2c6ca", source: "Cav Empt look 6" },
	{ id: "espresso", name: "Espresso", ground: "#201716", ring: "#f3e5ce", source: "Cav Empt look 14" },
	{ id: "moss", name: "Moss", ground: "#3f3f48", ring: "#7f887c", source: "Cav Empt look 12" },
	{ id: "drill", name: "Drill", ground: "#4a5034", ring: "#cfcfca", source: "Signal" },
	{ id: "ash", name: "Ash", ground: "#282630", ring: "#515355", source: "Cav Empt look 17" },
	{ id: "coral", name: "Coral", ground: "#a8b3b9", ring: "#f47468", source: "Cav Empt look 25" },
	{ id: "cobalt", name: "Cobalt mist", ground: "#e0dcda", ring: "#2a70c8", source: "Cav Empt look 8" },
	{ id: "sage", name: "Sage line", ground: "#dfd8d4", ring: "#85896d", source: "Cav Empt look 13" },
	{ id: "concrete", name: "Concrete", ground: "#cfcfca", ring: "#8f8c84", source: "Signal" },
];

/** Which pair each page wears, by slug (projects) or page name. */
const byPage: Record<string, SeasonId> = {
	about: "shell",
	experience: "signal",
	"the-22re-restoration": "espresso",
	"the-dashboard-problem": "coral",
	"the-noise-problem": "moss",
	"the-peeking-problem": "cobalt",
	"the-volume-gap": "night",
	"the-forecast-gap": "rose",
	"experimentation-toolkit": "drill",
	"causal-inference-notes": "sage",
};

// Fixed grounds shared by every page.
export const INK = "#111111";
export const PAPER = "#ffffff";
export const GREY = "#f0f0ef";
export const DARK = INK;
export const DARK_INK = "#f5f5f3";

const rgb = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
};
const channel = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
	const [r, g, b] = rgb(hex).map(channel);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
	const x = luminance(a);
	const y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** True when ink reads better on this ground than white does. */
export const isLight = (hex: string) => contrast(hex, INK) >= contrast(hex, PAPER);

/** Text color for a ground. */
export const textOn = (hex: string) => (isLight(hex) ? INK : DARK_INK);

// A ring this close to the ground it sits on would vanish; it flips to the pair's own ground, so
// pale rings (Shell, Espresso, Drill) read as their inverse on white.
const MIN_RING_CONTRAST = 2;
const ringFor = (pair: SeasonPair, ground: string) =>
	contrast(pair.ring, ground) >= MIN_RING_CONTRAST ? pair.ring : pair.ground;

export interface PageTheme {
	pair: SeasonPair;
	/** Text color on the pair's ground. */
	groundInk: string;
	/** Ripple color on each shared ground. */
	ringOnPaper: string;
	ringOnDark: string;
	/** CSS custom properties that hand the pair to Tailwind (see global.css). */
	vars: string;
}

export function pairById(id: SeasonId): SeasonPair {
	return SEASON.find((p) => p.id === id) ?? SEASON[0];
}

export function seasonFor(page: string): SeasonPair | null {
	const id = byPage[page];
	return id ? pairById(id) : null;
}

export function themeFor(pair: SeasonPair): PageTheme {
	const groundInk = textOn(pair.ground);
	const ringOnPaper = ringFor(pair, PAPER);
	const ringOnDark = ringFor(pair, DARK);
	const vars = [
		`--season-ground: ${pair.ground}`,
		`--season-ground-ink: ${groundInk}`,
		`--season-ring: ${pair.ring}`,
		`--season-ring-paper: ${ringOnPaper}`,
		`--season-ring-dark: ${ringOnDark}`,
	].join("; ");
	return { pair, groundInk, ringOnPaper, ringOnDark, vars };
}

/** The theme for a project tile or page. Pages without a pair fall back to Concrete. */
export function projectTheme(slug: string): PageTheme {
	return themeFor(seasonFor(slug) ?? pairById("concrete"));
}
