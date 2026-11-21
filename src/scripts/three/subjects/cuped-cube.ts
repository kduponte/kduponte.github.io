/**
 * The Noise Problem's glass cube as a viewer subject: 1,200 simulated visitors from a seeded run
 * of the page's live experiment. A tap (or the readout's button) plays the CUPED adjustment, the
 * tilted cloud folding into a flat slab, and taps again to undo it. The cube sways a little around
 * a three-quarter view instead of spinning, so the pre/post scatter stays readable; dragging still
 * turns it all the way round.
 *
 * The host carries the experiment config as JSON in data-config, and optionally data-cycle
 * (seconds between automatic toggles while idle, for tiles; 0 or absent is off), and data-adjusted
 * ("1" to start adjusted, set by the readout when it flipped the static fallback). The subject
 * reports progress with a "cupedcube:state" event and listens for "cupedcube:toggle".
 */
import { Group } from "three";
import { buildCupedCloud, varianceAt } from "../../../lib/stats-sim/cuped-cloud";
import type { CupedExperimentConfig } from "../../../lib/stats-sim/cuped-experiment";
import { buildCupedCube } from "../../../lib/three/cuped-cube-model";
import type { SubjectFactory } from "../viewer";

export interface CubeState {
	/** Adjustment progress, 0 raw to 1 CUPED. */
	t: number;
	/** Where it's heading: true once the adjustment is applied (or being applied). */
	adjusted: boolean;
	/** Sample variance of the post-period values as drawn right now. */
	variance: number;
}

/** Seconds for the full fold. */
const FOLD_S = 1.5;
/** Resting heading and sway, radians; sway period, seconds. */
const BASE_YAW = -0.42;
const SWAY = 0.24;
const SWAY_PERIOD = 17;
/** After a tap, how long auto-cycling waits before it resumes, seconds. */
const CYCLE_HOLDOFF = 8;

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

const createCupedCube: SubjectFactory = ({ host, reducedMotion, requestRender }) => {
	const config = JSON.parse(host.dataset.config ?? "null") as CupedExperimentConfig | null;
	if (!config) throw new Error("No experiment config for the CUPED cube");
	const cycle = Number(host.dataset.cycle) || 0;
	const cloud = buildCupedCloud(config);
	const model = buildCupedCube(cloud);

	const root = new Group();
	const spin = new Group();
	const sway = new Group();
	sway.rotation.y = BASE_YAW;
	sway.add(model.group);
	spin.add(sway);
	root.add(spin, model.shadow);

	// Start where the static fallback was left: the readout's button may have flipped it to the
	// adjusted drawing before WebGL mounted.
	let target = host.dataset.adjusted === "1" ? 1 : 0;
	let progress = target; // 0..1 along the fold, eased into t
	model.setCollapse(target);
	let swayT = 0;
	let idle = 0;
	let lastSent = "";

	const emit = () => {
		const t = model.collapse;
		const key = `${target}:${t.toFixed(4)}`;
		if (key === lastSent) return;
		lastSent = key;
		host.dispatchEvent(new CustomEvent<CubeState>("cupedcube:state", { detail: { t, adjusted: target === 1, variance: varianceAt(cloud, t) } }));
	};

	const toggle = (byUser: boolean) => {
		target = target === 1 ? 0 : 1;
		if (byUser) idle = -CYCLE_HOLDOFF;
		if (reducedMotion) {
			progress = target;
			model.setCollapse(target);
		}
		emit();
		requestRender();
	};
	const onToggle = () => toggle(true);
	host.addEventListener("cupedcube:toggle", onToggle);
	emit();

	return {
		root,
		spin,
		autoSpeed: 0,
		framing: model.framing,
		update({ dt, hovering }) {
			if (!reducedMotion) {
				// Hold the sway while the pointer is over the cube, so it can be read.
				if (!hovering) swayT += dt;
				sway.rotation.y = BASE_YAW + SWAY * Math.sin((2 * Math.PI * swayT) / SWAY_PERIOD);
			}
			if (progress !== target) {
				const step = dt / FOLD_S;
				progress = target > progress ? Math.min(target, progress + step) : Math.max(target, progress - step);
				model.setCollapse(ease(progress));
				emit();
			} else if (cycle > 0 && !reducedMotion) {
				idle += dt;
				if (idle >= cycle) {
					idle = 0;
					toggle(false);
				}
			}
		},
		busy: () => progress !== target,
		onTap: () => toggle(true),
		dispose() {
			host.removeEventListener("cupedcube:toggle", onToggle);
			model.dispose();
		},
	};
};

export default createCupedCube;
