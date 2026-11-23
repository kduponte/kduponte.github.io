/**
 * How the Volume Gap's blob changes liters between boards: when the next board is smaller it
 * squeezes drops out as it lands, and when the next board is bigger drops float in and it soaks
 * them up. The drops are equal, at most MAX_DROP_L each, and together carry exactly the change,
 * so the goo on screen always adds up to the liters in the readout. Where they fly is animation.
 */
import { splitLiters } from "./surfboard-morph";

/** The biggest drop, liters: about half the blob's radius, so a big change reads as several. */
export const MAX_DROP_L = 6;
/** Seconds the blob bounces between boards, and its hops in that time. */
export const BLOB_S = 2.3;
export const HOPS = 3;
/** Seconds a drop takes to bulge out and pinch off. */
export const BUD_S = 0.24;
/** Seconds an incoming drop floats in, then takes to sink into the blob. */
export const FLOAT_S = 0.75;
export const MERGE_S = 0.3;

/**
 * When drops squeeze out: as the melt slumps (the phase's start) and just before each later
 * landing, so the squash pushes them out.
 */
export const LANDINGS = Array.from({ length: HOPS }, (_, k) => (k === 0 ? 0 : (k * BLOB_S) / HOPS - 0.06));

export interface PlannedDrop {
	liters: number;
	/** Seconds into the bounce it starts bulging out (out) or floating in (in). */
	start: number;
	/**
	 * The way it leaves or arrives from, in the viewer's frame (not the spinning blob's): azimuth
	 * from screen right toward the camera, and elevation, radians.
	 */
	azimuth: number;
	elevation: number;
}

export interface GooTransfer {
	kind: "out" | "in";
	drops: PlannedDrop[];
}

/** Deterministic jitter in [0, 1). */
function jitter(seed: number, i: number): number {
	const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
	return x - Math.floor(x);
}

/**
 * The drops that take the blob from `from` liters to `to`. They alternate screen right and left,
 * leaning a little toward the camera, with jitter from `seed` so each change looks its own.
 */
export function planGooTransfer(from: number, to: number, seed: number): GooTransfer {
	const kind = to < from ? "out" : "in";
	const sizes = splitLiters(to - from, MAX_DROP_L);
	const n = sizes.length;
	// Incoming drops are staggered so the last one has sunk in before the bounce ends.
	const lead = 0.08;
	const stagger = n > 1 ? Math.min(0.22, (BLOB_S - FLOAT_S - MERGE_S - 0.15 - lead) / (n - 1)) : 0;
	const drops = sizes.map((liters, k) => {
		const left = k % 2 === 1;
		const azimuth = (left ? Math.PI - 0.2 : 0.2) + (jitter(seed, k) - 0.5) * 0.9;
		const elevation = (kind === "out" ? 0.5 : 0.35) + jitter(seed, k + 50) * 0.35;
		const start = kind === "out" ? LANDINGS[k % LANDINGS.length] : lead + k * stagger;
		return { liters, start, azimuth, elevation };
	});
	return { kind, drops };
}
