// Water color for the Forecast Gap diorama: sea surface temperature at the buoy, on a sequential
// scale. Cold water draws dark green-teal (the color of California's upwelled, plankton-rich
// water), warm water light turquoise (Hawaii's clear tropical water), so the scale reads the way
// the ocean tends to look; but it is an encoding, stated on the page, not a claim that
// temperature sets the color of the sea.
//
// Interpolated in OKLab so equal steps in temperature look like equal steps in color, with
// lightness rising monotonically from cold to warm. The domain comes from the data (the coldest
// and warmest snapshot, rounded out to whole degrees), so every station shares one scale.

/** Coldest and warmest ends of the scale. */
export const WATER_COLD = "#2a8774";
export const WATER_WARM = "#6fe3ee";
/** Shown when a buoy logged no temperature that hour: the site's sky blue, outside the ramp's hues. */
export const WATER_UNKNOWN = "#8fd0ff";

type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
}

function rgbToHex(rgb: [number, number, number]): string {
	return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** sRGB hex to OKLab (Björn Ottosson's matrices). */
export function hexToOklab(hex: string): Lab {
	const [r, g, b] = hexToRgb(hex).map(toLinear);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function oklabToHex([L, a, b]: Lab): string {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return rgbToHex(
		[
			4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
			-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
			-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
		].map(toGamma) as [number, number, number],
	);
}

const COLD = hexToOklab(WATER_COLD);
const WARM = hexToOklab(WATER_WARM);

/** The color a fraction `f` (0 = coldest, 1 = warmest) of the way along the scale. */
export function waterRamp(f: number): string {
	const t = Math.min(1, Math.max(0, f));
	return oklabToHex([0, 1, 2].map((i) => COLD[i] + (WARM[i] - COLD[i]) * t) as Lab);
}

/** The scale's domain: the coldest and warmest readings, rounded out to whole degrees. */
export function temperatureDomain(temps: (number | null | undefined)[]): [number, number] | null {
	const known = temps.filter((t): t is number => typeof t === "number" && Number.isFinite(t));
	if (known.length === 0) return null;
	const lo = Math.floor(Math.min(...known));
	const hi = Math.ceil(Math.max(...known));
	return [lo, hi > lo ? hi : lo + 1];
}

/** Where a temperature sits on the scale, 0 to 1 (clamped), or null when unknown. */
export function temperatureFraction(tempC: number | null | undefined, domain: [number, number] | null): number | null {
	if (typeof tempC !== "number" || !Number.isFinite(tempC) || !domain) return null;
	return Math.min(1, Math.max(0, (tempC - domain[0]) / (domain[1] - domain[0])));
}

/** The water color for a temperature on a domain; WATER_UNKNOWN when there is no reading. */
export function waterColor(tempC: number | null | undefined, domain: [number, number] | null): string {
	const f = temperatureFraction(tempC, domain);
	return f === null ? WATER_UNKNOWN : waterRamp(f);
}

/** Evenly spaced stops along the scale, for a CSS gradient legend. */
export function waterGradientStops(n = 6): string[] {
	return Array.from({ length: n }, (_, i) => waterRamp(i / (n - 1)));
}
