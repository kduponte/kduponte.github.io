// Geometry for the live conditions readout at Linda Mar.
//
// The point of putting this in a tested module rather than inside the renderer: every mark in that
// drawing has to trace back to a forecast number, the same discipline the rest of this project
// uses for its charts. An earlier version drew a generic decorative squiggle that looked identical
// on a two-foot day and a fifteen-foot day, which made it a mood board rather than a readout.
//
// The drawing is a side-on cross-section of open water. Three properties carry the data:
//
//   - Crest spacing comes from the real deep-water wavelength, so a short-period windswell draws
//     packed chatter and a long-period groundswell draws one slow wall. This is the single most
//     informative thing in the picture and it is physically exact, not stylised.
//   - Amplitude is linear in significant wave height, so sizes are comparable between readings.
//   - Surface texture comes from the wind, because at this beach wind decides more than size does.
//
// Motion is tied to the period too: a crest advances one wavelength in exactly one wave period, so
// the animation duration is the period in seconds. A 17-second groundswell visibly marches while a
// 6-second windswell chatters.

/** Standard gravity, m/s^2. */
export const GRAVITY_MS2 = 9.81;

/** SVG user-space dimensions the renderer and this module both agree on. */
export const VIEW = { width: 640, height: 112, waterline: 66 } as const;

/**
 * How much open water one frame represents. Fixed rather than fitted to each reading, because a
 * window that resized itself would destroy the only thing the spacing is for: comparing a
 * short-period day against a long-period one.
 */
export const WINDOW_M = 400;

/** Deep-water wavelength, L = gT^2 / 2pi. Exact in water deeper than about L/2, which is where
 * the forecast model's own wave field lives. */
export function deepWaterWavelengthM(periodS: number): number {
	if (!Number.isFinite(periodS) || periodS <= 0) return 0;
	return (GRAVITY_MS2 * periodS * periodS) / (2 * Math.PI);
}

/** Deep-water phase speed, c = L / T = gT / 2pi, in m/s. */
export function deepWaterSpeedMs(periodS: number): number {
	if (!Number.isFinite(periodS) || periodS <= 0) return 0;
	return (GRAVITY_MS2 * periodS) / (2 * Math.PI);
}

/** The height that maps to full amplitude in the frame. Above this the drawing clamps rather than
 * overflowing, which at this beach only happens on days nobody is paddling out anyway. Chosen so
 * an ordinary two-to-six foot day still draws as a recognisable wave rather than a flat line. */
const HEIGHT_FULL_SCALE_M = 5;
const AMPLITUDE_MAX_PX = 46;
const AMPLITUDE_MIN_PX = 3;

/** Clamped so a frame always draws something recognisable: at least a partial crest, never more
 * detail than the pixels can carry. */
const CRESTS_MIN = 0.6;
const CRESTS_MAX = 14;

/**
 * Pixels per metre on each axis. These differ, and the page says so: the horizontal scale is the
 * true one, while the vertical is stretched the way every wave diagram ever drawn stretches it,
 * because swell drawn at true aspect is a flat line. Exposing the factor means the caption can
 * state it rather than claiming the whole picture is to scale.
 */
export const HORIZONTAL_PX_PER_M = VIEW.width / WINDOW_M;
export const VERTICAL_PX_PER_M = AMPLITUDE_MAX_PX / HEIGHT_FULL_SCALE_M;
export const VERTICAL_EXAGGERATION = VERTICAL_PX_PER_M / HORIZONTAL_PX_PER_M;

export interface SwellGeometry {
	/** Metres of open water across the frame. */
	window_m: number;
	/** True deep-water wavelength for this period, in metres. */
	wavelength_m: number;
	/** Deep-water phase speed, in m/s. */
	speed_ms: number;
	/** Crests visible across the frame, before clamping. Reported so the caption can be honest. */
	crests_in_view: number;
	/** Horizontal distance between crests, in SVG user units. */
	crest_spacing_px: number;
	/** Crest-to-trough half-height, in SVG user units. */
	amplitude_px: number;
	/** Ripple riding on the surface, from onshore or cross wind tearing at it. Zero when clean. */
	chop_amplitude_px: number;
	/** Offshore wind holds the crest up and blows spray back off the top. */
	spray: boolean;
	/** Seconds for a crest to advance one wavelength, which is the wave period by definition. */
	drift_seconds: number;
}

export interface SwellGeometryInput {
	wave_height_m: number;
	wave_period_s: number;
	wind_speed_ms: number;
	/** Wind relation as already judged against the beach, so this module does not re-decide it. */
	wind_relation: "offshore" | "onshore" | "cross" | "calm" | "unknown";
}

export function swellGeometry(input: SwellGeometryInput): SwellGeometry {
	const { wave_height_m: height, wave_period_s: period, wind_speed_ms: windSpeed, wind_relation: relation } = input;

	const wavelength = deepWaterWavelengthM(period);
	const rawCrests = wavelength > 0 ? WINDOW_M / wavelength : CRESTS_MAX;
	const crests = Math.min(CRESTS_MAX, Math.max(CRESTS_MIN, rawCrests));

	const amplitude = Math.min(
		AMPLITUDE_MAX_PX,
		Math.max(AMPLITUDE_MIN_PX, (Math.max(0, height) / HEIGHT_FULL_SCALE_M) * AMPLITUDE_MAX_PX),
	);

	// Only wind with an onshore component roughens the surface. Offshore wind does the opposite,
	// which is why it is the thing surfers hope for and why it gets spray instead of chop.
	const roughening = relation === "onshore" ? 1 : relation === "cross" ? 0.5 : 0;
	const chop = roughening === 0 ? 0 : Math.min(7, Math.max(0, windSpeed - 2) * 0.55 * roughening);

	return {
		window_m: WINDOW_M,
		wavelength_m: wavelength,
		speed_ms: deepWaterSpeedMs(period),
		crests_in_view: rawCrests,
		crest_spacing_px: VIEW.width / crests,
		amplitude_px: amplitude,
		chop_amplitude_px: chop,
		spray: relation === "offshore" && windSpeed > 2,
		drift_seconds: Math.max(1, period),
	};
}

/**
 * The swell profile as an SVG path, drawn one full wavelength wider than the frame on each side so
 * it can be translated by exactly one crest spacing without revealing an end.
 *
 * Deliberately not a pure sine: real swell has sharper crests and flatter troughs (its profile is
 * closer to a Stokes wave), so the crest is drawn peakier than the trough is deep. A sine would be
 * smoother and more obviously wrong to anyone who has looked at the ocean.
 */
export function swellPath(geometry: SwellGeometry, options: { yOffset?: number; samples?: number } = {}): string {
	const { crest_spacing_px: spacing, amplitude_px: amplitude, chop_amplitude_px: chop } = geometry;
	const yOffset = options.yOffset ?? 0;
	const baseline = VIEW.waterline + yOffset;
	const samplesPerCrest = Math.max(8, options.samples ?? 24);

	const startX = -spacing;
	const endX = VIEW.width + spacing * 2;
	const step = spacing / samplesPerCrest;

	const points: string[] = [];
	for (let x = startX; x <= endX; x += step) {
		const phase = (x / spacing) * Math.PI * 2;
		// Skewed so crests peak and troughs flatten, the Stokes-like asymmetry of real swell.
		const base = Math.sin(phase) - 0.18 * Math.cos(2 * phase);
		const ripple = chop === 0 ? 0 : Math.sin(phase * 7.3) * (chop / amplitude);
		const y = baseline - amplitude * (base + ripple);
		points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
	}

	return `M ${points.join(" L ")}`;
}

/** Closes a swell path down to the bottom of the frame so the water below it can be filled. */
export function swellFillPath(geometry: SwellGeometry, options: { yOffset?: number } = {}): string {
	const spacing = geometry.crest_spacing_px;
	const line = swellPath(geometry, options);
	return `${line} L ${(VIEW.width + spacing * 2).toFixed(1)} ${VIEW.height} L ${(-spacing).toFixed(1)} ${VIEW.height} Z`;
}

/** Converts a compass bearing into a point on a circle, with 0 degrees at the top (north) and
 * bearings running clockwise, which is the opposite handedness from raw trigonometry. */
export function bearingToPoint(bearingDeg: number, radius: number, cx = 0, cy = 0): { x: number; y: number } {
	const rad = ((bearingDeg - 90) * Math.PI) / 180;
	return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}
