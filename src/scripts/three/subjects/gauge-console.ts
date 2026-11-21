/**
 * The Dashboard Problem's gauge console as a viewer subject. Every needle is one metric's z
 * statistic from a seeded run of the page's own simulation; the red zones are the chosen rule's
 * redline; a lamp lights when its needle is in the red (lime: the metric truly moved; blinking
 * tomato: it was truly null, a false discovery).
 *
 * Tap runs the next seed. The host element hears "gauges:select" ({ index?, mode? }) from the
 * readout and reports what it shows with "gauges:state" ({ index, seed, mode }). Needles swing on
 * a damped spring and the redline glides, like the real thing; under reduced motion both snap.
 * The console sways a little and turns back to face you after a drag.
 */
import { buildGaugeConsole, consoleFraming } from "../../../lib/three/gauge-console-model";
import { CORRECTIONS, HERO_SEEDS, inRed, runGaugeDashboard, type Correction } from "../../../lib/stats-sim/dashboard-runs";
import type { SubjectFactory } from "../viewer";

export interface GaugeState {
	index: number;
	seed: number;
	mode: Correction;
}

export interface GaugeSelect {
	index?: number;
	mode?: Correction;
}

const NEEDLE_K = 42; // needle spring stiffness
const NEEDLE_C = 7.5; // and damping: a small overshoot, like a real movement
const STAGGER = 0.028; // seconds between neighbouring needles starting a swing
const LINE_RATE = 9; // redline glide, critically damped, per second
const SWAY = 0.2; // radians
const SWAY_PERIOD = 11; // seconds
const RETURN_DELAY = 1.4; // seconds after a drag before the console turns back to face you
const BLINK_HZ = 1.6;

const createGaugeConsole: SubjectFactory = ({ THREE, host, reducedMotion, requestRender }) => {
	const runs = HERO_SEEDS.map((seed) => runGaugeDashboard(seed));
	const model = buildGaugeConsole(runs[0].metrics.length);
	const rig = new THREE.Group();
	rig.add(model.group);

	let index = 0;
	let mode: Correction = CORRECTIONS.includes(host.dataset.mode as Correction) ? (host.dataset.mode as Correction) : "none";
	const n = model.gauges.length;
	const value = new Float64Array(n); // needles rest at zero until the first run swings them up
	const velocity = new Float64Array(n);
	const delay = new Float64Array(n);
	let line = runs[0].redline[mode].z;
	let lineV = 0;
	let clock = 0;

	const target = (i: number) => runs[index].metrics[i].z;
	const lineTarget = () => runs[index].redline[mode].z;

	const emit = () => {
		const detail: GaugeState = { index, seed: runs[index].seed, mode };
		host.dispatchEvent(new CustomEvent("gauges:state", { detail }));
	};

	const swing = () => {
		for (let i = 0; i < n; i++) delay[i] = i * STAGGER;
		if (reducedMotion) {
			for (let i = 0; i < n; i++) {
				value[i] = target(i);
				velocity[i] = 0;
				delay[i] = 0;
			}
			line = lineTarget();
			lineV = 0;
		}
	};

	const select = ({ index: next, mode: nextMode }: GaugeSelect) => {
		let changed = false;
		if (next !== undefined && next !== index) {
			index = ((next % runs.length) + runs.length) % runs.length;
			changed = true;
			swing();
		}
		if (nextMode && nextMode !== mode && CORRECTIONS.includes(nextMode)) {
			mode = nextMode;
			changed = true;
			if (reducedMotion) line = lineTarget();
		}
		if (changed) {
			emit();
			requestRender();
		}
	};
	const onSelect = (e: Event) => select((e as CustomEvent<GaugeSelect>).detail ?? {});
	host.addEventListener("gauges:select", onSelect);

	// The viewer spins model.group on drag; track the pointer so the console waits before turning back.
	let dragging = false;
	let releasedAt = -Infinity;
	const down = () => {
		dragging = true;
	};
	const up = () => {
		if (!dragging) return;
		dragging = false;
		releasedAt = performance.now() / 1000;
	};
	host.addEventListener("pointerdown", down);
	host.addEventListener("pointerup", up);
	host.addEventListener("pointercancel", up);

	const facing = () => Math.round(model.group.rotation.y / (2 * Math.PI)) * 2 * Math.PI;

	const draw = (t: number) => {
		const r = runs[index];
		const redline = r.redline[mode];
		model.setRedline(line);
		const blink = reducedMotion ? 1 : Math.sin(t * 2 * Math.PI * BLINK_HZ) > -0.2 ? 1 : 0.3;
		for (let i = 0; i < n; i++) {
			model.setNeedle(i, value[i]);
			const m = r.metrics[i];
			const lit = inRed(value[i], { z: line, inclusive: redline.inclusive });
			model.setLamp(i, lit ? (m.is_null ? "null" : "lift") : "off", lit && m.is_null ? blink : 1);
		}
	};

	swing();
	draw(0);
	queueMicrotask(emit);

	const needlesMoving = () => {
		for (let i = 0; i < n; i++) if (Math.abs(value[i] - target(i)) > 1e-3 || Math.abs(velocity[i]) > 1e-3) return true;
		return false;
	};
	const turning = () => !dragging && Math.abs(model.group.rotation.y - facing()) > 1e-3;

	const { target: center, turnRadius, halfHeight } = consoleFraming();

	return {
		root: rig,
		spin: model.group,
		autoSpeed: 0,
		framing: {
			target: new THREE.Vector3(...center),
			turnRadius,
			halfHeight,
			viewDir: new THREE.Vector3(0.38, 0.42, 1),
		},
		update({ t, dt }) {
			clock += dt;
			if (!reducedMotion) rig.rotation.y = SWAY * Math.sin((clock * 2 * Math.PI) / SWAY_PERIOD);

			// Needles: damped springs toward each metric's z, started one after another.
			for (let i = 0; i < n; i++) {
				if (delay[i] > 0) {
					delay[i] -= dt;
					continue;
				}
				velocity[i] += (NEEDLE_K * (target(i) - value[i]) - NEEDLE_C * velocity[i]) * dt;
				value[i] += velocity[i] * dt;
			}
			// Redline: a critically damped glide to the rule's threshold.
			const goal = lineTarget();
			lineV += (LINE_RATE * LINE_RATE * (goal - line) - 2 * LINE_RATE * lineV) * dt;
			line += lineV * dt;
			if (Math.abs(goal - line) < 1e-4 && Math.abs(lineV) < 1e-3) {
				line = goal;
				lineV = 0;
			}

			// After a drag, turn back to face the viewer.
			if (!dragging && t - releasedAt > RETURN_DELAY) {
				const want = facing();
				model.group.rotation.y += (want - model.group.rotation.y) * Math.min(1, dt * 1.8);
			}
			draw(t);
		},
		busy: () => needlesMoving() || line !== lineTarget() || turning(),
		onTap() {
			select({ index: index + 1 });
		},
		dispose() {
			host.removeEventListener("gauges:select", onSelect);
			host.removeEventListener("pointerdown", down);
			host.removeEventListener("pointerup", up);
			host.removeEventListener("pointercancel", up);
			model.dispose();
		},
	};
};

export default createGaugeConsole;
