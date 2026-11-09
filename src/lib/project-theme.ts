export type Tone = "tomato" | "bubblegum" | "sky" | "sun" | "lime" | "cream" | "cobalt";

export interface ProjectTheme {
	tone: Tone;
	/** Tailwind classes for the card fill and text color. */
	fill: string;
	/** Dot color for the halftone overlay. */
	dot: string;
}

const fills: Record<Tone, Pick<ProjectTheme, "fill" | "dot">> = {
	tomato: { fill: "bg-tomato text-black", dot: "#111111" },
	bubblegum: { fill: "bg-bubblegum text-black", dot: "#2438ff" },
	sky: { fill: "bg-sky text-black", dot: "#2438ff" },
	sun: { fill: "bg-sun text-black", dot: "#ff5a1f" },
	lime: { fill: "bg-lime text-black", dot: "#111111" },
	cream: { fill: "bg-cream text-black", dot: "#c8c0a8" },
	cobalt: { fill: "bg-cobalt text-cream", dot: "#c8ff3d" },
};

/** Each project owns one tone, reused for its card and (Phase 3) its page theme. */
const bySlug: Record<string, Tone> = {
	"the-22re-restoration": "tomato",
	"the-dashboard-problem": "bubblegum",
	"the-noise-problem": "lime",
	"the-peeking-problem": "sun",
	"the-volume-gap": "cream",
	"the-forecast-gap": "cobalt",
};

export function projectTheme(slug: string): ProjectTheme {
	const tone = bySlug[slug] ?? "cream";
	return { tone, ...fills[tone] };
}
