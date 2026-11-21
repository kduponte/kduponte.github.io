// Camera framing helpers for subjects drawn by the shared viewer (src/scripts/three/viewer.ts),
// which backs off far enough to fit a flat half-height around its target. Seen from above, near
// low corners look lower and far high ones higher than that flat fit allows, so a subject that
// sits on a plinth or a table clips at the bottom. frameVertically corrects for it. The method is
// the one in buoy-diorama.ts, here with no scene dependencies so any subject can import it.

/** The shared viewer's vertical field of view (half of its 28 degrees) and framing margin. */
export const VIEWER_HALF_FOV = (14 * Math.PI) / 180;
export const VIEWER_MARGIN = 1.12;

/** A point to keep in frame: its height, and its horizontal distance away from the camera (negative = nearer). */
export type Extreme = [y: number, away: number];

/**
 * A target height on the spin axis and a half-height for the viewer so every extreme fits
 * vertically in perspective, seen from `elevation` radians above the horizon. The camera distance
 * depends on the half-height, so iterate.
 */
export function frameVertically(extremes: Extreme[], elevation: number): { targetY: number; halfHeight: number } {
	const c = Math.cos(elevation);
	const s = Math.sin(elevation);
	let ty = 0;
	let half = 1;
	for (let i = 0; i < 16; i++) {
		const dist = (half / Math.tan(VIEWER_HALF_FOV)) * VIEWER_MARGIN;
		const ups = extremes.map(([y, away]) => {
			const up = (y - ty) * c + away * s;
			const depth = away * c - (y - ty) * s;
			return (up * dist) / (dist + depth);
		});
		const top = Math.max(...ups);
		const bottom = Math.min(...ups);
		ty += (top + bottom) / 2 / c;
		half = Math.max((top - bottom) / 2, 1e-3);
	}
	return { targetY: ty, halfHeight: half * Math.cos(VIEWER_HALF_FOV) };
}
