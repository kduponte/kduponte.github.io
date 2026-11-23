/**
 * Board parts shared by the Volume Gap's blob hero and its board rack: fins built from published
 * fin specs (outline, foil, cant and toe), their materials, and each board's painted texture.
 */
import { CanvasTexture, Group, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, Shape, type Material } from "three";
import type { PartKit } from "../../../lib/three/kit";
import { extrude } from "../../../lib/three/kit";
import type { FinSetup, FinSpec, LabelSpec } from "../../../lib/surf-volume/iconic-boards";
import { fitFinOutline } from "../../../lib/three/surf-fins";
import { INCH, bottomPoint, type CalibratedBoard } from "../../../lib/three/surfboard-morph";
import { paintBoardCanvas, type BoardColors, type LogoAssets } from "./surfboard-graphics";

/** Outline shell thickness for fins, meters. */
export const SHELL_FIN = 0.011;

/** A fin's outline, fitted to its published base, depth, sweep and area (see surf-fins). */
function finShape(fin: FinSpec): Shape {
	const pts = fitFinOutline(fin).points;
	const s = new Shape();
	pts.forEach(([x, y], i) => (i ? s.lineTo(x * INCH, y * INCH) : s.moveTo(x * INCH, y * INCH)));
	s.closePath();
	return s;
}

/** Side-fin cant (tip out toward the rail) and toe-in (leading edge toward the stringer), degrees. */
export const FIN_ANGLES: Record<FinSetup["system"], { cant: number; toe: number }> = {
	fcs2: { cant: 6, toe: 2 },
	futures: { cant: 6, toe: 2 },
	"us-box": { cant: 0, toe: 0 },
	"glass-on": { cant: 0, toe: 0 },
	soft: { cant: 3, toe: 1.5 },
	"screw-through": { cant: 4, toe: 1.5 },
};

/**
 * A foiled fin: thickest at the base and thinning toward the tip, as molded and glass fins are.
 * Soft fins stay chunky.
 */
export function finGeometry(fin: FinSpec, setup: FinSetup) {
	const soft = setup.finish === "soft";
	const geo = extrude(finShape(fin), (soft ? 0.5 : 0.3) * INCH, (soft ? 0.12 : 0.07) * INCH, false);
	const pos = geo.getAttribute("position");
	const h = fin.depth_in * INCH;
	for (let i = 0; i < pos.count; i++) {
		const down = Math.min(1, Math.max(0, -pos.getY(i) / h));
		pos.setZ(i, pos.getZ(i) * (1 - (soft ? 0.35 : 0.68) * down));
	}
	pos.needsUpdate = true;
	geo.computeVertexNormals();
	return geo;
}

/** Futures' honeycomb fins show a hex core through a clear skin: a tileable hex texture. */
function honeycombTexture(color: string): CanvasTexture {
	// Flat-topped hexes of radius r tile a 3r x (sqrt 3) r cell: corners plus one in the middle.
	const r = 48;
	const W = 3 * r;
	const H = Math.round(Math.sqrt(3) * r);
	const c = document.createElement("canvas");
	c.width = W;
	c.height = H;
	const ctx = c.getContext("2d")!;
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = "rgba(255,255,255,0.24)";
	ctx.lineWidth = 4;
	for (const [cx, cy] of [
		[0, 0],
		[W, 0],
		[0, H],
		[W, H],
		[W / 2, H / 2],
	]) {
		ctx.beginPath();
		for (let k = 0; k < 6; k++) {
			const a = (Math.PI / 3) * k;
			if (k) ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
			else ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
		}
		ctx.closePath();
		ctx.stroke();
	}
	const t = new CanvasTexture(c);
	t.colorSpace = SRGBColorSpace;
	t.wrapS = RepeatWrapping;
	t.wrapT = RepeatWrapping;
	// Shape UVs are in meters; one tile is 30 mm wide, so cells read at hero size.
	const tile = 0.03;
	t.repeat.set(1 / tile, W / H / tile);
	return t;
}

/** The material a board's fins are made of: soft foam, honeycomb under clear, molded, or glass. */
export function finMaterial(kit: PartKit, setup: FinSetup, color: string): Material {
	if (setup.finish === "soft") return kit.std(color, 0.85);
	return kit.material(
		new MeshPhysicalMaterial({
			color: setup.finish === "honeycomb" ? "#ffffff" : color,
			map: setup.finish === "honeycomb" ? honeycombTexture(color) : null,
			roughness: setup.finish === "performance-core" ? 0.35 : 0.22,
			clearcoat: setup.finish === "performance-core" ? 0.3 : 0.8,
			clearcoatRoughness: 0.1,
			metalness: 0,
		}),
	);
}

/** Where a fin's base sits on the board's bottom (board frame, meters), sunk a hair into the foam. */
export function placeFin(pivot: Group, cal: CalibratedBoard, fin: FinSpec, yOffset = 0) {
	const [x, y, z] = bottomPoint(cal, -cal.prepared.halfL + fin.from_tail_in, fin.off_center_in);
	pivot.position.set(x, y + yOffset + 0.15 * INCH, z);
}

/** One fin on its pivot: placed on the bottom, canted and toed in for side fins. */
export function buildFin(kit: PartKit, cal: CalibratedBoard, fin: FinSpec, setup: FinSetup, material: Material, yOffset = 0): Group {
	const pivot = new Group();
	placeFin(pivot, cal, fin, yOffset);
	if (fin.off_center_in !== 0) {
		const side = Math.sign(fin.off_center_in);
		const angles = FIN_ANGLES[fin.box ?? setup.system];
		pivot.rotation.order = "YXZ";
		pivot.rotation.x = -side * ((angles.cant * Math.PI) / 180);
		pivot.rotation.y = side * ((angles.toe * Math.PI) / 180);
	}
	kit.add(pivot, finGeometry(fin, setup), material, [0, 0, 0], { outline: SHELL_FIN });
	return pivot;
}

export interface PaintableBoard {
	graphic: string;
	colors: BoardColors;
	labels?: LabelSpec[];
	fins: FinSpec[];
	finSetup: FinSetup;
}

/** A board's painted deck and bottom as a texture for the shared board topology's UVs. */
export function boardTexture(cal: CalibratedBoard, b: PaintableBoard, logos: LogoAssets, canvas?: HTMLCanvasElement): CanvasTexture {
	const painted = paintBoardCanvas(cal.prepared, b.graphic, b.colors, b.labels, logos, { layout: b.fins, setup: b.finSetup });
	if (canvas) {
		canvas.getContext("2d")!.drawImage(painted, 0, 0);
	}
	const texture = new CanvasTexture(canvas ?? painted);
	texture.colorSpace = SRGBColorSpace;
	texture.flipY = false;
	texture.anisotropy = 4;
	return texture;
}
