/**
 * Surface tones for magazine tiles and bands, so a write-up alternates white, grey and black blocks
 * instead of a column of identical cards. Sections never take a color: "ink" is black and the rest
 * are white or grey. The page's season pair shows in the ripples on each surface.
 * ("field", "spot" and "sand" were colored surfaces; they now map to grey.)
 */
export type TileTone = "paper" | "ink" | "field" | "spot" | "sand" | "grey";

export interface ToneClasses {
	/** Background + text color for the surface. */
	surface: string;
	/** The little tab label on the box. */
	tab: string;
	/** Hard shadow. */
	shadow: string;
	/** Ripple color on this surface. */
	ring: string;
	/** Grain overlay for this surface. */
	grain: string;
	/** Black surfaces set data-dark, so buttons on them drop their shadow. */
	dark: boolean;
}

export function toneClasses(tone: TileTone): ToneClasses {
	switch (tone) {
		case "ink":
			return {
				surface: "bg-black text-dark-ink",
				tab: "bg-dark-ink text-black",
				shadow: "shadow-hard-lg",
				ring: "text-ring-dark",
				grain: "halftone-light opacity-15",
				dark: true,
			};
		case "paper":
			return {
				surface: "bg-paper text-ink",
				tab: "bg-black text-dark-ink",
				shadow: "shadow-hard-lg",
				ring: "text-ring-paper",
				grain: "halftone opacity-20",
				dark: false,
			};
		default:
			return {
				surface: "bg-grey text-ink",
				tab: "bg-black text-dark-ink",
				shadow: "shadow-hard-lg",
				ring: "text-ring-paper",
				grain: "halftone opacity-20",
				dark: false,
			};
	}
}
