/**
 * The channel between the truck builder's 3D view (a lazily loaded chunk) and its HTML controls.
 * The controls say which build to show and which parts to open; the 3D view says when a tap on the
 * truck opened or closed something, so the buttons can follow.
 */
import type { Build } from "../../lib/three/truck-builder-options";
import type { OpenerKey } from "../../lib/three/toyota-truck-model";

export const BUILD_SHOW = "truck-builder:build";
export const OPEN_SET = "truck-builder:open";
export const OPEN_CHANGED = "truck-builder:opened";

export interface BuildShowDetail {
	build: Build;
}

export interface OpenDetail {
	key: OpenerKey;
	open: boolean;
}

/** The build currently shown, stored on the root so a late-mounting 3D view can pick it up. */
export function showBuild(root: HTMLElement, build: Build): void {
	root.dataset.build = JSON.stringify(build);
	root.dispatchEvent(new CustomEvent<BuildShowDetail>(BUILD_SHOW, { detail: { build } }));
}

export function currentBuild(root: HTMLElement): Build | null {
	return root.dataset.build ? (JSON.parse(root.dataset.build) as Build) : null;
}

/** Which parts are open, stored on the root as a comma list. */
export function openParts(root: HTMLElement): Set<OpenerKey> {
	return new Set((root.dataset.open ?? "").split(",").filter(Boolean) as OpenerKey[]);
}

function storeOpen(root: HTMLElement, key: OpenerKey, open: boolean) {
	const set = openParts(root);
	if (open) set.add(key);
	else set.delete(key);
	root.dataset.open = [...set].join(",");
}

/** From the controls: open or close a part. */
export function setPart(root: HTMLElement, key: OpenerKey, open: boolean): void {
	storeOpen(root, key, open);
	root.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_SET, { detail: { key, open } }));
}

/** From the 3D view: a tap toggled a part. */
export function partToggled(root: HTMLElement, key: OpenerKey): void {
	const open = !openParts(root).has(key);
	storeOpen(root, key, open);
	root.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_CHANGED, { detail: { key, open } }));
	root.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_SET, { detail: { key, open } }));
}
