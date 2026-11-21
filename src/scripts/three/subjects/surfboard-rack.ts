/**
 * The Volume Gap's board rack as a viewer subject: every iconic board standing in a wooden rack,
 * at true relative size and ordered by liters. Tap one (or pick it from the list) and the rack
 * shrinks off to one side while the board comes forward to fill the rest of the frame, rolling
 * over on the way to show its bottom before settling deck up, nose right. Dragging rolls it. The
 * page can reshape the pulled board to any length x width x thickness inside the model's real
 * range; the mesh is recalibrated to the estimated liters each time, so what you see holds that
 * volume.
 *
 * Host events in: "surfrack:select" {id | null}, "surfrack:dims" {id, lengthIn, widthIn,
 * thicknessIn, liters, final}. Out: "surfrack:selected" {id | null} when a board is tapped in 3D,
 * "surfrack:hover" {id | null}.
 */
import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	DynamicDrawUsage,
	Group,
	Matrix4,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Quaternion,
	Raycaster,
	SRGBColorSpace,
	Vector2,
	Vector3,
	type Camera,
} from "three";
import { createPartKit, slab } from "../../../lib/three/kit";
import { finsForDims, shapeForDims, type Dims } from "../../../lib/surf-volume/board-rack";
import { parseLengthIn, type BoardSizeRow, type FinSetup, type FinSpec, type LabelSpec, type LogoSpec, type ShapeSpec } from "../../../lib/surf-volume/iconic-boards";
import { INCH, VERTEX_COUNT, calibrateBoard, createTopology, writeGridNormals, writeShellPositions, type CalibratedBoard } from "../../../lib/three/surfboard-morph";
import { TEX_H, TEX_W, loadLabelFonts, loadLogos, paintBoardCanvas, type BoardColors } from "./surfboard-graphics";
import { buildFin, finMaterial, placeFin } from "./surfboard-parts";
import type { SubjectFactory } from "../viewer";

export interface RackBoardConfig {
	id: string;
	name: string;
	/** Liters of the stock size it starts at. */
	liters: number;
	finish?: "gloss" | "matte";
	shapeSpec: ShapeSpec;
	/** The stock size it starts at. */
	size: BoardSizeRow;
	/** The model's longest stock size, inches. */
	maxLengthIn: number;
	fins: FinSpec[];
	finSetup: FinSetup;
	graphic: string;
	colors: BoardColors;
	labels?: LabelSpec[];
}

export interface RackViewerConfig {
	boards: RackBoardConfig[];
	logos?: Record<string, LogoSpec>;
	ink: string;
	/** Page background, for the veil that sets the pulled board apart from the rack. */
	paper: string;
}

export interface RackDimsDetail extends Dims {
	id: string;
	liters: number;
	/** Last change of a drag: repaint the graphics for the new outline. */
	final: boolean;
}

const SHELL = 0.02;
const BOARD_ROUGH = 0.3;
const BOARD_CLEARCOAT = 0.45;
const MATTE_ROUGH = 0.9;
/** How far boards lean back against the rail, radians. */
const LEAN = 0.09;
/** Top of the floor plank the tails stand on, and where the tails sit front to back. */
const FLOOR = 0.04;
const TAIL_Z = 0.25;
/** Roll of the pulled board: deck toward the camera, tipped up a little. */
const PRESENT_ROLL = -0.42;
/** Putting a board back, and the rack shrinking aside or growing back, seconds. */
const PULL_S = 0.75;
const STAGE_S = 0.8;
/**
 * Taking a board out: it comes forward and rolls belly up, holds, then rolls on to its deck.
 * The eased roll already slows into and out of belly up, so the board rests there for about
 * 0.3 s more than HOLD_S.
 */
const ARRIVE_S = 1.0;
const HOLD_S = 0.08;
const TURN_S = 0.7;
const HOVER_LIFT = 0.06;
const VEIL_OPACITY = 0.4;
const WOOD = "#c8925a";

/**
 * Where things sit once a board is out, in normalized device coordinates (-1 to 1, y up): the
 * rack's box (center and size) and the pulled board's center and the width its longest stock
 * size spans. Wide frames put the rack on the left; tall ones put it across the top.
 */
interface Stage {
	rack: { x: number; y: number; w: number; h: number };
	board: { x: number; y: number; w: number };
}
const WIDE_STAGE: Stage = { rack: { x: -0.66, y: 0, w: 0.6, h: 1.6 }, board: { x: 0.35, y: 0.02, w: 1.12 } };
const TALL_STAGE: Stage = { rack: { x: 0, y: 0.62, w: 1.8, h: 0.62 }, board: { x: 0, y: -0.3, w: 1.84 } };
const X_AXIS = new Vector3(1, 0, 0);

/** Board frame (x nose, y deck, z across) to standing: nose up, deck toward the camera. */
const STANDING = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)));

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** The extra roll about the board's own length while it comes out: belly up on arrival, deck up after. */
const flipAngle = (t: number) =>
	t < ARRIVE_S + HOLD_S ? Math.PI * ease(clamp01((t - ARRIVE_S * 0.2) / (ARRIVE_S * 0.8))) : Math.PI * (1 + ease(clamp01((t - ARRIVE_S - HOLD_S) / TURN_S)));
const dimsOf = (s: BoardSizeRow): Dims => ({ lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in });

interface RackBoard {
	cfg: RackBoardConfig;
	index: number;
	group: Group;
	body: Mesh;
	geo: BufferGeometry;
	shellGeo: BufferGeometry;
	pos: Float32Array;
	nor: Float32Array;
	shellPos: Float32Array;
	cal: CalibratedBoard;
	dims: Dims;
	fins: Group[];
	finSpecs: FinSpec[];
	canvas: HTMLCanvasElement;
	texture: CanvasTexture;
	lift: number;
}

interface Move {
	b: RackBoard;
	/** Seconds since it started. */
	t: number;
	fromPos: Vector3;
	fromQuat: Quaternion;
	/** Local scale right after re-parenting (the rack may be shrunk); eases to 1. */
	fromScale: number;
	toPos: Vector3;
	toQuat: Quaternion;
	/** Coming out: roll over to show the bottom on the way. */
	flip: boolean;
}
const moveSeconds = (m: Move) => (m.flip ? ARRIVE_S + HOLD_S + TURN_S : PULL_S);

const createSurfboardRack: SubjectFactory = async ({ host, reducedMotion, requestRender }) => {
	const config = JSON.parse(host.dataset.config ?? "{}") as RackViewerConfig;
	if (!config.boards?.length) throw new Error("No boards configured for the board rack");
	const kit = createPartKit(config.ink);
	const topo = createTopology();
	const index = new BufferAttribute(topo.index, 1);
	const uv = new BufferAttribute(topo.uv, 2);
	const shellMat = kit.material(new MeshBasicMaterial({ color: config.ink, side: BackSide }));
	const [, logos] = await Promise.all([loadLabelFonts(), loadLogos(config.logos)]);

	const root = new Group();
	const rack = new Group();
	root.add(rack);
	// The pulled board rolls about its length: the viewer turns `roll` about its local y, which
	// `presentBase` points along world x. Where `presentBase` sits is worked out from the camera.
	const presentBase = new Group();
	presentBase.rotation.z = -Math.PI / 2;
	const roll = new Group();
	roll.rotation.y = PRESENT_ROLL;
	presentBase.add(roll);
	root.add(presentBase);

	// Narrow screens overlap the boards like a crowded shop rack; wide ones give each its own slot.
	const narrow = host.clientWidth < 640;
	const maxWidthM = Math.max(...config.boards.map((b) => b.size.width_in * INCH));
	const pitch = narrow ? maxWidthM * 0.62 : maxWidthM + 0.12;
	const rowWidth = pitch * (config.boards.length - 1) + maxWidthM;
	const slotQuat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -LEAN).multiply(STANDING);
	/** Standing in slot i with its tail on the plank. Overlapping boards step back one by one. */
	const slotPos = (b: RackBoard) => {
		const halfL = b.cal.prepared.halfL * INCH;
		const x = -rowWidth / 2 + maxWidthM / 2 + b.index * pitch;
		return new Vector3(x, FLOOR + halfL * Math.cos(LEAN), TAIL_Z - halfL * Math.sin(LEAN) - (narrow ? b.index * 0.035 : 0));
	};
	/** Inside `roll`: deck toward the camera, the axis through mid-thickness. */
	const presentPos = (b: RackBoard) => new Vector3(0, 0, (-b.dims.thicknessIn * INCH) / 2);

	const paint = (b: RackBoard) => {
		const painted = paintBoardCanvas(b.cal.prepared, b.cfg.graphic, b.cfg.colors, b.cfg.labels, logos, { layout: b.finSpecs, setup: b.cfg.finSetup });
		const ctx = b.canvas.getContext("2d")!;
		ctx.clearRect(0, 0, TEX_W, TEX_H);
		ctx.drawImage(painted, 0, 0);
		b.texture.needsUpdate = true;
	};

	const writeMesh = (b: RackBoard) => {
		b.pos.set(b.cal.positions);
		writeGridNormals(b.pos, b.nor);
		writeShellPositions(b.pos, b.nor, SHELL, b.shellPos);
		b.geo.getAttribute("position").needsUpdate = true;
		b.geo.getAttribute("normal").needsUpdate = true;
		b.shellGeo.getAttribute("position").needsUpdate = true;
		b.geo.computeBoundingSphere();
		b.shellGeo.computeBoundingSphere();
		b.finSpecs.forEach((f, i) => placeFin(b.fins[i], b.cal, f));
	};

	const boards: RackBoard[] = config.boards.map((cfg, i) => {
		const dims = dimsOf(cfg.size);
		const finSpecs = finsForDims(cfg.fins, cfg.size, dims);
		const cal = calibrateBoard(shapeForDims(cfg.shapeSpec, cfg.size, dims), cfg.liters);
		const pos = new Float32Array(VERTEX_COUNT * 3);
		const nor = new Float32Array(VERTEX_COUNT * 3);
		const shellPos = new Float32Array(VERTEX_COUNT * 3);
		const geo = kit.geometry(new BufferGeometry());
		geo.setAttribute("position", new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
		geo.setAttribute("normal", new BufferAttribute(nor, 3).setUsage(DynamicDrawUsage));
		geo.setAttribute("uv", uv);
		geo.setIndex(index);
		const shellGeo = kit.geometry(new BufferGeometry());
		shellGeo.setAttribute("position", new BufferAttribute(shellPos, 3).setUsage(DynamicDrawUsage));
		shellGeo.setIndex(index);
		const canvas = document.createElement("canvas");
		canvas.width = TEX_W;
		canvas.height = TEX_H;
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.flipY = false;
		texture.anisotropy = 4;
		const matte = cfg.finish === "matte";
		const mat = kit.material(
			new MeshPhysicalMaterial({ map: texture, roughness: matte ? MATTE_ROUGH : BOARD_ROUGH, clearcoat: matte ? 0 : BOARD_CLEARCOAT, clearcoatRoughness: 0.1, metalness: 0 }),
		);
		const group = new Group();
		const body = new Mesh(geo, mat);
		body.userData.board = i;
		group.add(body, new Mesh(shellGeo, shellMat));
		const finMat = finMaterial(kit, cfg.finSetup, typeof cfg.colors.fin === "string" ? cfg.colors.fin : config.ink);
		const fins = finSpecs.map((f) => buildFin(kit, cal, f, cfg.finSetup, finMat));
		group.add(...fins);
		const b: RackBoard = { cfg, index: i, group, body, geo, shellGeo, pos, nor, shellPos, cal, dims, fins, finSpecs, canvas, texture, lift: 0 };
		writeMesh(b);
		paint(b);
		group.position.copy(slotPos(b));
		group.quaternion.copy(slotQuat);
		rack.add(group);
		return b;
	});

	// The rack: a plank the tails stand on, a rail the boards lean against, and two posts.
	const wood = kit.std(WOOD, 0.7);
	const railY = 1.45;
	const railZ = TAIL_Z - (railY - FLOOR) * Math.tan(LEAN) - 0.07 - (narrow ? boards.length * 0.035 : 0);
	kit.add(rack, slab(rowWidth + 0.5, 0.08, 0.75), wood, [0, 0, TAIL_Z - 0.2], { outline: 0.015 });
	kit.add(rack, slab(rowWidth + 0.5, 0.1, 0.08), wood, [0, railY, railZ], { outline: 0.015 });
	for (const side of [-1, 1]) kit.add(rack, slab(0.1, railY + 0.1, 0.1), wood, [side * (rowWidth / 2 + 0.2), (railY + 0.1) / 2, railZ], { outline: 0.015 });

	// The rack's box, for shrinking it into its corner of the frame once a board is out.
	const rackW = rowWidth + 0.5;
	const rackH = Math.max(railY + 0.1, ...boards.map((b) => FLOOR + 2 * b.cal.prepared.halfL * INCH * Math.cos(LEAN)));
	const rackCenter = new Vector3(0, rackH / 2, TAIL_Z - 0.2);
	/** Each model's longest stock size sets how far forward it comes, so it fills the frame at full stretch. */
	const longestM = (b: RackBoard) => Math.max(b.cfg.maxLengthIn, b.dims.lengthIn) * INCH;

	// A veil of page color between the rack and the pulled board, so the board stands apart.
	const veilMat = kit.material(new MeshBasicMaterial({ color: config.paper, transparent: true, opacity: 0, depthWrite: false }));
	const veil = new Mesh(kit.geometry(new PlaneGeometry(60, 30)), veilMat);
	veil.position.set(0, 1.3, 0.9);
	veil.visible = false;
	root.add(veil);

	let selected: RackBoard | null = null;
	let hovered: RackBoard | null = null;
	const moves: Move[] = [];
	const raycaster = new Raycaster();
	const target = new Vector3(0, 1.2, 0.5);

	// Staging: where the shrunk rack and the pulled board go, worked out from the camera so it
	// holds at any aspect ratio. `stageK` runs 0 (whole rack) to 1 (board out, rack aside).
	let camera: PerspectiveCamera | null = null;
	let lastAspect = 0;
	let stageK = 0;
	const stagedRackPos = new Vector3();
	let stagedRackScale = 1;
	const right = new Vector3();
	const up = new Vector3();
	const fwd = new Vector3();
	/** The world point at normalized device (x, y), `depth` in front of the camera. */
	const atScreen = (cam: PerspectiveCamera, x: number, y: number, depth: number) => {
		const tanV = Math.tan(MathUtils.degToRad(cam.fov / 2));
		return cam.position.clone().addScaledVector(fwd, depth).addScaledVector(right, x * tanV * cam.aspect * depth).addScaledVector(up, y * tanV * depth);
	};
	const stageFor = (cam: PerspectiveCamera) => (cam.aspect >= 1.5 ? WIDE_STAGE : TALL_STAGE);
	const updateStage = (cam: PerspectiveCamera) => {
		cam.updateMatrixWorld();
		right.setFromMatrixColumn(cam.matrixWorld, 0);
		up.setFromMatrixColumn(cam.matrixWorld, 1);
		fwd.setFromMatrixColumn(cam.matrixWorld, 2).negate();
		const stage = stageFor(cam);
		const tanV = Math.tan(MathUtils.degToRad(cam.fov / 2));
		const depth = target.clone().sub(cam.position).dot(fwd);
		stagedRackScale = Math.min((stage.rack.w * depth * tanV * cam.aspect) / rackW, (stage.rack.h * depth * tanV) / rackH);
		stagedRackPos.copy(atScreen(cam, stage.rack.x, stage.rack.y, depth)).addScaledVector(rackCenter, -stagedRackScale);
	};
	/** Bring the turning point forward until this model's longest size spans the board's share of the frame. */
	const placePresent = (b: RackBoard) => {
		if (!camera) return;
		const stage = stageFor(camera);
		const tanH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
		presentBase.position.copy(atScreen(camera, stage.board.x, stage.board.y, longestM(b) / (stage.board.w * tanH)));
	};

	const moveTo = (b: RackBoard, parent: Group, toPos: Vector3, toQuat: Quaternion, flip = false) => {
		root.updateMatrixWorld(true);
		parent.attach(b.group);
		const i = moves.findIndex((m) => m.b === b);
		if (i >= 0) moves.splice(i, 1);
		const m: Move = { b, t: 0, fromPos: b.group.position.clone(), fromQuat: b.group.quaternion.clone(), fromScale: b.group.scale.x, toPos, toQuat, flip };
		if (reducedMotion) {
			b.group.position.copy(toPos);
			b.group.quaternion.copy(toQuat);
			b.group.scale.setScalar(1);
		} else moves.push(m);
	};

	/** Step a move: travel, re-scale, and (coming out) the roll that shows the bottom on the way. */
	const pivot = new Vector3();
	const turned = new Quaternion();
	const stepMove = (m: Move) => {
		const g = m.b.group;
		const f = ease(clamp01(m.t / (m.flip ? ARRIVE_S : PULL_S)));
		g.position.lerpVectors(m.fromPos, m.toPos, f);
		g.quaternion.slerpQuaternions(m.fromQuat, m.toQuat, f);
		const scale = m.fromScale + (1 - m.fromScale) * f;
		g.scale.setScalar(scale);
		if (!m.flip) return;
		// Roll about the board's own length, keeping its mid-thickness line where it was.
		turned.copy(g.quaternion).multiply(new Quaternion().setFromAxisAngle(X_AXIS, flipAngle(m.t)));
		pivot.set(0, (m.b.dims.thicknessIn * INCH) / 2, 0);
		const before = pivot.clone().applyQuaternion(g.quaternion);
		const after = pivot.applyQuaternion(turned);
		g.position.addScaledVector(before.sub(after), scale);
		g.quaternion.copy(turned);
	};

	const reshape = (b: RackBoard, dims: Dims, liters: number, final: boolean) => {
		let cal: CalibratedBoard;
		try {
			cal = calibrateBoard(shapeForDims(b.cfg.shapeSpec, b.cfg.size, dims), liters);
		} catch {
			return; // Out of the shape model's reach: keep the last good mesh.
		}
		b.cal = cal;
		b.dims = dims;
		b.finSpecs = finsForDims(b.cfg.fins, b.cfg.size, dims);
		writeMesh(b);
		if (selected === b) {
			const target = presentPos(b);
			const m = moves.find((x) => x.b === b);
			if (m) m.toPos = target;
			else b.group.position.copy(target);
		}
		if (final) paint(b);
	};

	const putBack = (b: RackBoard) => {
		const stock = dimsOf(b.cfg.size);
		if (b.dims.lengthIn !== stock.lengthIn || b.dims.widthIn !== stock.widthIn || b.dims.thicknessIn !== stock.thicknessIn) reshape(b, stock, b.cfg.liters, true);
		moveTo(b, rack, slotPos(b), slotQuat);
	};

	const select = (id: string | null, emit: boolean) => {
		const next = id ? (boards.find((b) => b.cfg.id === id) ?? null) : null;
		if (next === selected) return;
		if (selected) putBack(selected);
		selected = next;
		if (next) {
			next.lift = 0;
			roll.rotation.y = PRESENT_ROLL;
			placePresent(next);
			moveTo(next, roll, presentPos(next), STANDING.clone(), true);
		}
		if (emit) host.dispatchEvent(new CustomEvent("surfrack:selected", { detail: { id: next?.cfg.id ?? null } }));
		requestRender();
	};

	const onSelect = (e: Event) => select((e as CustomEvent<{ id: string | null }>).detail.id, false);
	const onDims = (e: Event) => {
		const d = (e as CustomEvent<RackDimsDetail>).detail;
		const b = boards.find((x) => x.cfg.id === d.id);
		if (!b) return;
		reshape(b, { lengthIn: d.lengthIn, widthIn: d.widthIn, thicknessIn: d.thicknessIn }, d.liters, d.final);
		requestRender();
	};
	host.addEventListener("surfrack:select", onSelect);
	host.addEventListener("surfrack:dims", onDims);

	const pick = (x: number, y: number, camera: Camera): RackBoard | null => {
		raycaster.setFromCamera(new Vector2(x, y), camera);
		const hit = raycaster.intersectObjects(
			boards.filter((b) => b !== selected).map((b) => b.body),
			false,
		)[0];
		return hit ? boards[hit.object.userData.board as number] : null;
	};
	const setHover = (b: RackBoard | null) => {
		if (b === hovered) return;
		hovered = b;
		const canvas = host.querySelector("canvas");
		if (canvas) canvas.style.cursor = b ? "pointer" : "";
		host.dispatchEvent(new CustomEvent("surfrack:hover", { detail: { id: b?.cfg.id ?? null } }));
	};

	return {
		root,
		spin: roll,
		autoSpeed: 0,
		framing: { target, turnRadius: rowWidth / 2 + 0.3, halfHeight: 1.45, viewDir: new Vector3(0, 0.12, 1) },
		update({ dt, camera: cam }) {
			if (cam instanceof PerspectiveCamera) {
				const resized = camera !== cam || camera.aspect !== lastAspect;
				camera = cam;
				if (resized) {
					lastAspect = cam.aspect;
					updateStage(cam);
					if (selected) placePresent(selected);
				}
			}
			const goal = selected ? 1 : 0;
			stageK = reducedMotion ? goal : goal > stageK ? Math.min(goal, stageK + dt / STAGE_S) : Math.max(goal, stageK - dt / STAGE_S);
			const sf = ease(stageK);
			rack.position.copy(stagedRackPos).multiplyScalar(sf);
			rack.scale.setScalar(1 + (stagedRackScale - 1) * sf);

			for (let i = moves.length - 1; i >= 0; i--) {
				const m = moves[i];
				m.t = Math.min(moveSeconds(m), m.t + dt);
				stepMove(m);
				if (m.t >= moveSeconds(m)) moves.splice(i, 1);
			}
			const k = reducedMotion ? 1 : 1 - Math.exp(-14 * dt);
			for (const b of boards) {
				if (b === selected || moves.some((m) => m.b === b)) continue;
				b.lift += ((b === hovered ? HOVER_LIFT : 0) - b.lift) * k;
				b.group.position.copy(slotPos(b)).y += b.lift;
			}
			veilMat.opacity += ((selected ? VEIL_OPACITY : 0) - veilMat.opacity) * k;
			veil.visible = veilMat.opacity > 0.01;
		},
		busy: () =>
			moves.length > 0 ||
			stageK !== (selected ? 1 : 0) ||
			Math.abs(veilMat.opacity - (selected ? VEIL_OPACITY : 0)) > 0.01 ||
			boards.some((b) => Math.abs(b.lift - (b === hovered && b !== selected ? HOVER_LIFT : 0)) > 0.002),
		onTapAt(x, y, camera) {
			const b = pick(x, y, camera);
			if (b) select(b.cfg.id, true);
		},
		onPointerAt(x, y, camera) {
			setHover(pick(x, y, camera));
		},
		onHover(on) {
			if (!on) setHover(null);
		},
		dispose() {
			host.removeEventListener("surfrack:select", onSelect);
			host.removeEventListener("surfrack:dims", onDims);
			for (const b of boards) b.texture.dispose();
			kit.dispose();
		},
	};
};

export default createSurfboardRack;
