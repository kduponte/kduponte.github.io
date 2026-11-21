// The gauge console's dial geometry and colors, with no three.js import, so the static fallback and
// the readout script can share them without pulling three.js into the page's first bundle.

export interface ConsoleColors {
	/** Dash plastic: the 22RE truck's dash, its interior gray shaded 35% (kit `shade`). */
	dash: string;
	trim: string;
	face: string;
	ink: string;
	redline: string;
	/** Lamp colors: a flagged metric that truly moved, and a flagged metric that was truly null. */
	lift: string;
	null: string;
	lampOff: string;
}

export const DEFAULT_CONSOLE_COLORS: ConsoleColors = {
	dash: "#575b60",
	trim: "#111111",
	face: "#f6f1e4",
	ink: "#111111",
	redline: "#d62828",
	lift: "#c8ff3d",
	null: "#ff5a1f",
	lampOff: "#2c2e31",
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
