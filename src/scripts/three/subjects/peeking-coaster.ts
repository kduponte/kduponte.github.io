/**
 * The Peeking Problem's p-value coaster as a viewer subject. A toy 22RE pickup rides one null
 * run's daily p-values, stopping at each daily peek (its headlights blink when it looks). Where
 * the track dips through the glass at alpha, the glass flashes; the first dip leaves a mark,
 * because that's where a daily peeker would have stopped and shipped a winner that isn't there.
 * "All runs" mode lays all 20 runs down at once as concentric ribbons, run 1 innermost, so the
 * marks on the glass count the runs that a daily peek would have fooled.
 *
 * The host carries the runs as JSON in data-config. The subject reports what it shows with a
 * "peekcoaster:state" event and listens for "peekcoaster:next" and "peekcoaster:mode" (detail
 * "one" or "all"). A tap runs the next seed (one run) or replays the 20 (all runs). Under
 * reduced motion the truck parks at the run's first dip (or its last day) and nothing animates.
 */
import { CanvasTexture, Group, LinearFilter, Matrix4, SRGBColorSpace, Sprite, SpriteMaterial, Vector3, type Mesh } from "three";
import {
	COASTER_COLORS,
	MANY_RUN_PROFILE,
	MANY_RUN_QUIET_PROFILE,
	ONE_RUN_PROFILE,
	buildCoasterStage,
	buildRunRibbon,
	coasterFraming,
	coasterLayout,
	dayAngle,
	manyRadius,
	type CoasterRibbon,
	type FloorFlash,
} from "../../../lib/three/peeking-coaster";
import { buildToyotaTruck } from "../../../lib/three/toyota-truck-model";
import type { SubjectFactory } from "../viewer";

export type CoasterMode = "one" | "all";

export interface CoasterViewerConfig {
	alpha: number;
	days: number;
	runs: { seed: number; p: number[] }[];
	/** Runs that had dipped under alpha by each day, day 1 first. */
	crossedByDay: number[];
	mode?: CoasterMode;
}

export interface CoasterState {
	mode: CoasterMode;
	/** 0-based run on the track (one mode). */
	run: number;
	/** The latest daily peek on screen, 1-based. */
	day: number;
	/** That peek's p-value (one mode). */
	p: number;
	/** Runs under alpha at some peek so far (all mode). */
	crossed: number;
	/** The last day has been reached. */
	done: boolean;
}

/** Seconds stopped at each daily peek, and between peeks. */
const DWELL = 0.36;
const TRAVEL = 0.3;
const END_HOLD = 2.8;
/** Seconds per day while all 20 runs are laid down. */
const ALL_DAY = 0.2;
const FLASH_S = 0.9;
const FLASH_GROW = 0.5;
const AUTO_SPEED = 0.16;
/** The toy truck's length on the track, scene units (the real one is 4.82 m). */
const TRUCK_LEN = 0.56;
const TRUCK_MODEL_LEN = 4.82;
const TRUCK_MODEL_MID_X = -0.23;
const WHEEL_R = 0.33;
const LABEL_H = 0.13;

const smoothstep = (v: number) => {
	const c = Math.max(0, Math.min(1, v));
	return c * c * (3 - 2 * c);
};

/** A text label that always faces the camera. */
function labelSprite(text: string, color: string): Sprite {
	const px = 64;
	const font = `${px}px Silkscreen, ui-monospace, monospace`;
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d")!;
	ctx.font = font;
	const w = Math.ceil(ctx.measureText(text).width) + 16;
	canvas.width = w;
	canvas.height = px + 16;
	ctx.font = font;
	ctx.fillStyle = color;
	ctx.textBaseline = "middle";
	ctx.fillText(text, 8, canvas.height / 2 + 2);
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.minFilter = LinearFilter;
	const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
	sprite.scale.set((LABEL_H * w) / canvas.height, LABEL_H, 1);
	sprite.renderOrder = 3;
	return sprite;
}

const createPeekingCoaster: SubjectFactory = async ({ THREE, host, reducedMotion, requestRender }) => {
	const config = JSON.parse(host.dataset.config ?? "{}") as CoasterViewerConfig;
	const layout = coasterLayout(config.days, config.alpha);
	const last = config.days - 1;

	const root = new Group();
	const spin = new Group();
	root.add(spin);
	const stage = buildCoasterStage(layout);
	spin.add(stage.group);

	// Axis and day labels, in the site's pixel mono once it has loaded (or a fallback after a beat).
	const sprites: Sprite[] = [];
	await Promise.race([document.fonts?.load("64px Silkscreen").catch(() => undefined), new Promise((r) => setTimeout(r, 1200))]);
	for (const l of stage.labels) {
		const s = labelSprite(l.text, l.accent ? COASTER_COLORS.under : COASTER_COLORS.ink);
		s.position.copy(l.position);
		spin.add(s);
		sprites.push(s);
	}
	// Day labels sit just above the ends of the one-run track.
	const dayLabels = [labelSprite("day 1", COASTER_COLORS.ink), labelSprite(`day ${config.days}`, COASTER_COLORS.ink)];
	dayLabels.forEach((s) => {
		spin.add(s);
		sprites.push(s);
	});
	const endFrame = { position: new Vector3(), tangent: new Vector3(), normal: new Vector3(), binormal: new Vector3() };
	const placeDayLabels = (r: CoasterRibbon) => {
		[0, last].forEach((u, i) => {
			r.track.frame(u, endFrame);
			dayLabels[i].position.copy(endFrame.position).addScaledVector(endFrame.normal, 0.14);
		});
	};

	// The toy pickup: the 22RE model at a toy's scale, its ground shadow dropped (it rides a rail).
	const truck = buildToyotaTruck();
	for (const c of truck.group.children) {
		const m = c as Mesh;
		if (m.isMesh && m.geometry.type === "CircleGeometry") m.visible = false;
	}
	const scale = TRUCK_LEN / TRUCK_MODEL_LEN;
	truck.group.scale.setScalar(scale);
	truck.group.position.x = -TRUCK_MODEL_MID_X * scale;
	const rig = new Group();
	rig.add(truck.group);
	spin.add(rig);

	let mode: CoasterMode = config.mode === "all" ? "all" : "one";
	let run = 0;
	let one: CoasterRibbon | null = null;
	let many: CoasterRibbon[] | null = null;
	let clock = 0;
	let prevU = -1;
	let lastKey = "";
	let peekFlash = 0;
	let tailFlash = 0;
	const live: { flash: FloorFlash; age: number }[] = [];
	const basis = new Matrix4();
	const frame = { position: new Vector3(), tangent: new Vector3(), normal: new Vector3(), binormal: new Vector3() };
	const prevPos = new Vector3();

	const firstDipU = (r: CoasterRibbon) => r.flashes[0]?.crossing.u ?? null;
	/** Where the truck parks under reduced motion: its first dip's peek, or the last day. */
	const parkU = (r: CoasterRibbon) => {
		const f = r.flashes[0];
		return f ? f.crossing.day - 1 : last;
	};

	const flashesOf = () => (mode === "one" ? (one ? [one] : []) : (many ?? [])).flatMap((r) => r.flashes);
	const resetFlashes = () => {
		live.length = 0;
		for (const f of flashesOf()) {
			f.ring.visible = false;
			if (f.mark) f.mark.visible = reducedMotion;
		}
	};

	const showOne = () => {
		if (!one) {
			one = buildRunRibbon(config.runs[run].p, layout, { radius: layout.radius, profile: ONE_RUN_PROFILE, posts: true });
			spin.add(one.group);
		}
		one.group.visible = true;
		one.reveal(last);
		placeDayLabels(one);
		dayLabels.forEach((l) => (l.visible = true));
		rig.visible = true;
		many?.forEach((r) => (r.group.visible = false));
	};
	const showAll = () => {
		if (!many) {
			many = config.runs.map((r, i) =>
				buildRunRibbon(r.p, layout, {
					radius: manyRadius(i, config.runs.length, layout),
					profile: r.p.some((v) => v < config.alpha) ? MANY_RUN_PROFILE : MANY_RUN_QUIET_PROFILE,
					posts: false,
				}),
			);
			many.forEach((r) => spin.add(r.group));
		}
		many.forEach((r) => {
			r.group.visible = true;
			r.reveal(reducedMotion ? last : 0);
		});
		// No day labels here: at these radii they land on the axis labels from some angles.
		dayLabels.forEach((l) => (l.visible = false));
		if (one) one.group.visible = false;
		rig.visible = false;
	};

	const emit = (state: CoasterState) => {
		const key = `${state.mode}:${state.run}:${state.day}:${state.done}`;
		if (key === lastKey) return;
		lastKey = key;
		host.dispatchEvent(new CustomEvent<CoasterState>("peekcoaster:state", { detail: state }));
	};

	/** Track parameter of the truck (one mode) or of the laying-down front (all mode) at `clock`. */
	const uAt = (t: number) => {
		if (mode === "all") return Math.min(t / ALL_DAY, last);
		const step = DWELL + TRAVEL;
		const k = Math.floor(t / step);
		if (k >= last) return last;
		return k + smoothstep((t - k * step - DWELL) / TRAVEL);
	};
	const cycle = () => (mode === "all" ? Infinity : last * (DWELL + TRAVEL) + DWELL + END_HOLD);

	const placeTruck = (u: number) => {
		if (!one) return;
		one.track.frame(u, frame);
		basis.makeBasis(frame.tangent, frame.normal, frame.binormal);
		rig.quaternion.setFromRotationMatrix(basis);
		rig.position.copy(frame.position).addScaledVector(frame.normal, one.ride);
	};

	const restart = () => {
		clock = 0;
		prevU = -1;
		lastKey = "";
		resetFlashes();
		const u = reducedMotion ? (mode === "one" && one ? parkU(one) : last) : 0;
		if (mode === "one") {
			placeTruck(u);
			prevPos.copy(rig.position);
		}
		apply(u);
	};

	/** Report the frame's data to the readout. */
	const apply = (u: number) => {
		const day = Math.floor(u + 1e-6) + 1;
		if (mode === "one") {
			emit({ mode, run, day, p: config.runs[run].p[day - 1], crossed: 0, done: day === config.days });
		} else {
			many?.forEach((r) => r.reveal(u));
			emit({ mode, run, day, p: NaN, crossed: config.crossedByDay[day - 1], done: day === config.days });
		}
	};

	const setMode = (m: CoasterMode) => {
		if (m === mode && (m === "all" ? many : one)) return restart();
		mode = m;
		if (mode === "one") showOne();
		else showAll();
		restart();
		requestRender();
	};
	const nextRun = () => {
		run = (run + 1) % config.runs.length;
		if (one) {
			spin.remove(one.group);
			one.dispose();
			one = null;
		}
		mode = "one";
		showOne();
		restart();
		requestRender();
	};

	if (mode === "one") showOne();
	else showAll();

	// Turn the ring so run 1's first dip (or its park spot) faces the camera when the truck gets there.
	const viewDir = new THREE.Vector3(5.2, 3.9, 5.9).normalize();
	if (mode === "one" && one) {
		const target = reducedMotion ? parkU(one) : (firstDipU(one) ?? last);
		const camAngle = Math.atan2(-viewDir.z, viewDir.x);
		const arrive = reducedMotion ? 0 : Math.ceil(target) * (DWELL + TRAVEL);
		spin.rotation.y = camAngle - dayAngle(target, layout) - AUTO_SPEED * arrive;
	}
	restart();

	const onNext = () => nextRun();
	const onMode = (e: Event) => setMode((e as CustomEvent<CoasterMode>).detail);
	host.addEventListener("peekcoaster:next", onNext);
	host.addEventListener("peekcoaster:mode", onMode);

	const framing = coasterFraming(layout, Math.asin(viewDir.y));

	return {
		root,
		spin,
		autoSpeed: AUTO_SPEED,
		framing: { target: new THREE.Vector3(0, framing.targetY, 0), turnRadius: framing.turnRadius, halfHeight: framing.halfHeight, viewDir },
		update({ dt }) {
			if (!reducedMotion) {
				clock += dt;
				if (clock > cycle()) restart();
				const u = uAt(clock);

				// Flashes where the truck (or the laying-down front) passes through the glass.
				for (const f of flashesOf()) {
					if (f.crossing.u > prevU && f.crossing.u <= u) {
						live.push({ flash: f, age: 0 });
						f.ring.visible = true;
						if (f.mark) {
							f.mark.visible = true;
							if (mode === "one") tailFlash = 1;
						}
					}
				}
				if (mode === "one") {
					if (Math.floor(u + 1e-6) > Math.floor(prevU + 1e-6)) peekFlash = 1;
					placeTruck(u);
					const ds = prevPos.distanceTo(rig.position);
					prevPos.copy(rig.position);
					for (const w of truck.wheels) w.rotation.z -= ds / (WHEEL_R * scale);
				}
				prevU = u;
				apply(u);
			}

			for (let i = live.length - 1; i >= 0; i--) {
				const l = live[i];
				l.age += dt;
				const k = l.age / FLASH_S;
				if (k >= 1) {
					l.flash.ring.visible = false;
					live.splice(i, 1);
					continue;
				}
				l.flash.ring.scale.setScalar(l.flash.radius + FLASH_GROW * Math.sqrt(k));
				l.flash.ring.material.opacity = 1 - k;
			}
			peekFlash *= Math.exp(-7 * dt);
			tailFlash *= Math.exp(-2.5 * dt);
			truck.lights.head.emissiveIntensity = peekFlash * 2.4;
			truck.lights.tail.emissiveIntensity = tailFlash * 2;
		},
		busy: () => live.length > 0 || peekFlash > 0.01 || tailFlash > 0.01,
		onTap() {
			if (mode === "one") nextRun();
			else setMode("all");
		},
		dispose() {
			host.removeEventListener("peekcoaster:next", onNext);
			host.removeEventListener("peekcoaster:mode", onMode);
			stage.dispose();
			one?.dispose();
			many?.forEach((r) => r.dispose());
			truck.dispose();
			for (const s of sprites) {
				s.material.map?.dispose();
				s.material.dispose();
			}
		},
	};
};

export default createPeekingCoaster;
