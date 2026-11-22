/**
 * The one channel between the 22R-E's 3D view (a lazily loaded chunk) and its HTML readout and
 * legend (a small eager script). Neither imports the other: whoever wants a system shown calls
 * `showSystem` on the shared root, and both listen for the event it dispatches.
 *
 * A pinned system (from a tap or a legend click) stays until something else is pinned; a hovered
 * one shows only while the pointer is over it, then the readout falls back to the pinned one.
 */
import type { EngineSystem } from "../../lib/three/engine-22re-data";

export const ENGINE_SHOW = "engine:show";

export interface EngineShowDetail {
	/** The system to show now, or null for none. */
	system: EngineSystem | null;
}

/** The pinned system on a root, if any. */
export function pinnedSystem(root: HTMLElement): EngineSystem | null {
	return (root.dataset.pinned as EngineSystem | undefined) || null;
}

function emit(root: HTMLElement, system: EngineSystem | null) {
	root.dataset.shown = system ?? "";
	root.dispatchEvent(new CustomEvent<EngineShowDetail>(ENGINE_SHOW, { detail: { system } }));
}

/** Pin a system (or clear the pin with null; pinning the pinned one again clears it too). */
export function pinSystem(root: HTMLElement, system: EngineSystem | null): void {
	const next = system && pinnedSystem(root) === system ? null : system;
	root.dataset.pinned = next ?? "";
	emit(root, next);
}

/** Show a system while hovering it; null returns to the pinned one. */
export function hoverSystem(root: HTMLElement, system: EngineSystem | null): void {
	const target = system ?? pinnedSystem(root);
	if ((root.dataset.shown || null) !== target) emit(root, target);
}
