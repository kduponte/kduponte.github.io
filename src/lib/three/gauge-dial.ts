// The gauge console's dial geometry and colors, with no three.js import, so the static fallback and
// the readout script can share them without pulling three.js into the page's first bundle.

export interface ConsoleColors {
	/** Dash plastic: the 22RE truck's dash, its interior gray shaded 35% (kit `shade`). */
	dash: string;
	/** Bezels, hubs and outlines. */
	trim: string;
	/** Dial faces: the site's off-white (dark-ink). */
	face: string;
	ink: string;
	/** Red zones: the page's coral (its season ring), deepened to clear 3:1 against the face. */
	redline: string;
	/**
	 * Lamp colors, the page's own encoding: a flagged metric that truly moved is accent blue (the live
	 * experiment's "flagged" text); one that was truly null is the season coral, and blinks.
	 */
	lift: string;
	null: string;
	/** An unlit lamp: Signal graphite. */
	lampOff: string;
}

export const DEFAULT_CONSOLE_COLORS: ConsoleColors = {
	dash: "#575b60",
	trim: "#111111",
	face: "#f5f5f3",
	ink: "#111111",
	redline: "#e8574a",
	lift: "#2a70c8",
	null: "#f47468",
	lampOff: "#2b2d30",
};

/** Dial range and sweep: +/-5 z across 240 degrees, so 24 degrees per unit of z. */
export const DIAL_Z_MAX = 5;
export const DIAL_HALF_SWEEP = (2 * Math.PI) / 3;

/** Gauges per row, and rows: 20 metrics, read left to right, top to bottom. */
export const COLS = 5;
export const ROWS = 4;

/** Needle angle for a z statistic: radians clockwise from straight up, pinned at the dial's ends. */
export function dialAngle(z: number): number {
	const c = Math.max(-DIAL_Z_MAX, Math.min(DIAL_Z_MAX, z));
	return (c / DIAL_Z_MAX) * DIAL_HALF_SWEEP;
}
