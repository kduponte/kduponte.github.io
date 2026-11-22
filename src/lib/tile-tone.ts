import { projectTheme } from "./project-theme";

/**
 * Surface tones for magazine tiles and bands, so a write-up alternates paper, dark and colored
 * blocks instead of a column of identical cream cards. Every tone stays inside the site palette:
 * "field" is the project's own color (its card and hero), "spot" the page accent, "ink" near-black.
 */
export type TileTone = "paper" | "ink" | "field" | "spot" | "sand";

export interface ToneClasses {
	/** Background + text color for the surface. */
	surface: string;
	/** The little tab label on the box. */
	tab: string;
	/** Hard shadow; a dark tile throws an accent-colored one so it still reads on paper. */
	shadow: string;
	/** Ripple ring color for bands. */
	ring: string;
}

export function toneClasses(tone: TileTone, pathname: string): ToneClasses {
	const slug = pathname.split("/").filter(Boolean).pop() ?? "";
	const theme = projectTheme(slug);
	switch (tone) {
		case "ink":
			return { surface: "bg-black text-bone", tab: "bg-spot text-black", shadow: "shadow-[8px_8px_0_var(--page-spot)]", ring: "text-spot/35" };
		case "field":
			return { surface: theme.fill, tab: "bg-black text-spot", shadow: "shadow-hard-lg", ring: theme.ring };
		case "spot":
			return { surface: "bg-spot text-black", tab: "bg-black text-spot", shadow: "shadow-hard-lg", ring: "text-black/15" };
		case "sand":
			return { surface: "bg-sand text-black", tab: "bg-black text-spot", shadow: "shadow-hard-lg", ring: "text-black/12" };
		default:
			return { surface: "bg-cream text-black", tab: "bg-black text-spot", shadow: "shadow-hard-lg", ring: "text-black/15" };
	}
}
