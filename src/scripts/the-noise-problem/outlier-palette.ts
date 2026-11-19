// Colours for the outlier-handling charts. Raw is the untreated baseline, so it gets a neutral
// rather than a categorical hue. The two capping methods get categorical hues validated against
// the paper surface (#f4f0e6): worst all-pairs dE 26.8 under protanopia and 30.3 for full-colour
// readers, both at least 3:1. The site's raw brand accents, used here before, failed the same
// checks (the blue sat under the lightness band, the green read as grey).
export const METHODS = ["Raw", "Pooled threshold", "Stratified threshold"] as const;
export type Method = (typeof METHODS)[number];

export const METHOD_COLOR: Record<Method, string> = {
	Raw: "#857c69",
	"Pooled threshold": "#37579e",
	"Stratified threshold": "#b4820a",
};

/** Reference lines and their labels: ink, not a series colour, since they are not a series. */
export const REFERENCE_INK = "#5c5647";
