/**
 * The Noise Problem's tare scale as a viewer subject. It plays the seeded experiment day by day:
 * each day's 60 visitors drop into the bowl and the needle and band move to that day's measured
 * lift and 95% interval. A tap (or the readout's TARE button) switches the reading between raw and
 * CUPED-adjusted and latches the scale's button; the readout's Replay starts the days over. The
 * scale sways around a three-quarter view instead of spinning, so the dial stays readable; dragging
 * still turns it all the way round.
 *
 * The host carries the experiment config as JSON in data-config, optionally data-cycle (seconds
 * between automatic tare toggles while idle, for tiles) and data-tared ("1" to start tared, set by
 * the readout when it flipped the static fallback). It reports "tarescale:state" and listens for
 * "tarescale:tare" and "tarescale:replay".
 */
import { Group, Vector3 } from "three";
import { simulateCupedVisitors } from "../../../lib/stats-sim/cuped-cloud";
import type { CupedExperimentConfig } from "../../../lib/stats-sim/cuped-experiment";
import { buildScaleReadings } from "../../../lib/stats-sim/cuped-readings";
import { DEFAULT_TARE_SCALE_COLORS, buildTareScale } from "../../../lib/three/tare-scale-model";
import type { SubjectFactory } from "../viewer";
import { loadFaceFonts, paintButtonLabel, paintDialFace } from "./tare-scale-face";

export interface ScaleState {
	/** The day on the dial, 1 to the last day. */
	day: number;
	tared: boolean;
	playing: boolean;
}

/** Seconds per simulated day, and a beat on day 1 before the days start rolling. */
const DAY_S = 0.55;
const LEAD_S = 0.6;
/** Seconds to swing between raw and tared. */
const TARE_S = 0.6;
/** How fast the needle and band follow the day's reading (1/s); no overshoot. */
const FOLLOW = 9;
const BASE_YAW = -0.32;
const SWAY = 0.22;
const SWAY_PERIOD = 17;
const CYCLE_HOLDOFF = 8;

const smooth = (p: number) => p * p * (3 - 2 * p);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const createTareScale: SubjectFactory = async ({ host, reducedMotion, requestRender }) => {
	const config = JSON.parse(host.dataset.config ?? "null") as CupedExperimentConfig | null;
	if (!config) throw new Error("No experiment config for the tare scale");
	const cycle = Number(host.dataset.cycle) || 0;
	const readings = buildScaleReadings(config);
	const arms = simulateCupedVisitors(config).map((v) => v.arm);
	const colors = DEFAULT_TARE_SCALE_COLORS;
	await loadFaceFonts();
	const faceMap = paintDialFace(readings, colors);
	const buttonMap = paintButtonLabel(colors);
	const model = buildTareScale(readings, arms, { faceMap, buttonMap, viewDir: new Vector3(0, 0.3, 1) });
	const lastDay = readings.days.length;

	const root = new Group();
	const spin = new Group();
	const sway = new Group();
	sway.rotation.y = BASE_YAW;
	sway.add(model.group);
	spin.add(sway);
	root.add(spin, model.shadow);

	let tared = host.dataset.tared === "1" ? 1 : 0;
	let mix = tared; // 0 raw .. 1 tared, eased
	let clock = reducedMotion ? Infinity : -LEAD_S; // seconds into the playback
	let swayT = 0;
	let idle = 0;
	const shown = { lift: 0, low: 0, high: 0 };
	let lastSent = "";

	const dayAt = () => Math.min(lastDay, Math.max(1, Math.floor(clock / DAY_S) + 1));
	const playing = () => clock < (lastDay - 1) * DAY_S + DAY_S;
	const target = (day: number, m: number) => {
		const d = readings.days[day - 1];
		return { lift: lerp(d.raw.lift, d.cuped.lift, m), low: lerp(d.raw.low, d.cuped.low, m), high: lerp(d.raw.high, d.cuped.high, m) };
	};
	const emit = () => {
		const state: ScaleState = { day: dayAt(), tared: tared === 1, playing: playing() };
		const key = JSON.stringify(state);
		if (key === lastSent) return;
		lastSent = key;
		host.dispatchEvent(new CustomEvent<ScaleState>("tarescale:state", { detail: state }));
	};
	const draw = (snap: boolean, dt: number) => {
		const day = dayAt();
		const t = target(day, smooth(mix));
		const k = snap ? 1 : 1 - Math.exp(-FOLLOW * dt);
		shown.lift += (t.lift - shown.lift) * k;
		shown.low += (t.low - shown.low) * k;
		shown.high += (t.high - shown.high) * k;
		model.setReading(shown.lift, shown.low, shown.high, smooth(mix));
		// Visitors trickle in across each day, so the bowl holds exactly day x 60 at each day's end.
		const perDay = 2 * config.visitors_per_day;
		const into = Math.min(1, Math.max(0, (clock - (day - 1) * DAY_S) / DAY_S));
		model.setVisitors(playing() ? perDay * (day - 1 + into) : perDay * lastDay);
		model.setPressed(smooth(mix));
	};
	draw(true, 0);
	emit();

	const settling = () => Math.abs(mix - tared) > 1e-4 || Math.abs(target(dayAt(), smooth(mix)).lift - shown.lift) > 1e-3;

	const toggle = (byUser: boolean) => {
		tared = tared ? 0 : 1;
		if (byUser) idle = -CYCLE_HOLDOFF;
		if (reducedMotion) {
			mix = tared;
			draw(true, 0);
		}
		emit();
		requestRender();
	};
	const replay = () => {
		if (reducedMotion) return;
		clock = -LEAD_S;
		idle = -CYCLE_HOLDOFF;
		emit();
		requestRender();
	};
	const onTare = () => toggle(true);
	host.addEventListener("tarescale:tare", onTare);
	host.addEventListener("tarescale:replay", replay);

	return {
		root,
		spin,
		autoSpeed: 0,
		framing: model.framing,
		update({ dt, hovering }) {
			if (!reducedMotion) {
				if (!hovering) swayT += dt;
				sway.rotation.y = BASE_YAW + SWAY * Math.sin((2 * Math.PI * swayT) / SWAY_PERIOD);
				if (playing()) clock += dt;
				const step = dt / TARE_S;
				mix = tared > mix ? Math.min(tared, mix + step) : Math.max(tared, mix - step);
				if (cycle > 0 && !playing() && !settling()) {
					idle += dt;
					if (idle >= cycle) {
						idle = 0;
						toggle(false);
					}
				}
			}
			draw(false, dt);
			emit();
		},
		busy: () => playing() || settling(),
		onTap: () => toggle(true),
		dispose() {
			host.removeEventListener("tarescale:tare", onTare);
			host.removeEventListener("tarescale:replay", replay);
			faceMap.dispose();
			buttonMap.dispose();
			model.dispose();
		},
	};
};

export default createTareScale;
