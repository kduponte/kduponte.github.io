import {
	BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	LatheGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	RingGeometry,
	Shape,
	Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OUTLINE, createPartKit, extrude, shade, slab } from "./kit";
import { COLS, DEFAULT_CONSOLE_COLORS, DIAL_HALF_SWEEP, DIAL_Z_MAX, ROWS, dialAngle, type ConsoleColors } from "./gauge-dial";

/**
 * Too Good to Be True's hero: a chunky 1980s instrument cluster in the 22RE truck's dash colors
 * (gray dash and hood, black bezels), with one center-zero analog gauge per metric, like an old ammeter.
 *
 * - Needle: the metric's signed z statistic, on a dial from -5 to +5 (ticks every 1, halves between).
 * - Red zones at both ends: the decision rule's two-sided threshold |z| (the redline), shared by
 *   every dial because every rule applies one threshold to the whole dashboard.
 * - Lamp under the hub: lit when the needle is in the red (the rule flags the metric), blue if the
 *   metric truly moved, blinking coral if it was truly null (a false discovery).
 * - Pixel numerals: the metric's number, as the live experiment's table numbers them.
 *
 * Pure: no renderer or DOM, so it is unit tested in Node. Units are arbitrary (a dial is 0.6 wide).
 * The panel faces +Z, up is +Y; metrics run left to right, top to bottom.
 */

export { COLS, DEFAULT_CONSOLE_COLORS, DIAL_HALF_SWEEP, DIAL_Z_MAX, ROWS, dialAngle, type ConsoleColors };

const R = 0.3; // dial face radius
const PITCH_X = 0.86;
const PITCH_Y = 0.84;
const RED_INNER = 0.215;
const RED_OUTER = 0.265;
const PANEL_W = COLS * PITCH_X + 0.36;
const PANEL_H = ROWS * PITCH_Y + 0.3;
const TILT = -0.15; // the panel leans back, its faces tipped up toward a driver
const NEEDLE_Z = 0.05;

/**
 * The two red zones for a redline at |z| = `line`, as RingGeometry arcs (start and length in
 * radians, counterclockwise from +X). Empty when the line sits past the end of the dial.
 */
export function redZoneArcs(line: number): { start: number; length: number }[] {
	const inner = dialAngle(Math.abs(line));
	const length = DIAL_HALF_SWEEP - inner;
	if (length <= 1e-6) return [];
	const up = Math.PI / 2;
	return [
		{ start: up - DIAL_HALF_SWEEP, length }, // right end, positive z
		{ start: up + inner, length }, // left end, negative z
	];
}

/** 3x5 pixel numerals (rows top to bottom), the site's Silkscreen look as geometry. */
const DIGITS: Record<string, string[]> = {
	"0": ["111", "101", "101", "101", "111"],
	"1": ["010", "110", "010", "010", "111"],
	"2": ["111", "001", "111", "100", "111"],
	"3": ["111", "001", "111", "001", "111"],
	"4": ["101", "101", "111", "001", "001"],
	"5": ["111", "100", "111", "001", "111"],
	"6": ["111", "100", "111", "101", "111"],
	"7": ["111", "001", "001", "001", "001"],
	"8": ["111", "101", "111", "101", "111"],
	"9": ["111", "101", "111", "001", "111"],
};
const PIXEL = 0.016;

/** A number in pixel numerals, centered on the origin in the XY plane. */
export function pixelNumber(text: string): BufferGeometry {
	const cols = text.length * 4 - 1;
	const pieces: BufferGeometry[] = [];
	[...text].forEach((ch, i) => {
		const rows = DIGITS[ch];
		if (!rows) throw new Error(`No pixel glyph for "${ch}"`);
		rows.forEach((row, r) => {
			[...row].forEach((bit, c) => {
				if (bit !== "1") return;
				const px = new PlaneGeometry(PIXEL * 1.02, PIXEL * 1.02);
				px.translate((i * 4 + c - (cols - 1) / 2) * PIXEL, (2 - r) * PIXEL, 0);
				pieces.push(px);
			});
		});
	});
	const merged = mergeGeometries(pieces)!;
	pieces.forEach((p) => p.dispose());
	return merged;
}

/** The dial's printed ticks: a long one at zero, one per unit of z, a short one per half. */
function tickGeometry(): BufferGeometry {
	const pieces: BufferGeometry[] = [];
	for (let k = -2 * DIAL_Z_MAX; k <= 2 * DIAL_Z_MAX; k++) {
		const z = k / 2;
		const major = k % 2 === 0;
		const len = k === 0 ? 0.085 : major ? 0.055 : 0.03;
		const w = k === 0 ? 0.016 : major ? 0.011 : 0.007;
		const mid = RED_OUTER - len / 2;
		const a = dialAngle(z);
		const t = new PlaneGeometry(w, len);
		t.rotateZ(-a);
		t.translate(Math.sin(a) * mid, Math.cos(a) * mid, 0);
		pieces.push(t);
	}
	const merged = mergeGeometries(pieces)!;
	pieces.forEach((p) => p.dispose());
	return merged;
}

function redZoneGeometry(line: number): BufferGeometry {
	const arcs = redZoneArcs(line);
	if (!arcs.length) return new BufferGeometry();
	const pieces = arcs.map((a) => new RingGeometry(RED_INNER, RED_OUTER, Math.max(2, Math.ceil(a.length / 0.03)), 1, a.start, a.length));
	const merged = mergeGeometries(pieces)!;
	pieces.forEach((p) => p.dispose());
	return merged;
}

export type LampState = "off" | "lift" | "null";

export interface Gauge {
	/** 1-based metric number printed on the dial. */
	number: number;
	/** Dial center in the panel's plane. */
	center: [number, number];
	/** Rotate about local Z: `needle.rotation.z = -dialAngle(z)`. Use `setNeedle`. */
	needle: Group;
	redZone: Mesh;
	lamp: Mesh;
	lampMaterial: MeshStandardMaterial;
}

export interface GaugeConsole {
	group: Group;
	/** The tilted front panel holding the dials. */
	panel: Group;
	gauges: Gauge[];
	/** Every visible mesh (excludes outline shells and the shadow). */
	parts: Mesh[];
	width: number;
	height: number;
	/** The redline currently drawn, |z|. */
	readonly redline: number;
	setNeedle(index: number, z: number): void;
	setRedline(z: number): void;
	/** `glow` scales the lit lamp's emissive (blinking); ignored when off. */
	setLamp(index: number, state: LampState, glow?: number): void;
	dispose(): void;
}

export function buildGaugeConsole(count = COLS * ROWS, colors: ConsoleColors = DEFAULT_CONSOLE_COLORS): GaugeConsole {
	if (count < 1 || count > COLS * ROWS) throw new Error(`buildGaugeConsole fits 1 to ${COLS * ROWS} gauges, got ${count}`);
	const kit = createPartKit(colors.trim);
	const { add, std } = kit;
	const dashMat = std(colors.dash, 0.75);
	const dashDarkMat = std(shade(colors.dash, 0.3), 0.8);
	const trimMat = std(colors.trim, 0.55);
	const faceMat = std(colors.face, 0.6);
	const inkMat = kit.material(new MeshBasicMaterial({ color: colors.ink }));
	const redMat = kit.material(new MeshBasicMaterial({ color: colors.redline }));
	const needleMat = std(colors.ink, 0.4, 0.2);

	const group = new Group();
	const panel = new Group();
	panel.rotation.x = TILT;
	group.add(panel);

	// --- Housing: faceplate, a deep back box, the hood with its side cheeks, a dash-top ledge ---
	// The hood and cheeks are the same molded plastic as the dash, as on the truck; black is kept for
	// the bezels, hubs and outlines, so the housing still reads against a black page.
	add(panel, slab(PANEL_W, PANEL_H, 0.16, 0.12, 0.04), dashMat, [0, 0, -0.08], { outline: OUTLINE });
	add(panel, slab(PANEL_W - 0.2, PANEL_H - 0.2, 0.55, 0.1, 0.03), dashDarkMat, [0, 0, -0.42], { outline: OUTLINE });
	// The hood: a thick visor that overhangs the top row and drops a lip at the front, shaped in side
	// profile (x = depth toward the viewer, y = height) and run the panel's full width.
	const hoodTop = PANEL_H / 2 + 0.16;
	const lipY = hoodTop - 0.22;
	const visor = new Shape();
	visor.moveTo(-0.72, hoodTop);
	visor.lineTo(0.38, hoodTop - 0.015);
	visor.quadraticCurveTo(0.48, hoodTop - 0.03, 0.47, lipY + 0.04);
	visor.lineTo(0.44, lipY);
	visor.lineTo(0.3, lipY);
	visor.lineTo(0.22, PANEL_H / 2 - 0.02);
	visor.lineTo(-0.72, PANEL_H / 2 - 0.02);
	visor.lineTo(-0.72, hoodTop);
	add(panel, extrude(visor, PANEL_W + 0.28, 0.035, false), dashMat, [0, 0, 0], { rot: [0, -Math.PI / 2, 0], outline: OUTLINE });
	// Side cheeks run from the visor's lip down the panel's sides, tapering back toward the dash.
	const cheek = new Shape();
	cheek.moveTo(-0.72, hoodTop - 0.02);
	cheek.lineTo(0.42, hoodTop - 0.06);
	cheek.lineTo(0.1, -PANEL_H / 2 + 0.3);
	cheek.lineTo(-0.72, -PANEL_H / 2 + 0.3);
	cheek.lineTo(-0.72, hoodTop - 0.02);
	for (const side of [1, -1]) {
		add(panel, extrude(cheek, 0.12, 0.03, false), dashMat, [side * (PANEL_W / 2 + 0.07), 0, 0], {
			rot: [0, -Math.PI / 2, 0],
			outline: OUTLINE,
		});
	}
	const ledgeY = -PANEL_H / 2 - 0.08;
	add(group, slab(PANEL_W + 0.5, 0.16, 1.1, 0.06, 0.03), dashMat, [0, ledgeY, -0.25], { outline: OUTLINE });

	// --- Gauges ---
	const faceGeo = kit.geometry(new CircleGeometry(R, 48));
	const ticksGeo = kit.geometry(tickGeometry());
	// No red zone until a redline is set.
	let redline = DIAL_Z_MAX;
	let redGeo = kit.geometry(redZoneGeometry(DIAL_Z_MAX));
	const needleShape = new Shape();
	needleShape.moveTo(-0.013, -0.05);
	needleShape.lineTo(0.013, -0.05);
	needleShape.lineTo(0.0035, RED_OUTER - 0.008);
	needleShape.lineTo(-0.0035, RED_OUTER - 0.008);
	needleShape.lineTo(-0.013, -0.05);
	const needleGeo = kit.geometry(extrude(needleShape, 0.012, 0, false));
	const hubGeo = kit.geometry(new CylinderGeometry(0.036, 0.04, 0.03, 20).rotateX(Math.PI / 2));
	// Chunky black bezel: a flat-topped ring standing proud of the face.
	// Profile runs up the outside, across the top and down the inside, so the lathe's normals face out.
	const bezelProfile = [
		new Vector2(R + 0.085, -0.01),
		new Vector2(R + 0.085, 0.05),
		new Vector2(R + 0.06, 0.078),
		new Vector2(R + 0.018, 0.078),
		new Vector2(R - 0.004, 0.05),
		new Vector2(R - 0.004, -0.01),
	];
	const bezelGeo = kit.geometry(new LatheGeometry(bezelProfile, 48).rotateX(Math.PI / 2));
	const lampGeo = kit.geometry(slab(0.11, 0.042, 0.02, 0.012, 0.006));

	const gauges: Gauge[] = [];
	for (let i = 0; i < count; i++) {
		const col = i % COLS;
		const row = Math.floor(i / COLS);
		const cx = (col - (COLS - 1) / 2) * PITCH_X;
		const cy = ((ROWS - 1) / 2 - row) * PITCH_Y;
		const dial = new Group();
		dial.position.set(cx, cy, 0);
		panel.add(dial);

		add(dial, bezelGeo, trimMat, [0, 0, 0], { outline: 0 });
		add(dial, faceGeo, faceMat, [0, 0, 0.012], { outline: 0 });
		const redZone = add(dial, redGeo, redMat, [0, 0, 0.016], { outline: 0 });
		add(dial, ticksGeo, inkMat, [0, 0, 0.02], { outline: 0 });
		add(dial, pixelNumber(String(i + 1)), inkMat, [0, -0.115, 0.02], { outline: 0 });

		const lampMaterial = std(colors.lampOff, 0.35);
		lampMaterial.emissive = new Color(0x000000);
		const lamp = add(dial, lampGeo, lampMaterial, [0, -0.205, 0.024], { outline: 0 });

		const needle = new Group();
		needle.position.set(0, 0, NEEDLE_Z);
		add(needle, needleGeo, needleMat, [0, 0, 0], { outline: 0 });
		dial.add(needle);
		add(dial, hubGeo, trimMat, [0, 0, NEEDLE_Z + 0.012], { outline: 0 });

		gauges.push({ number: i + 1, center: [cx, cy], needle, redZone, lamp, lampMaterial });
	}

	// Hard, flat ground shadow, like the truck's.
	const shadowGeo = kit.geometry(new CircleGeometry(1, 40).rotateX(-Math.PI / 2));
	const shadowMat = kit.material(new MeshBasicMaterial({ color: colors.trim, transparent: true, opacity: 0.3 }));
	const shadow = new Mesh(shadowGeo, shadowMat);
	shadow.scale.set(PANEL_W / 2 + 0.2, 1, 0.75);
	shadow.position.set(0, ledgeY - 0.38, -0.25);
	group.add(shadow);

	const lift = new Color(colors.lift);
	const nul = new Color(colors.null);
	const off = new Color(colors.lampOff);
	const black = new Color(0x000000);

	const model: GaugeConsole = {
		group,
		panel,
		gauges,
		parts: kit.parts,
		width: PANEL_W + 0.5,
		height: PANEL_H + 0.16 + 0.24,
		get redline() {
			return redline;
		},
		setNeedle(index, z) {
			gauges[index].needle.rotation.z = -dialAngle(z);
		},
		setRedline(z) {
			const line = Math.abs(z);
			if (Math.abs(line - redline) < 1e-4) return;
			redline = line;
			redGeo.dispose();
			redGeo = kit.geometry(redZoneGeometry(line));
			for (const g of gauges) g.redZone.geometry = redGeo;
		},
		setLamp(index, state, glow = 1) {
			const m = gauges[index].lampMaterial;
			if (state === "off") {
				m.color.copy(off);
				m.emissive.copy(black);
				m.emissiveIntensity = 0;
				return;
			}
			// A lit lamp is all glow: a black base keeps the scene's lighting from washing its color out.
			m.color.copy(black);
			m.emissive.copy(state === "lift" ? lift : nul);
			m.emissiveIntensity = glow;
		},
		dispose: kit.dispose,
	};
	return model;
}

/** Where the console's middle sits, and how far the camera must fit around it. */
export function consoleFraming() {
	return {
		target: [0, -0.12, -0.1] as [number, number, number],
		// Half the dash ledge across, by the back of the tilted hood: the bounding box's far corner.
		turnRadius: Math.hypot((PANEL_W + 0.5) / 2, 1.04),
		halfHeight: PANEL_H / 2 + 0.36,
	};
}
