// CustomEvent-based pub/sub for the live profile. No state management library — this is the
// entire "state layer" for the hero interaction (brief §3 InteractiveDemo, plan §6).
import type { ComparisonResult } from "../../lib/surf-volume/types";

export const PROFILE_CHANGE_EVENT = "volume-gap:profile-change";

export function dispatchProfileChange(detail: ComparisonResult) {
	document.dispatchEvent(new CustomEvent<ComparisonResult>(PROFILE_CHANGE_EVENT, { detail }));
}

export function onProfileChange(handler: (detail: ComparisonResult) => void): () => void {
	const listener = (event: Event) => handler((event as CustomEvent<ComparisonResult>).detail);
	document.addEventListener(PROFILE_CHANGE_EVENT, listener);
	return () => document.removeEventListener(PROFILE_CHANGE_EVENT, listener);
}
