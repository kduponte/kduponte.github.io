/**
 * The one channel between the Forecast Gap buoy's 3D view (a lazily loaded chunk) and its HTML
 * readout (a small eager script). Neither imports the other: whoever wants a different station
 * calls `selectStation` on the shared root, and both listen for the event it dispatches.
 */
export const BUOY_SELECT = "buoy:select";

export interface BuoySelectDetail {
	index: number;
}

/** The current station index on a root element. */
export function currentStation(root: HTMLElement): number {
	return Number(root.dataset.station ?? 0) || 0;
}

/** Select a station by index (wrapping), record it on the root, and tell every listener. */
export function selectStation(root: HTMLElement, index: number): void {
	const n = Number(root.dataset.count ?? 1) || 1;
	const i = ((index % n) + n) % n;
	root.dataset.station = String(i);
	root.dispatchEvent(new CustomEvent<BuoySelectDetail>(BUOY_SELECT, { detail: { index: i } }));
}
