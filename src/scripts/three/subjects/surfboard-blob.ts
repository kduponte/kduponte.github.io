/**
 * The Volume Gap's Play-Doh blob as a viewer subject. It bounces, then shape-shifts into each
 * iconic board in turn, holds it, and melts back, forever. While it bounces it gets to exactly the
 * liters of the board it's about to become by squeezing out drops (next board smaller) or soaking
 * up drops that float in (bigger), each drop a sphere of the liters it carries (see goo-drops).
 * Every board is built in meters from its real dimensions, so sizes and liters are to scale. The
 * wobble, squash, lean, overshoot and where the drops fly are animation.
 *
 * The host element carries the boards as JSON in data-config. The subject reports what it is
 * showing with a "surfblob:state" event on the host and listens for "surfblob:next" (the
 * readout's Next button). A tap skips ahead. Under reduced motion it shows each board still.
 */
import {
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	CircleGeometry,
	Color,
	DynamicDrawUsage,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	BackSide,
	Matrix4,
	Quaternion,
	SphereGeometry,
	Vector3,
	type Material,
} from "three";
import { createPartKit } from "../../../lib/three/kit";
import type { FinSetup, FinSpec, LabelSpec, LogoSpec } from "../../../lib/surf-volume/iconic-boards";
import { boardTexture, buildFin, finMaterial } from "./surfboard-parts";
import {
	INCH,
	VERTEX_COUNT,
	blendPositions,
	bounds,
	calibrateBoard,
	createTopology,
	dropRadius,
	scaleToLiters,
	writeBlobPositions,
	type BlobBulge,
	writeGridNormals,
	writeShellPositions,
	type BoardShape,
	type CalibratedBoard,
} from "../../../lib/three/surfboard-morph";
import { loadLabelFonts, loadLogos, type BoardColors } from "./surfboard-graphics";
import { BLOB_S, BUD_S, FLOAT_S, HOPS, MERGE_S, planGooTransfer, type PlannedDrop } from "../../../lib/three/goo-drops";
import type { SubjectFactory } from "../viewer";

export interface BlobBoardConfig {
	id: string;
	name: string;
	liters: number;
	finish?: "gloss" | "matte";
	shape: BoardShape;
	fins: FinSpec[];
	finSetup: FinSetup;
	graphic: string;
	colors: BoardColors;
	labels?: LabelSpec[];
}

export interface BlobViewerConfig {
	boards: BlobBoardConfig[];
	/** Makers' logo files the labels can use, keyed by name. */
	logos?: Record<string, LogoSpec>;
	blobColor: string;
	ink: string;
}

export type BlobPhase = "blob" | "morph" | "hold" | "melt";

export interface BlobState {
	phase: BlobPhase;
	/** The board being shown, or that the blob is becoming. */
	index: number;
	/** Liters the blob or board holds right now. */
	liters: number;
	/** While it's a blob: the liters of the board it just was. */
	from: number;
}

/** Seconds per phase. */
const DUR: Record<BlobPhase, number> = { blob: BLOB_S, morph: 1.25, hold: 3.4, melt: 0.95 };
const HOP_HEIGHT = [0.34, 0.26, 0.17];
const HOP_X = [0, 0.3, -0.24, 0];
/** How far boards float above the floor, meters (clears a 9" longboard fin). */
const HOVER = 0.3;
/** Outline shell thickness, meters: the truck's 0.05 scaled to these smaller subjects. */
const SHELL = 0.022;
const LAND_SQUASH = 0.42;
/** Stretch mid-hop, and the jiggle that rings after each landing. */
const HOP_STRETCH = 0.22;
const LAND_JIGGLE = 0.1;
const LAND_WOBBLE = 0.2;
const IDLE_WOBBLE = 0.15;
/** Shear per (meter per second) of hop speed: the top trails the bottom. */
const HOP_LEAN = 0.35;
/** How far the foot oozes out on the floor, at rest and when it lands. */
const SPREAD_REST = 0.05;
const SPREAD_LAND = 0.2;
/** Melting: the sausage of goo starts this fraction of the board's length, this lumpy. */
const MELT_LENGTH = 0.66;
const MELT_LUMPS = 0.24;
/** How far a pseudopod reaches (fraction of the radius) to push a drop out or pull one in. */
const REACH_OUT = 0.55;
const REACH_IN = 0.45;
/** Drops: launch speed (m/s), gravity, the bounce they keep, and where they're out of view. */
const DROP_SPEED = 2.4;
const GRAVITY = 9.8;
const DROP_BOUNCE = 0.45;
const DROP_SLIDE = 1.7;
const DROP_EXIT = 2.8;
const DROP_LIFE = 4.5;
/** Where incoming drops start, meters out along their direction (well outside the frame). */
const DROP_FAR = 2.6;
const DROP_POOL = 8;
/** Flubber-ish goo: slick, glossy, see-through in the middle and denser at grazing angles. */
const GOO_ROUGH = 0.12;
const GOO_CORE_ALPHA = 0.56;
const BOARD_ROUGH = 0.3;
const BOARD_CLEARCOAT = 0.45;
const MATTE_ROUGH = 0.9;

/** Auto-spin, radians per second (handed to the viewer). */
const AUTO_SPEED = 0.38;
/**
 * Heading at which a board reads best: nose to the right, turned a little toward the camera, so
 * its labels are upright. The blob turns (invisibly, it's round) so each board passes through
 * this heading halfway through its hold.
 */
const PRESENT_YAW = -0.3;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Angle wrapped to (-pi, pi]. */
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (v: number) => {
	const c = clamp01(v);
	return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Damped spring from 0 to 1 with a little overshoot (about 9% at zeta 0.6). */
function spring(t: number, omega: number, zeta = 0.6): number {
	if (t <= 0) return 0;
	const wd = omega * Math.sqrt(1 - zeta * zeta);
	return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

/**
 * Squash on landing (< 1), stretch mid-air (> 1), and a jiggle ringing out after take-off, from
 * the phase of a hop and its length in seconds.
 */
function hopSquash(p: number, hopLen: number): number {
	const d = Math.min(p, 1 - p);
	const since = p * hopLen;
	return (
		1 -
		LAND_SQUASH * Math.exp(-((d / 0.07) ** 2)) +
		HOP_STRETCH * smooth((d - 0.04) / 0.14) * (1 - smooth((d - 0.3) / 0.2)) +
		LAND_JIGGLE * Math.exp(-since / 0.16) * Math.sin(since * 28)
	);
}

const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
const Y_AXIS = new Vector3(0, 1, 0);

const createSurfboardBlob: SubjectFactory = async ({ host, reducedMotion, requestRender }) => {
	const config = JSON.parse(host.dataset.config ?? "{}") as BlobViewerConfig;
	if (!config.boards?.length) throw new Error("No boards configured for the blob viewer");
	const topo = createTopology();
	const kit = createPartKit(config.ink);

	const spin = new Group();
	spin.rotation.y = -0.55;
	const root = new Group();
	root.add(spin);
	// Everything that morphs lives in `yaw`, so the shape can be turned within the spin.
	const yaw = new Group();
	spin.add(yaw);
	if (reducedMotion) yaw.rotation.y = PRESENT_YAW - spin.rotation.y;

	// One morphing mesh plus its inverted-hull outline, both rewritten whenever the shape moves.
	const pos = new Float32Array(VERTEX_COUNT * 3);
	const nor = new Float32Array(VERTEX_COUNT * 3);
	const shellPos = new Float32Array(VERTEX_COUNT * 3);
	const blobBuf = new Float32Array(VERTEX_COUNT * 3);
	const sagBuf = new Float32Array(VERTEX_COUNT * 3);
	const index = new BufferAttribute(topo.index, 1);
	const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
	const norAttr = new BufferAttribute(nor, 3).setUsage(DynamicDrawUsage);
	const shellAttr = new BufferAttribute(shellPos, 3).setUsage(DynamicDrawUsage);
	const geo = kit.geometry(new BufferGeometry());
	geo.setAttribute("position", posAttr);
	geo.setAttribute("normal", norAttr);
	geo.setAttribute("uv", new BufferAttribute(topo.uv, 2));
	geo.setIndex(index);
	const shellGeo = kit.geometry(new BufferGeometry());
	shellGeo.setAttribute("position", shellAttr);
	shellGeo.setIndex(index);

	// One skin that turns from translucent goo into the board's opaque painted resin as `mix` goes
	// 0 -> 1. The goo is see-through in the middle and denser where the surface turns away (the way
	// a thick jelly looks), glossy under a clearcoat, with a faint inner glow.
	const mix = { value: 0 };
	const blobColor = { value: new Color(config.blobColor) };
	const gooMaterial = (mixUniform: { value: number }, cacheKey: string) => {
		const m = kit.material(
			new MeshPhysicalMaterial({ color: "#ffffff", roughness: GOO_ROUGH, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true }),
		);
		m.onBeforeCompile = (shader) => {
			shader.uniforms.uMix = mixUniform;
			shader.uniforms.uBlob = blobColor;
		shader.fragmentShader = `uniform float uMix;\nuniform vec3 uBlob;\n${shader.fragmentShader
			.replace(
				"#include <map_fragment>",
				`#ifdef USE_MAP
	diffuseColor.rgb = mix( uBlob, texture2D( map, vMapUv ).rgb, uMix );
#else
	diffuseColor.rgb = uBlob;
#endif`,
			)
			.replace(
				"#include <emissivemap_fragment>",
				`#include <emissivemap_fragment>
	float gooRim = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 2.0 );
	diffuseColor.a = mix( mix( ${GOO_CORE_ALPHA.toFixed(2)}, 0.97, gooRim ), 1.0, uMix );
	totalEmissiveRadiance += uBlob * ( 0.14 + 0.32 * gooRim ) * ( 1.0 - uMix );`,
			)}`;
		};
		m.customProgramCacheKey = () => cacheKey;
		return m;
	};
	const skin = gooMaterial(mix, "surfboard-blob-goo");
	// The goo's far wall, seen through the near one: a deeper green that gives it thickness.
	const innerMat = kit.material(
		new MeshBasicMaterial({ color: new Color(config.blobColor).multiplyScalar(0.42), side: BackSide, transparent: true, opacity: 0.55 }),
	);
	// The outline is drawn after the (transparent) body, so it only shows outside the silhouette
	// instead of darkening the goo from behind.
	const shellMat = kit.material(new MeshBasicMaterial({ color: config.ink, side: BackSide, transparent: true }));
	const inner = new Mesh(geo, innerMat);
	const body = new Mesh(geo, skin);
	const shell = new Mesh(shellGeo, shellMat);
	inner.renderOrder = 0;
	body.renderOrder = 1;
	shell.renderOrder = 2;
	inner.frustumCulled = body.frustumCulled = shell.frustumCulled = false;
	yaw.add(inner, body, shell);

	// Hard flat ground shadow, sized to whatever shape is on screen.
	const shadowGeo = kit.geometry(new CircleGeometry(1, 48));
	shadowGeo.rotateX(-Math.PI / 2);
	const shadowMat = kit.material(new MeshBasicMaterial({ color: config.ink, transparent: true, opacity: 0.25, depthWrite: false }));
	const shadow = new Mesh(shadowGeo, shadowMat);
	shadow.renderOrder = -1;
	shadow.position.y = 0.002;
	yaw.add(shadow);

	// Drops of goo the blob squeezes out or soaks up: spheres in the viewer's frame (`root`, so
	// their flight doesn't spin), drawn after the blob so where one overlaps it the two read as one.
	const dropGeo = kit.geometry(new SphereGeometry(1, 32, 20));
	const dropSkin = gooMaterial({ value: 0 }, "surfboard-blob-drop");
	const dropInnerMat = kit.material(
		new MeshBasicMaterial({ color: new Color(config.blobColor).multiplyScalar(0.42), side: BackSide, transparent: true, opacity: 0.55 }),
	);
	interface DropMesh {
		group: Group;
		shell: Mesh;
		shadow: Mesh;
		shadowMat: MeshBasicMaterial;
	}
	const dropMeshes: DropMesh[] = Array.from({ length: DROP_POOL }, () => {
		const group = new Group();
		group.matrixAutoUpdate = false;
		group.visible = false;
		const parts: [Material, number][] = [
			[dropInnerMat, 1.05],
			[dropSkin, 1.1],
		];
		for (const [m, order] of parts) {
			const mesh = new Mesh(dropGeo, m);
			mesh.renderOrder = order;
			mesh.frustumCulled = false;
			group.add(mesh);
		}
		const shell = new Mesh(dropGeo, shellMat);
		shell.renderOrder = 2.1;
		shell.frustumCulled = false;
		group.add(shell);
		const shadowMat = kit.material(new MeshBasicMaterial({ color: config.ink, transparent: true, opacity: 0.25, depthWrite: false }));
		const dropShadow = new Mesh(shadowGeo, shadowMat);
		dropShadow.renderOrder = -1;
		dropShadow.visible = false;
		root.add(group, dropShadow);
		return { group, shell, shadow: dropShadow, shadowMat };
	});

	interface BoardRuntime {
		config: BlobBoardConfig;
		roughness: number;
		clearcoat: number;
		cal: CalibratedBoard;
		/** Calibrated positions lifted to the hover height. */
		pos: Float32Array;
		/** Half-length of the resting blob at this board's liters, meters (what the melt shrinks to). */
		blobHalf: number;
		texture: CanvasTexture;
		fins: Group[];
	}
	const [, logos] = await Promise.all([loadLabelFonts(), loadLogos(config.logos)]);
	const boards: BoardRuntime[] = config.boards.map((b) => {
		const cal = calibrateBoard(b.shape, b.liters);
		const lifted = cal.positions.slice();
		for (let k = 1; k < lifted.length; k += 3) lifted[k] += HOVER;
		const texture = boardTexture(cal, b, logos);
		const finMat = finMaterial(kit, b.finSetup, typeof b.colors.fin === "string" ? b.colors.fin : config.ink);
		const fins = b.fins.map((fin) => {
			const pivot = buildFin(kit, cal, fin, b.finSetup, finMat, HOVER);
			pivot.scale.setScalar(0);
			pivot.visible = false;
			yaw.add(pivot);
			return pivot;
		});
		const matte = b.finish === "matte";
		const [minX, , , maxX] = bounds(writeBlobPositions(blobBuf, { liters: b.liters }));
		return {
			config: b,
			cal,
			pos: lifted,
			blobHalf: (maxX - minX) / 2,
			texture,
			fins,
			roughness: matte ? MATTE_ROUGH : BOARD_ROUGH,
			clearcoat: matte ? 0 : BOARD_CLEARCOAT,
		};
	});
	const maxHalfLength = Math.max(...boards.map((b) => b.cal.prepared.halfL * INCH));
	// The viewer renders once before the first update, which compiles the shader: give it a map
	// now so the USE_MAP variant is the one compiled (swapping maps later needs no recompile).
	skin.map = boards[0].texture;

	let phase: BlobPhase = reducedMotion ? "hold" : "blob";
	let phaseT = 0;
	let idx = 0;
	let fromLiters = boards[0].config.liters;
	let dirty = true;
	let lastEmitted = "";

	const emit = (liters: number) => {
		const key = `${phase}:${idx}:${liters.toFixed(1)}`;
		if (key === lastEmitted) return;
		lastEmitted = key;
		host.dispatchEvent(new CustomEvent<BlobState>("surfblob:state", { detail: { phase, index: idx, liters, from: fromLiters } }));
	};

	const setFins = (board: BoardRuntime, scale: number) => {
		for (const b of boards) {
			for (const f of b.fins) {
				const show = b === board && scale > 1e-3;
				f.visible = show;
				if (show) f.scale.setScalar(scale);
			}
		}
	};

	// --- Drops ---------------------------------------------------------------------------------
	interface Drop {
		plan: PlannedDrop;
		kind: "out" | "in";
		/** The way it leaves or arrives from, viewer frame. */
		dir: Vector3;
		/** Full radius, meters: a sphere of the drop's liters. */
		radius: number;
		mesh: DropMesh;
		state: "bud" | "fly" | "float" | "merge" | "done";
		/** Center and velocity, viewer frame. */
		pos: Vector3;
		vel: Vector3;
		/** Seconds since it pinched off, and since it last hit the floor (and how hard, 0-1). */
		age: number;
		sinceImpact: number;
		impact: number;
		/** Incoming drops start out here, outside the frame. */
		start: Vector3;
		seed: number;
	}
	/** This bounce's drops, in plan order. */
	let transfer: Drop[] = [];
	/** Every drop with a mesh, including ones from earlier bounces still flying off. */
	const live: Drop[] = [];
	const tips = new Float32Array(3 * DROP_POOL);
	const tmpV = new Vector3();
	const tmpC = new Vector3();
	const tmpQ = new Quaternion();
	const tmpS = new Vector3();
	const tmpM = new Matrix4();
	const squashM = new Matrix4();
	const ZERO = new Vector3();

	const release = (d: Drop) => {
		d.state = "done";
		d.mesh.group.visible = false;
		d.mesh.shadow.visible = false;
		const i = live.indexOf(d);
		if (i >= 0) live.splice(i, 1);
	};
	const takeMesh = (): DropMesh => {
		const used = new Set(live.map((d) => d.mesh));
		const free = dropMeshes.find((m) => !used.has(m));
		if (free) return free;
		const oldest = live.find((d) => d.state === "fly") ?? live[0];
		release(oldest);
		return oldest.mesh;
	};

	/** Plan the drops that take the blob from the last board's liters to the next one's. */
	const startTransfer = () => {
		transfer = [];
		const { kind, drops } = planGooTransfer(fromLiters, boards[idx].config.liters, idx + 1);
		for (const [k, plan] of drops.entries()) {
			const ce = Math.cos(plan.elevation);
			const dir = new Vector3(ce * Math.cos(plan.azimuth), Math.sin(plan.elevation), ce * Math.sin(plan.azimuth));
			const d: Drop = {
				plan,
				kind,
				dir,
				radius: dropRadius(plan.liters),
				mesh: takeMesh(),
				state: kind === "out" ? "bud" : "float",
				pos: new Vector3(),
				vel: new Vector3(),
				age: 0,
				sinceImpact: 1,
				impact: 0,
				start: dir.clone().multiplyScalar(DROP_FAR).add(new Vector3(0, 0.4, 0)),
				seed: k * 1.7 + idx,
			};
			live.push(d);
			transfer.push(d);
		}
	};
	const launch = (d: Drop) => {
		d.state = "fly";
		d.age = 0;
		d.vel.copy(d.dir).multiplyScalar(DROP_SPEED);
	};
	/**
	 * Leaving the bounce early (a skip): drops already budding squeeze out at once; the rest, and
	 * any still floating in, are dropped (the board forms at its liters regardless).
	 */
	const finishTransfer = () => {
		for (const d of transfer) {
			if (d.state === "bud" && phaseT > d.plan.start) launch(d);
			else if (d.state !== "fly" && d.state !== "done") release(d);
		}
		transfer = [];
	};

	/**
	 * Draw a drop: a sphere of radius `r` stretched by `stretch` along `axis` (volume kept), then
	 * squashed by `squash` in world height, kept from sinking through the floor.
	 */
	const placeDrop = (d: Drop, center: Vector3, r: number, axis: Vector3, stretch: number, squash: number) => {
		const { group, shell, shadow: dropShadow, shadowMat: sm } = d.mesh;
		if (r < 0.004) {
			group.visible = dropShadow.visible = false;
			return;
		}
		tmpQ.setFromUnitVectors(Y_AXIS, axis);
		const side = r / Math.sqrt(stretch);
		tmpS.set(side, r * stretch, side);
		tmpM.compose(ZERO, tmpQ, tmpS);
		const sq = Math.max(0.3, squash);
		squashM.makeScale(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
		tmpM.premultiply(squashM);
		const e = tmpM.elements;
		const halfX = Math.hypot(e[0], e[4], e[8]);
		const halfY = Math.hypot(e[1], e[5], e[9]);
		const halfZ = Math.hypot(e[2], e[6], e[10]);
		tmpC.copy(center);
		if (tmpC.y < halfY) tmpC.y = halfY;
		tmpM.setPosition(tmpC);
		group.matrix.copy(tmpM);
		group.matrixWorldNeedsUpdate = true;
		shell.scale.setScalar(1 + (0.8 * SHELL) / r);
		group.visible = true;
		const lift = clamp01((tmpC.y - halfY) / 0.6);
		dropShadow.position.set(tmpC.x, 0.002, tmpC.z);
		dropShadow.scale.set(halfX * (1 - 0.35 * lift) + 0.005, 1, halfZ * (1 - 0.35 * lift) + 0.005);
		sm.opacity = 0.28 - 0.14 * lift;
		dropShadow.visible = true;
	};

	/** Drops flying off: ballistic, bouncing with a splat, then sliding out of the frame. */
	const stepDrops = (dt: number) => {
		for (const d of [...live]) {
			if (d.state !== "fly") continue;
			d.age += dt;
			d.sinceImpact += dt;
			d.vel.y -= GRAVITY * dt;
			d.pos.addScaledVector(d.vel, dt);
			if (d.pos.y < d.radius) {
				d.pos.y = d.radius;
				if (d.vel.y < -0.8) {
					d.impact = clamp01(-d.vel.y / 3);
					d.sinceImpact = 0;
					d.vel.y *= -DROP_BOUNCE;
					d.vel.x *= 0.85;
					d.vel.z *= 0.85;
				} else d.vel.y = 0;
				const h = Math.hypot(d.vel.x, d.vel.z);
				if (h < DROP_SLIDE) {
					if (h < 1e-3) d.vel.set(d.dir.x, 0, d.dir.z).normalize().multiplyScalar(DROP_SLIDE);
					else {
						d.vel.x *= DROP_SLIDE / h;
						d.vel.z *= DROP_SLIDE / h;
					}
				}
			}
			if (Math.hypot(d.pos.x, d.pos.z) > DROP_EXIT || d.age > DROP_LIFE) {
				release(d);
				continue;
			}
			const speed = d.vel.length();
			const axis = speed > 0.2 ? tmpV.copy(d.vel).divideScalar(speed) : tmpV.copy(Y_AXIS);
			const splat = d.impact * Math.exp(-d.sinceImpact / 0.09) * Math.cos(d.sinceImpact * 30);
			const jiggle = 0.06 * Math.exp(-d.age / 0.5) * Math.sin(d.age * 22 + d.seed);
			placeDrop(d, d.pos, d.radius, axis, 1 + Math.min(0.45, speed * 0.12), 1 - 0.5 * splat + jiggle);
		}
	};

	/**
	 * This bounce's drops against the blob at `phaseT`: the pseudopods they need, and the liters
	 * they've carried out (negative) or in so far.
	 */
	const transferNow = (theta: number, bulges: BlobBulge[], owners: Drop[]) => {
		let moved = 0;
		for (const d of transfer) {
			const local = tmpV.copy(d.dir).applyAxisAngle(Y_AXIS, -theta);
			const dir: [number, number, number] = [local.x, local.y, local.z];
			const since = phaseT - d.plan.start;
			if (d.kind === "out") {
				if (d.state === "bud") {
					const b = clamp01(since / BUD_S);
					moved -= d.plan.liters * smooth(b);
					if (since > 0) {
						bulges.push({ dir, amount: REACH_OUT * smooth(b / 0.6) });
						owners.push(d);
					}
				} else {
					moved -= d.plan.liters;
					// The pseudopod snaps back and rings once the drop is gone.
					if (d.age < 0.3) {
						bulges.push({ dir, amount: REACH_OUT * Math.exp(-d.age / 0.05) * Math.cos(d.age * 40) });
						owners.push(d);
					}
				}
			} else {
				const u = since / FLOAT_S;
				const g = clamp01((since - FLOAT_S) / MERGE_S);
				if (d.state === "done") moved += d.plan.liters;
				else if (u >= 1) {
					d.state = "merge";
					moved += d.plan.liters * smooth(g);
					bulges.push({ dir, amount: REACH_IN * (1 - smooth(g)) });
					owners.push(d);
				} else {
					bulges.push({ dir, amount: REACH_IN * smooth((u - 0.55) / 0.45) });
					owners.push(d);
				}
			}
		}
		return moved;
	};

	/** Put this bounce's attached drops on their pseudopods' tips (viewer frame). */
	const placeTransfer = (theta: number, owners: Drop[], t: number) => {
		for (const [i, d] of owners.entries()) {
			if (d.state === "fly" || d.state === "done") continue;
			const tip = tmpC.set(tips[i * 3], tips[i * 3 + 1], tips[i * 3 + 2]).applyAxisAngle(Y_AXIS, theta);
			const since = phaseT - d.plan.start;
			if (d.state === "bud") {
				const b = clamp01(since / BUD_S);
				const r = d.radius * Math.cbrt(smooth(b));
				d.pos.copy(tip).addScaledVector(d.dir, r * (-0.5 + 1.4 * b));
				placeDrop(d, d.pos, r, d.dir, 1 + 0.3 * b, 1);
				if (b >= 1) launch(d);
				continue;
			}
			const u = since / FLOAT_S;
			if (u < 0) {
				placeDrop(d, d.pos, 0, Y_AXIS, 1, 1);
				continue;
			}
			if (d.state === "float") {
				// Float in on a curve that ends at the pseudopod reaching for it, bobbing as it comes.
				const e = easeOut(u);
				const end = tmpV.copy(tip).addScaledVector(d.dir, d.radius * 0.8);
				const cx = (d.start.x + end.x) / 2;
				const cy = (d.start.y + end.y) / 2 + 0.35;
				const cz = (d.start.z + end.z) / 2;
				const a = (1 - e) * (1 - e);
				const bb = 2 * (1 - e) * e;
				const c = e * e;
				d.pos.set(a * d.start.x + bb * cx + c * end.x, a * d.start.y + bb * cy + c * end.y, a * d.start.z + bb * cz + c * end.z);
				d.pos.y += 0.03 * Math.sin(t * 7 + d.seed) * (1 - e);
				const wob = 0.12 * Math.sin(t * 9 + d.seed) * (1 - 0.6 * e);
				placeDrop(d, d.pos, d.radius, tmpV.copy(d.dir).negate(), 1 + 0.25 * (1 - e), 1 + wob);
				continue;
			}
			// Merging: it sinks into the pseudopod as its liters move into the blob.
			const g = clamp01((since - FLOAT_S) / MERGE_S);
			const left = 1 - smooth(g);
			const r = d.radius * Math.cbrt(left);
			d.pos.copy(tip).addScaledVector(d.dir, r * (0.8 - 1.8 * g));
			placeDrop(d, d.pos, r, d.dir, 1 + 0.2 * g, 1);
			if (g >= 1) release(d);
		}
	};

	const advance = () => {
		if (phase === "blob") {
			finishTransfer();
			phase = "morph";
		}
		else if (phase === "morph") phase = "hold";
		else if (phase === "hold") phase = "melt";
		else {
			fromLiters = boards[idx].config.liters;
			idx = (idx + 1) % boards.length;
			phase = "blob";
			startTransfer();
		}
		dirty = true;
	};

	const skip = () => {
		if (reducedMotion) {
			idx = (idx + 1) % boards.length;
			yaw.rotation.y = PRESENT_YAW - spin.rotation.y;
			dirty = true;
			requestRender();
			return;
		}
		phaseT = 0;
		advance();
		requestRender();
	};
	host.addEventListener("surfblob:next", skip);

	/** 0 is goo, 1 is the board's finished resin (or foam), in between is the morph. */
	const setSkin = (board: BoardRuntime, m: number) => {
		mix.value = m;
		skin.roughness = lerp(GOO_ROUGH, board.roughness, m);
		skin.clearcoat = lerp(1, board.clearcoat, m);
		innerMat.opacity = 0.55 * (1 - m);
		inner.visible = m < 0.98;
	};

	/** Pull the current shape back to exactly `liters`, pivoting at the floor or the hover height. */
	const conserve = (liters: number, lift: number) => scaleToLiters(pos, liters, [0, HOVER * lift, 0]);

	function shapeFrame(t: number) {
		const board = boards[idx];
		const liters = board.config.liters;
		skin.map = board.texture;
		const time = t * 1.6;

		if (phase === "blob") {
			// Bounce, leaning into each hop and oozing out on each landing, while drops squeeze out
			// or soak in until it holds the next board's liters.
			const theta = spin.rotation.y + yaw.rotation.y;
			const bulges: BlobBulge[] = [];
			const owners: Drop[] = [];
			const held = fromLiters + transferNow(theta, bulges, owners);
			const hopLen = DUR.blob / HOPS;
			const k = Math.min(HOPS - 1, Math.floor(phaseT / hopLen));
			const p = clamp01((phaseT - k * hopLen) / hopLen);
			const d = Math.min(p, 1 - p);
			const hopSpeed = ((HOP_X[k + 1] - HOP_X[k]) * 6 * p * (1 - p)) / hopLen;
			writeBlobPositions(pos, {
				liters: held,
				time,
				wobble: IDLE_WOBBLE + (LAND_WOBBLE - IDLE_WOBBLE) * Math.exp(-((d / 0.08) ** 2)),
				squash: hopSquash(p, hopLen),
				lean: [-HOP_LEAN * hopSpeed, 0],
				spread: SPREAD_REST + SPREAD_LAND * Math.exp(-((d / 0.08) ** 2)),
				bulges,
				tips,
				offset: [lerp(HOP_X[k], HOP_X[k + 1], smooth(p)), HOP_HEIGHT[k] * 4 * p * (1 - p), 0],
			});
			placeTransfer(theta, owners, t);
			setSkin(board, 0);
			setFins(board, 0);
			emit(held);
			return;
		}
		if (phase === "morph") {
			const w = spring(phaseT, 7.5, 0.5);
			const settle = smooth(phaseT / 0.3);
			writeBlobPositions(blobBuf, {
				liters,
				time,
				wobble: LAND_WOBBLE * (1 - clamp01(w)),
				squash: 1 - LAND_SQUASH * (1 - settle),
				spread: SPREAD_REST + SPREAD_LAND * (1 - settle),
			});
			blendPositions(blobBuf, board.pos, w, pos);
			conserve(liters, clamp01(w));
			setSkin(board, smooth((w - 0.45) / 0.45));
			setFins(board, phaseT > 0.55 ? spring(phaseT - 0.55, 14, 0.5) : 0);
			emit(liters);
			return;
		}
		if (phase === "hold") {
			pos.set(board.pos);
			setSkin(board, 1);
			setFins(board, 1);
			emit(liters);
			return;
		}
		// Melt: fins retract, the paint fades and the ends droop, while within a third of the melt the
		// board goes soft into a fat, lumpy sausage of goo with round ends, which sags, falls to the
		// floor and pulls in to a blob that oozes out on the floor.
		const m = clamp01(phaseT / DUR.melt);
		const w = 1 - smooth(m / 0.32);
		const droop = 0.3 * Math.sin(Math.PI * Math.min(1, m * 1.15));
		const ripple = 0.05 * Math.sin(Math.PI * m);
		const half = board.cal.prepared.halfL * INCH;
		for (let k = 0; k < sagBuf.length; k += 3) {
			const u = board.pos[k] / half;
			sagBuf[k] = board.pos[k];
			sagBuf[k + 1] = board.pos[k + 1] - droop * u * u + ripple * Math.sin(5 * u - 9 * m);
			sagBuf[k + 2] = board.pos[k + 2];
		}
		// The sausage starts a little shorter than the board and shrinks to the blob's length.
		const sausageHalf = lerp(MELT_LENGTH * half, board.blobHalf, smooth(m / 0.85));
		const fall = 1 - smooth(m / 0.85);
		writeBlobPositions(blobBuf, {
			liters,
			time,
			elongate: (sausageHalf / board.blobHalf) ** 1.5,
			wobble: lerp(MELT_LUMPS, LAND_WOBBLE, m),
			squash: 1 - LAND_SQUASH * m ** 3,
			spread: (SPREAD_REST + SPREAD_LAND) * m ** 3,
			offset: [0, (HOVER - 0.05) * fall, 0],
		});
		// The goo sags at the ends too, puddling where it reaches the floor.
		for (let k = 0; k < blobBuf.length; k += 3) {
			const u = blobBuf[k] / sausageHalf;
			blobBuf[k + 1] = Math.max(0, blobBuf[k + 1] - droop * fall * u * u);
		}
		blendPositions(blobBuf, sagBuf, w, pos);
		conserve(liters, fall);
		setSkin(board, 1 - smooth(m / 0.45));
		setFins(board, 1 - smooth(m / 0.22));
		emit(liters);
	}

	function writeFrame(t: number) {
		shapeFrame(t);
		writeGridNormals(pos, nor);
		writeShellPositions(pos, nor, SHELL, shellPos);
		posAttr.needsUpdate = norAttr.needsUpdate = shellAttr.needsUpdate = true;

		// Shadow under the shape: footprint from its extent, fainter and smaller as it rises.
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let minZ = Infinity;
		let maxZ = -Infinity;
		for (let k = 0; k < pos.length; k += 3) {
			const x = pos[k];
			const y = pos[k + 1];
			const z = pos[k + 2];
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (z < minZ) minZ = z;
			if (z > maxZ) maxZ = z;
		}
		const lift = clamp01(minY / 0.6);
		shadow.position.x = (minX + maxX) / 2;
		shadow.position.z = (minZ + maxZ) / 2;
		shadow.scale.set(((maxX - minX) / 2) * (1 - 0.35 * lift) + 0.02, 1, ((maxZ - minZ) / 2) * (1 - 0.35 * lift) + 0.02);
		shadowMat.opacity = 0.3 - 0.14 * lift;
	}

	writeFrame(0);

	return {
		root,
		spin,
		autoSpeed: AUTO_SPEED,
		framing: {
			target: new Vector3(0, 0.28, 0),
			turnRadius: maxHalfLength * 1.04,
			halfHeight: 0.42,
			viewDir: new Vector3(0.1, 0.62, 1),
		},
		update({ t, dt }) {
			if (!reducedMotion) {
				phaseT += dt;
				while (phaseT >= DUR[phase]) {
					phaseT -= DUR[phase];
					advance();
				}
				// While it's a blob, turn it so the coming board is readable mid-hold.
				if (phase === "blob" || phase === "morph") {
					const untilMidHold = (phase === "blob" ? DUR.blob - phaseT + DUR.morph : DUR.morph - phaseT) + DUR.hold / 2;
					const want = PRESENT_YAW - (spin.rotation.y + AUTO_SPEED * untilMidHold);
					yaw.rotation.y += wrapAngle(want - yaw.rotation.y) * Math.min(1, dt * (phase === "blob" ? 2.5 : 4));
				}
				// A gentle float while a board is held.
				root.position.y = phase === "hold" ? 0.012 * Math.sin(t * 1.8) * smooth(phaseT / 0.4) : 0;
				// Drops from the last bounce keep flying off while the board forms and holds.
				stepDrops(dt);
			}
			if (phase === "hold" && !dirty) return;
			dirty = false;
			writeFrame(t);
		},
		busy: () => dirty,
		onTap: skip,
		dispose() {
			host.removeEventListener("surfblob:next", skip);
			for (const b of boards) b.texture.dispose();
			kit.dispose();
		},
	};
};

export default createSurfboardBlob;
