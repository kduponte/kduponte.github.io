// The Peeking Problem's hero: a p-value roller coaster. One simulated null experiment's daily
// p-value is a ribbon track wound around a ring (angle = day, height = p on a log scale), over a
// glass floor at alpha. Wherever the track dips through the glass, a daily peek would have
// called a winner that isn't there. A second mode winds 20 runs as 20 concentric ribbons.
//
// Pure builders (no renderer, no DOM), unit tested in Node like the truck. Scene units: the
// ring is about 4.4 across and the axis 1.6 tall.
import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	RingGeometry,
	TorusGeometry,
	Vector3,
} from "three";
import { OUTLINE, createPartKit, outlineGeometry, slab, type PartKit } from "./kit";

export interface CoasterColors {
	ink: string;
	/** The track above the glass: the page's p-value series color. */
	track: string;
	/** The track, posts and flashes under the glass, where p < alpha. */
	under: string;
	plinth: string;
	glass: string;
}

export const COASTER_COLORS: CoasterColors = {
	ink: "#111111",
	track: "#2438ff",
	under: "#ff5a1f",
	plinth: "#f6f1e4",
	glass: "#e4f5ff",
};

export interface CoasterLayout {
	days: number;
	alpha: number;
	/** The log axis runs from p = 1 at `height` down to `pMin` at the plinth (y = 0). */
	pMin: number;
	height: number;
	/** Ring radius of the one-run track. */
	radius: number;
	/** Innermost and outermost ring radii when many runs are shown. */
	manyRadii: [number, number];
	/** Angle of day 1 and the sweep to the last day, radians (the rest of the circle is the gap the axis stands in). */
	arcStart: number;
	arcSpan: number;
	floorRadius: number;
}

const GAP = (52 * Math.PI) / 180;

export function coasterLayout(days: number, alpha: number): CoasterLayout {
	return {
		days,
		alpha,
		pMin: 0.001,
		height: 1.6,
		radius: 1.5,
		manyRadii: [0.62, 1.96],
		arcStart: GAP / 2,
		arcSpan: Math.PI * 2 - GAP,
		floorRadius: 2.18,
	};
}

/** Height of a p-value on the log axis. Values under pMin pin to the plinth. */
export function pToY(p: number, layout: CoasterLayout): number {
	const lo = Math.log10(layout.pMin);
	const v = Math.log10(Math.max(p, layout.pMin));
	return (layout.height * (v - lo)) / -lo;
}

/** Ring angle at track parameter u (0 = day 1, days - 1 = the last day). */
export function dayAngle(u: number, layout: CoasterLayout): number {
	return layout.arcStart + (u / (layout.days - 1)) * layout.arcSpan;
}

/** A point on the ring at angle `theta`, radius `r` and height `y`. */
export function ringPoint(theta: number, r: number, y: number, out = new Vector3()): Vector3 {
	return out.set(r * Math.cos(theta), y, -r * Math.sin(theta));
}

/**
 * Fritsch-Carlson slopes for a monotone cubic through evenly spaced values: the curve passes
 * through every daily value and never overshoots its neighbours, so between two peeks above the
 * glass the track never dips under it. There's no data between peeks; this only joins them.
 */
export function monotoneSlopes(ys: number[]): number[] {
	const n = ys.length;
	if (n < 2) return ys.map(() => 0);
	const d = ys.slice(1).map((y, i) => y - ys[i]);
	const m = ys.map((_, i) => {
		if (i === 0) return d[0];
		if (i === n - 1) return d[n - 2];
		return d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
	});
	for (let i = 0; i < n - 1; i++) {
		if (d[i] === 0) {
			m[i] = 0;
			m[i + 1] = 0;
			continue;
		}
		const a = m[i] / d[i];
		const b = m[i + 1] / d[i];
		const s = a * a + b * b;
		if (s > 9) {
			const t = 3 / Math.sqrt(s);
			m[i] = t * a * d[i];
			m[i + 1] = t * b * d[i];
		}
	}
	return m;
}

/** The monotone cubic at u, and its slope dy/du. */
export function hermite(ys: number[], ms: number[], u: number): { y: number; dy: number } {
	const n = ys.length;
	const k = Math.min(Math.max(Math.floor(u), 0), n - 2);
	const t = Math.min(Math.max(u - k, 0), 1);
	const t2 = t * t;
	const t3 = t2 * t;
	const y = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * ms[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * ms[k + 1];
	const dy = (6 * t2 - 6 * t) * ys[k] + (3 * t2 - 4 * t + 1) * ms[k] + (-6 * t2 + 6 * t) * ys[k + 1] + (3 * t2 - 2 * t) * ms[k + 1];
	return { y, dy };
}

export interface Crossing {
	/** Track parameter where the ribbon's centerline meets the glass. */
	u: number;
	/** The peek that first sees the new side: the day p went under alpha (or back over it). */
	day: number;
	kind: "down" | "up";
}

/**
 * Where the track passes through the glass. A run that starts under alpha "crosses" at day 1.
 * A p exactly at alpha is not under it, matching the study's strict p < alpha.
 */
export function floorCrossings(p: number[], layout: CoasterLayout): Crossing[] {
	const ys = p.map((v) => pToY(v, layout));
	const ms = monotoneSlopes(ys);
	const under = p.map((v) => v < layout.alpha);
	const yF = pToY(layout.alpha, layout);
	const out: Crossing[] = [];
	if (under[0]) out.push({ u: 0, day: 1, kind: "down" });
	for (let k = 0; k < p.length - 1; k++) {
		if (under[k] === under[k + 1]) continue;
		// Monotone within the segment, so bisection finds the one crossing.
		let lo = k;
		let hi = k + 1;
		const goingDown = !under[k];
		for (let it = 0; it < 40; it++) {
			const mid = (lo + hi) / 2;
			const below = hermite(ys, ms, mid).y < yF;
			if (below === goingDown) hi = mid;
			else lo = mid;
		}
		out.push({ u: (lo + hi) / 2, day: k + 2, kind: goingDown ? "down" : "up" });
	}
	return out;
}

export interface RibbonProfile {
	width: number;
	thickness: number;
	corner: number;
	/** Segments per rounded corner. */
	cornerSteps: number;
	/** Track samples per day. */
	samplesPerDay: number;
	outline: number;
}

export const ONE_RUN_PROFILE: RibbonProfile = { width: 0.2, thickness: 0.04, corner: 0.014, cornerSteps: 2, samplesPerDay: 14, outline: 0.024 };
/** Many runs: a run that ever dips under alpha gets the black outline; the rest are thin and plain. */
export const MANY_RUN_PROFILE: RibbonProfile = { width: 0.05, thickness: 0.016, corner: 0.006, cornerSteps: 1, samplesPerDay: 10, outline: 0.009 };
export const MANY_RUN_QUIET_PROFILE: RibbonProfile = { width: 0.028, thickness: 0.012, corner: 0.005, cornerSteps: 1, samplesPerDay: 10, outline: 0 };

/** A rounded rectangle, counter-clockwise in (across, up), with outward normals. */
function profileLoop(prof: RibbonProfile): { b: number; n: number; nb: number; nn: number }[] {
	const r = Math.min(prof.corner, prof.width / 2 - 1e-4, prof.thickness / 2 - 1e-4);
	const cx = prof.width / 2 - r;
	const cy = prof.thickness / 2 - r;
	const corners: [number, number, number][] = [
		[cx, cy, 0],
		[-cx, cy, Math.PI / 2],
		[-cx, -cy, Math.PI],
		[cx, -cy, (3 * Math.PI) / 2],
	];
	const pts: { b: number; n: number; nb: number; nn: number }[] = [];
	for (const [x, y, a0] of corners) {
		for (let s = 0; s <= prof.cornerSteps; s++) {
			const a = a0 + (s / prof.cornerSteps) * (Math.PI / 2);
			pts.push({ b: x + r * Math.cos(a), n: y + r * Math.sin(a), nb: Math.cos(a), nn: Math.sin(a) });
		}
	}
	return pts;
}

/** The moving frame of a track: centerline point, direction of travel, ribbon-up, and outward across the ring. */
export interface TrackFrame {
	position: Vector3;
	tangent: Vector3;
	normal: Vector3;
	binormal: Vector3;
}

export interface RunTrack {
	radius: number;
	/** Heights of the daily peeks. */
	ys: number[];
	crossings: Crossing[];
	frame(u: number, out?: TrackFrame): TrackFrame;
}

export function runTrack(p: number[], layout: CoasterLayout, radius: number): RunTrack {
	const ys = p.map((v) => pToY(v, layout));
	const ms = monotoneSlopes(ys);
	const dTheta = layout.arcSpan / (layout.days - 1);
	return {
		radius,
		ys,
		crossings: floorCrossings(p, layout),
		frame(u, out) {
			const f = out ?? { position: new Vector3(), tangent: new Vector3(), normal: new Vector3(), binormal: new Vector3() };
			const theta = dayAngle(u, layout);
			const { y, dy } = hermite(ys, ms, u);
			const c = Math.cos(theta);
			const s = Math.sin(theta);
			ringPoint(theta, radius, y, f.position);
			f.binormal.set(c, 0, -s);
			f.tangent.set(-s * radius * dTheta, dy, -c * radius * dTheta).normalize();
			f.normal.crossVectors(f.binormal, f.tangent).normalize();
			return f;
		},
	};
}

export interface SweptRibbon {
	geometry: BufferGeometry;
	/** Index count that draws the ribbon from day 1 up to track parameter u. */
	countAt(u: number): number;
}

/**
 * Sweep the profile along a run's track. Colors switch exactly where the centerline meets the
 * glass (a doubled ring there, one of each color). Index order runs day 1 to the last day, start
 * cap first and end cap last, so a draw range reveals the ribbon as if it were being laid down.
 */
export function sweepRibbon(track: RunTrack, layout: CoasterLayout, prof: RibbonProfile, colors: { over: Color; under: Color }): SweptRibbon {
	const last = layout.days - 1;
	const us: number[] = [];
	const steps = last * prof.samplesPerDay;
	for (let i = 0; i <= steps; i++) us.push((i / steps) * last);
	const cuts = track.crossings.filter((c) => c.u > 0 && c.u < last).map((c) => c.u);
	const yF = pToY(layout.alpha, layout);

	// Rings: [u, isUnder]. A crossing adds two rings at the same u, one per side.
	const rings: [number, boolean][] = [];
	let ci = 0;
	const sorted = [...cuts].sort((a, b) => a - b);
	const frame = track.frame(0);
	const underAt = (u: number) => track.frame(u, frame).position.y < yF;
	for (const u of us) {
		while (ci < sorted.length && sorted[ci] < u) {
			const cu = sorted[ci++];
			const before = underAt(cu - 1e-6);
			rings.push([cu, before], [cu, !before]);
		}
		rings.push([u, underAt(u)]);
	}

	const loop = profileLoop(prof);
	const M = loop.length;
	const capVerts = 2 * (M + 1);
	const vCount = rings.length * M + capVerts;
	const pos = new Float32Array(vCount * 3);
	const nor = new Float32Array(vCount * 3);
	const col = new Float32Array(vCount * 3);
	const v = new Vector3();
	const nrm = new Vector3();
	const put = (i: number, p: Vector3, n: Vector3, c: Color) => {
		pos.set([p.x, p.y, p.z], i * 3);
		nor.set([n.x, n.y, n.z], i * 3);
		col.set([c.r, c.g, c.b], i * 3);
	};

	rings.forEach(([u, under], ri) => {
		const f = track.frame(u, frame);
		const c = under ? colors.under : colors.over;
		loop.forEach((q, j) => {
			v.copy(f.position).addScaledVector(f.binormal, q.b).addScaledVector(f.normal, q.n);
			nrm.copy(f.binormal).multiplyScalar(q.nb).addScaledVector(f.normal, q.nn).normalize();
			put(ri * M + j, v, nrm, c);
		});
	});

	// Caps: a center vertex plus a copy of the end ring, facing along the track.
	const capBase = rings.length * M;
	const capAt = (ring: number, base: number, sign: number) => {
		const [u, under] = rings[ring];
		const f = track.frame(u, frame);
		const c = under ? colors.under : colors.over;
		nrm.copy(f.tangent).multiplyScalar(sign);
		put(base, f.position, nrm, c);
		loop.forEach((q, j) => {
			v.copy(f.position).addScaledVector(f.binormal, q.b).addScaledVector(f.normal, q.n);
			put(base + 1 + j, v, nrm, c);
		});
	};
	capAt(0, capBase, -1);
	capAt(rings.length - 1, capBase + M + 1, 1);

	const index: number[] = [];
	for (let j = 0; j < M; j++) index.push(capBase, capBase + 1 + j, capBase + 1 + ((j + 1) % M));
	const startCap = index.length;
	for (let r = 0; r < rings.length - 1; r++) {
		for (let j = 0; j < M; j++) {
			const a = r * M + j;
			const b = (r + 1) * M + j;
			const c = (r + 1) * M + ((j + 1) % M);
			const d = r * M + ((j + 1) % M);
			index.push(a, b, c, a, c, d);
		}
	}
	const sides = index.length;
	const endBase = capBase + M + 1;
	for (let j = 0; j < M; j++) index.push(endBase, endBase + 1 + ((j + 1) % M), endBase + 1 + j);

	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(pos, 3));
	geometry.setAttribute("normal", new BufferAttribute(nor, 3));
	geometry.setAttribute("color", new BufferAttribute(col, 3));
	geometry.setIndex(index);

	const ringUs = rings.map((r) => r[0]);
	const perGap = 6 * M;
	return {
		geometry,
		countAt(u) {
			if (u >= last) return index.length;
			// Gaps whose far ring is at or before u.
			let k = 0;
			while (k + 1 < ringUs.length && ringUs[k + 1] <= u) k++;
			return startCap + k * perGap;
		},
	};
}

/** A flash on the glass where a track crossed it, and (for a run's first crossing) the mark it leaves. */
export interface FloorFlash {
	crossing: Crossing;
	/** Position on the glass's top face. */
	at: Vector3;
	/** The expanding ring; animate its scale (from `radius`) and opacity. */
	ring: Mesh<RingGeometry, MeshBasicMaterial>;
	radius: number;
	/** The lasting mark at a run's first crossing (the false positive a daily peek would have shipped), else null. */
	mark: Mesh<CircleGeometry, MeshBasicMaterial> | null;
}

export interface CoasterRibbon {
	group: Group;
	track: RunTrack;
	/** Half the ribbon's thickness: how far above the centerline a rider sits. */
	ride: number;
	flashes: FloorFlash[];
	/** Show the ribbon from day 1 up to u (and the posts of the days it has reached). */
	reveal(u: number): void;
	dispose(): void;
}

const FLOOR_THICK = 0.014;
const FLASH_LIFT = FLOOR_THICK / 2 + 0.004;
/** The first-dip mark on the glass: wider than the ribbon, so it shows around the track. */
export function markRadius(profile: RibbonProfile): number {
	return Math.max(0.085, profile.width * 1.25);
}

/**
 * One run's ribbon, with its floor flashes. With `posts`, a post stands under every daily peek,
 * as tall as that day's p (the under-alpha ones in the under color).
 */
export function buildRunRibbon(
	p: number[],
	layout: CoasterLayout,
	opts: { radius: number; profile: RibbonProfile; posts: boolean; colors?: CoasterColors },
): CoasterRibbon {
	const colors = opts.colors ?? COASTER_COLORS;
	const kit = createPartKit(colors.ink);
	const group = new Group();
	const track = runTrack(p, layout, opts.radius);
	const swept = sweepRibbon(track, layout, opts.profile, { over: new Color(colors.track), under: new Color(colors.under) });
	const geo = kit.geometry(swept.geometry);
	const mat = kit.std("#ffffff", 0.42, 0.08);
	mat.vertexColors = true;
	const mesh = new Mesh(geo, mat);
	group.add(mesh);
	// The shell ignores the color seam, so it closes over the doubled crossing rings.
	let shellGeo: BufferGeometry | null = null;
	if (opts.profile.outline > 0) {
		const src = geo.clone();
		src.deleteAttribute("color");
		shellGeo = kit.geometry(outlineGeometry(src, opts.profile.outline));
		src.dispose();
		group.add(new Mesh(shellGeo, kit.material(new MeshBasicMaterial({ color: colors.ink, side: BackSide }))));
	}

	const posts: Mesh[] = [];
	if (opts.posts) {
		const postGeo = kit.geometry(new CylinderGeometry(0.011, 0.011, 1, 8));
		postGeo.translate(0, 0.5, 0);
		const overMat = kit.std(colors.ink, 0.6);
		const underMat = kit.std(colors.under, 0.5);
		const f = track.frame(0);
		p.forEach((v, i) => {
			track.frame(i, f);
			const h = Math.max(f.position.y - opts.profile.thickness / 2, 1e-3);
			const post = new Mesh(postGeo, v < layout.alpha ? underMat : overMat);
			post.position.set(f.position.x, 0, f.position.z);
			post.scale.y = h;
			group.add(post);
			posts.push(post);
		});
	}

	const yF = pToY(layout.alpha, layout);
	const ringGeo = kit.geometry(new RingGeometry(0.72, 1, 48));
	ringGeo.rotateX(-Math.PI / 2);
	const markGeo = kit.geometry(new CircleGeometry(1, 40));
	markGeo.rotateX(-Math.PI / 2);
	const edgeGeo = kit.geometry(new RingGeometry(1, 1.3, 40));
	edgeGeo.rotateX(-Math.PI / 2);
	const edgeMat = kit.material(new MeshBasicMaterial({ color: colors.ink, side: DoubleSide }));
	const f = track.frame(0);
	const markR = markRadius(opts.profile);
	let firstDown = true;
	const flashes: FloorFlash[] = track.crossings
		.filter((c) => c.kind === "down")
		.map((crossing) => {
			track.frame(crossing.u, f);
			const at = new Vector3(f.position.x, yF + FLASH_LIFT, f.position.z);
			const flashMat = (opacity: number) =>
				kit.material(new MeshBasicMaterial({ color: colors.under, transparent: true, opacity, depthWrite: false, side: DoubleSide }));
			const ring = new Mesh(ringGeo, flashMat(0));
			ring.position.copy(at);
			ring.scale.setScalar(markR);
			ring.visible = false;
			ring.renderOrder = 2; // over the glass (renderOrder 1)
			group.add(ring);
			let mark: FloorFlash["mark"] = null;
			if (firstDown) {
				mark = new Mesh(markGeo, flashMat(0.92));
				mark.position.copy(at);
				mark.scale.setScalar(markR);
				mark.visible = false;
				mark.renderOrder = 2;
				// A black edge, so the mark reads against the tomato rim and the under-glass track.
				const edge = new Mesh(edgeGeo, edgeMat);
				edge.renderOrder = 2;
				mark.add(edge);
				group.add(mark);
				firstDown = false;
			}
			return { crossing, at, ring, radius: markR, mark };
		});

	return {
		group,
		track,
		ride: opts.profile.thickness / 2,
		flashes,
		reveal(u) {
			const n = swept.countAt(u);
			geo.setDrawRange(0, n);
			shellGeo?.setDrawRange(0, n);
			posts.forEach((post, i) => (post.visible = i <= u + 1e-6));
		},
		dispose: kit.dispose,
	};
}

/** Ring radius of run `i` of `count` when many are shown: run 1 innermost. */
export function manyRadius(i: number, count: number, layout: CoasterLayout): number {
	const [r0, r1] = layout.manyRadii;
	return count <= 1 ? r0 : r0 + ((r1 - r0) * i) / (count - 1);
}

export interface AxisLabel {
	text: string;
	position: Vector3;
	/** Floor label in the under color, others in ink. */
	accent?: boolean;
}

export interface CoasterStage {
	group: Group;
	floorY: number;
	labels: AxisLabel[];
	/** Every outlined or visible part, for bounds checks. */
	parts: Mesh[];
	dispose(): void;
}

/** p-values with ticks on the axis post: decades long, 2s and 5s short. */
export const AXIS_TICKS = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
const AXIS_LABELS = [1, 0.1, 0.05, 0.01, 0.001];

/**
 * The fixed set: a plinth at the axis bottom with a tick for every day, the glass floor at alpha
 * with a black rim, and a p-value axis standing in the ring's gap.
 */
export function buildCoasterStage(layout: CoasterLayout, colors: CoasterColors = COASTER_COLORS): CoasterStage {
	const kit: PartKit = createPartKit(colors.ink);
	const group = new Group();
	const inkMat = kit.std(colors.ink, 0.6);
	const underMat = kit.std(colors.under, 0.5);
	const R = layout.floorRadius;

	// Plinth: its top face is y = 0, the axis's pMin.
	const PLINTH = 0.08;
	kit.add(group, new CylinderGeometry(R, R, PLINTH, 128), kit.std(colors.plinth, 0.8), [0, -PLINTH / 2, 0], { outline: OUTLINE * 0.8 });

	// A tick on the plinth for every day, long ones at day 1, 10, 20 and 30.
	for (let d = 1; d <= layout.days; d++) {
		const theta = dayAngle(d - 1, layout);
		const major = d === 1 || d % 10 === 0;
		const len = major ? 0.2 : 0.1;
		const tick = kit.add(group, slab(len, 0.012, 0.022, 0.004, 0.003), inkMat, [0, 0.006, 0], { outline: 0 });
		ringPoint(theta, R - 0.05 - len / 2, 0.006, tick.position);
		tick.rotation.y = theta;
	}

	// Glass at alpha. No outline shell (its back faces would show through); a black rim instead.
	const floorY = pToY(layout.alpha, layout);
	const glass = new Mesh(
		kit.geometry(new CylinderGeometry(R, R, FLOOR_THICK, 128)),
		kit.material(
			new MeshStandardMaterial({ color: colors.glass, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.34, depthWrite: false }),
		),
	);
	glass.position.y = floorY;
	glass.renderOrder = 1;
	group.add(glass);
	const rimGeo = new TorusGeometry(R, 0.022, 8, 160);
	rimGeo.rotateX(Math.PI / 2);
	kit.add(group, rimGeo, underMat, [0, floorY, 0], { outline: 0.012 });

	// Axis post in the gap: from the plinth to p = 1, ticked at 1-2-5 steps.
	const gapTheta = layout.arcStart - GAP / 2;
	const axisR = layout.radius;
	const base = ringPoint(gapTheta, axisR, 0);
	kit.add(group, new CylinderGeometry(0.022, 0.022, layout.height, 12), inkMat, [base.x, layout.height / 2, base.z], { outline: 0 });
	const labels: AxisLabel[] = [];
	const out = new Vector3(Math.cos(gapTheta), 0, -Math.sin(gapTheta));
	for (const t of AXIS_TICKS) {
		const y = pToY(t, layout);
		const decade = Number.isInteger(Math.log10(t));
		const isAlpha = Math.abs(t - layout.alpha) < 1e-12;
		const w = isAlpha ? 0.2 : decade ? 0.15 : 0.09;
		kit.add(group, new CylinderGeometry(w / 2, w / 2, isAlpha ? 0.03 : 0.018, 20), isAlpha ? underMat : inkMat, [base.x, y, base.z], {
			outline: isAlpha ? 0.012 : 0,
		});
		if (AXIS_LABELS.includes(t)) {
			labels.push({
				text: String(t),
				// Lifted clear of the plinth at the bottom of the axis.
				position: base.clone().addScaledVector(out, 0.3).setY(Math.max(y, 0.08)),
				accent: isAlpha,
			});
		}
	}
	return { group, floorY, labels, parts: kit.parts, dispose: kit.dispose };
}

/** Framing for the viewer: the ring's turning radius, and its height as seen from `elevation`. */
export function coasterFraming(layout: CoasterLayout, elevation: number) {
	const top = layout.height + 0.15;
	const bottom = -0.08;
	const half = (top - bottom) / 2;
	return {
		// Below the middle: the plinth's near rim projects lower than the axis top rises.
		targetY: (top + bottom) / 2 - 0.3,
		turnRadius: layout.floorRadius + 0.05,
		halfHeight: half * Math.cos(elevation) + (layout.floorRadius + 0.05) * Math.sin(elevation),
	};
}
