// Each project is a two-color print: a field plus rings, both from the site's one curated set
// (global.css). Rings pair with their field by complement or by tone, and `spot` is the accent
// the project page's chrome (logo, nav, eyebrow, contact block) picks up, so a page reads as one.
export type Tone = "navy" | "terracotta" | "sage" | "mustard" | "cornflower" | "petrol" | "sand" | "bone";

export interface ProjectTheme {
	tone: Tone;
	/** Tailwind classes for the card fill and text color. */
	fill: string;
	/** Dot color for the halftone overlay (legacy; unused by the grain). */
	dot: string;
	/** Text-color class for the ripple texture (Ripples.astro draws in currentColor). */
	ring: string;
	/** The page accent, as a palette token name (e.g. "mustard"). */
	spot: string;
}

const tones: Record<Tone, Omit<ProjectTheme, "tone">> = {
	navy: { fill: "bg-navy text-bone", dot: "#d9a23f", ring: "text-mustard/70", spot: "mustard" },
	terracotta: { fill: "bg-terracotta text-black", dot: "#1f4a63", ring: "text-petrol/45", spot: "sage" },
	sage: { fill: "bg-sage text-black", dot: "#c65d3b", ring: "text-terracotta/55", spot: "terracotta" },
	mustard: { fill: "bg-mustard text-black", dot: "#1d2a44", ring: "text-navy/40", spot: "cornflower" },
	cornflower: { fill: "bg-cornflower text-black", dot: "#d9a23f", ring: "text-mustard/80", spot: "mustard" },
	petrol: { fill: "bg-petrol text-bone", dot: "#6f8fcf", ring: "text-cornflower/70", spot: "cornflower" },
	sand: { fill: "bg-sand text-black", dot: "#141414", ring: "text-black/15", spot: "sand" },
	bone: { fill: "bg-bone text-black", dot: "#141414", ring: "text-black/15", spot: "mustard" },
};

/** Each project owns one tone, reused for its card and (Phase 3) its page theme. */
const bySlug: Record<string, Tone> = {
	"the-22re-restoration": "navy",
	"the-dashboard-problem": "terracotta",
	"too-good-to-be-true": "terracotta",
	"the-noise-problem": "sage",
	"the-peeking-problem": "mustard",
	"the-volume-gap": "cornflower",
	"the-forecast-gap": "petrol",
	"experimentation-toolkit": "sand",
	"causal-inference-notes": "sand",
};

export function projectTheme(slug: string): ProjectTheme {
	const tone = bySlug[slug] ?? "bone";
	return { tone, ...tones[tone] };
}
