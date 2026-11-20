/**
 * The Volume Gap's Play-Doh blob as a viewer subject. It bounces, then shape-shifts into each
 * iconic board in turn, holds it, and melts back, forever. The blob always holds exactly the
 * liters of the board it's about to become (grown or shrunk while it bounces), and every board
 * is built in meters from its real dimensions, so sizes and liters are to scale. The wobble,
 * squash and overshoot are animation.
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
	SRGBColorSpace,
	Shape,
	Vector3,
} from "three";
import { createPartKit, extrude } from "../../../lib/three/kit";
import type { FinSpec, LabelSpec, LogoSpec } from "../../../lib/surf-volume/iconic-boards";
import {
	INCH,
	VERTEX_COUNT,
	blendPositions,
	bottomPoint,
	calibrateBoard,
	createTopology,
	scaleToLiters,
	writeBlobPositions,
	writeGridNormals,
	writeShellPositions,
	type BoardShape,
	type CalibratedBoard,
} from "../../../lib/three/surfboard-morph";
import { loadLabelFonts, loadLogos, paintBoardCanvas, type BoardColors } from "./surfboard-graphics";
import type { SubjectFactory } from "../viewer";

export interface BlobBoardConfig {
	id: string;
	name: string;
	liters: number;
	finish?: "gloss" | "matte";
	shape: BoardShape;
	fins: FinSpec[];
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
}

/** Seconds per phase. */
const DUR: Record<BlobPhase, number> = { blob: 1.9, morph: 1.25, hold: 3.4, melt: 0.95 };
const HOPS = 3;
const HOP_HEIGHT = [0.34, 0.26, 0.17];
const HOP_X = [0, 0.3, -0.24, 0];
/** How far boards float above the floor, meters (clears a 9" longboard fin). */
const HOVER = 0.3;
/** Outline shell thickness, meters: the truck's 0.05 scaled to these smaller subjects. */
const SHELL = 0.022;
const SHELL_FIN = 0.011;
const LAND_SQUASH = 0.3;
const LAND_WOBBLE = 0.13;
const IDLE_WOBBLE = 0.06;
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

/** Squash on landing (< 1) and a little stretch mid-air (> 1), from the phase of a hop. */
function hopSquash(p: number): number {
	const d = Math.min(p, 1 - p);
	return 1 - LAND_SQUASH * Math.exp(-((d / 0.06) ** 2)) + 0.12 * smooth((d - 0.04) / 0.14) * (1 - smooth((d - 0.3) / 0.2));
}

function finShape(fin: FinSpec): Shape {
	const h = fin.depth_in * INCH;
	const b = fin.base_in * INCH;
	const s = new Shape();
	s.moveTo(b / 2, 0);
	if (fin.template === "keel") {
		s.quadraticCurveTo(b * 0.15, -h * 0.95, -b * 0.4, -h);
		s.quadraticCurveTo(-b * 0.52, -h * 0.5, -b / 2, 0);
	} else if (fin.template === "thruster") {
		// Swept side and center fins.
		s.quadraticCurveTo(b * 0.05, -h * 0.7, -b * 0.55, -h);
		s.quadraticCurveTo(-b * 0.38, -h * 0.42, -b / 2, 0);
	} else if (fin.template === "soft") {
		// Stubby, rounded soft-top fins.
		s.quadraticCurveTo(b * 0.45, -h * 0.95, -b * 0.15, -h);
		s.quadraticCurveTo(-b * 0.55, -h * 0.85, -b / 2, 0);
	} else if (fin.template === "longboard") {
		s.quadraticCurveTo(-b * 0.05, -h * 0.6, -b * 0.62, -h);
		s.quadraticCurveTo(-b * 0.5, -h * 0.45, -b / 2, 0);
	} else {
		s.quadraticCurveTo(-b * 0.02, -h * 0.62, -b * 0.42, -h);
		s.quadraticCurveTo(-b * 0.42, -h * 0.4, -b / 2, 0);
	}
	s.lineTo(b / 2, 0);
	return s;
}

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
	const skin = kit.material(
		new MeshPhysicalMaterial({ color: "#ffffff", roughness: GOO_ROUGH, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true }),
	);
	skin.onBeforeCompile = (shader) => {
		shader.uniforms.uMix = mix;
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
	skin.customProgramCacheKey = () => "surfboard-blob-goo";
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

	interface BoardRuntime {
		config: BlobBoardConfig;
		roughness: number;
		clearcoat: number;
		cal: CalibratedBoard;
		/** Calibrated positions lifted to the hover height. */
		pos: Float32Array;
		texture: CanvasTexture;
		fins: Group[];
	}
	const [, logos] = await Promise.all([loadLabelFonts(), loadLogos(config.logos)]);
	const boards: BoardRuntime[] = config.boards.map((b) => {
		const cal = calibrateBoard(b.shape, b.liters);
		const lifted = cal.positions.slice();
		for (let k = 1; k < lifted.length; k += 3) lifted[k] += HOVER;
		const texture = new CanvasTexture(paintBoardCanvas(cal.prepared, b.graphic, b.colors, b.labels, logos));
		texture.colorSpace = SRGBColorSpace;
		texture.flipY = false;
		texture.anisotropy = 4;
		const finMat = kit.std(typeof b.colors.fin === "string" ? b.colors.fin : config.ink, 0.35);
		const fins = b.fins.map((fin) => {
			const [x, y, z] = bottomPoint(cal, -cal.prepared.halfL + fin.from_tail_in, fin.off_center_in);
			const pivot = new Group();
			pivot.position.set(x, y + HOVER + 0.15 * INCH, z);
			kit.add(pivot, extrude(finShape(fin), 0.32 * INCH, 0.1 * INCH, false), finMat, [0, 0, 0], { outline: SHELL_FIN });
			pivot.scale.setScalar(0);
			pivot.visible = false;
			yaw.add(pivot);
			return pivot;
		});
		const matte = b.finish === "matte";
		return { config: b, cal, pos: lifted, texture, fins, roughness: matte ? MATTE_ROUGH : BOARD_ROUGH, clearcoat: matte ? 0 : BOARD_CLEARCOAT };
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
		host.dispatchEvent(new CustomEvent<BlobState>("surfblob:state", { detail: { phase, index: idx, liters } }));
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

	const advance = () => {
		if (phase === "blob") phase = "morph";
		else if (phase === "morph") phase = "hold";
		else if (phase === "hold") phase = "melt";
		else {
			fromLiters = boards[idx].config.liters;
			idx = (idx + 1) % boards.length;
			phase = "blob";
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
		const time = t * 1.3;

		if (phase === "blob") {
			// Bounce while growing or shrinking to the next board's liters.
			const held = lerp(fromLiters, liters, smooth(phaseT / 1.2));
			const hopLen = DUR.blob / HOPS;
			const k = Math.min(HOPS - 1, Math.floor(phaseT / hopLen));
			const p = clamp01((phaseT - k * hopLen) / hopLen);
			const d = Math.min(p, 1 - p);
			writeBlobPositions(pos, {
				liters: held,
				time,
				wobble: IDLE_WOBBLE + (LAND_WOBBLE - IDLE_WOBBLE) * Math.exp(-((d / 0.08) ** 2)),
				squash: hopSquash(p),
				offset: [lerp(HOP_X[k], HOP_X[k + 1], smooth(p)), HOP_HEIGHT[k] * 4 * p * (1 - p), 0],
			});
			setSkin(board, 0);
			setFins(board, 0);
			emit(held);
			return;
		}
		if (phase === "morph") {
			const w = spring(phaseT, 7.5);
			const settle = smooth(phaseT / 0.3);
			writeBlobPositions(blobBuf, { liters, time, wobble: LAND_WOBBLE * (1 - clamp01(w)), squash: 1 - LAND_SQUASH * (1 - settle) });
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
		// Melt: fins retract, the paint fades, the ends droop, and it slumps back into a blob.
		const m = clamp01(phaseT / DUR.melt);
		const w = 1 - m * m;
		const droop = 0.22 * Math.sin(Math.PI * Math.min(1, m * 1.15));
		const half = board.cal.prepared.halfL * INCH;
		for (let k = 0; k < sagBuf.length; k += 3) {
			const u = board.pos[k] / half;
			sagBuf[k] = board.pos[k];
			sagBuf[k + 1] = board.pos[k + 1] - droop * u * u;
			sagBuf[k + 2] = board.pos[k + 2];
		}
		writeBlobPositions(blobBuf, { liters, time, wobble: LAND_WOBBLE * m, squash: 1 - LAND_SQUASH * m ** 3 });
		blendPositions(blobBuf, sagBuf, w, pos);
		conserve(liters, w);
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
