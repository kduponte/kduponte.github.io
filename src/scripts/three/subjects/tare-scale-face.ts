/**
 * Canvas textures for the tare scale: the dial face (ticks every point, numbers every labelStep,
 * the band's track, the true-lift mark and the units) and the TARE button's label. Everything on
 * the face comes from the readings and the model's own angle mapping. Browser only.
 */
import { CanvasTexture, SRGBColorSpace } from "three";
import type { ScaleReadings } from "../../../lib/stats-sim/cuped-readings";
import { BAND_INNER, BAND_OUTER, DIAL_SWEEP, type TareScaleColors } from "../../../lib/three/tare-scale-model";

const SIZE = 1024;
const ANTON = (px: number) => `${px}px Anton, Impact, sans-serif`;
const MONO = (px: number) => `${px}px Silkscreen, ui-monospace, monospace`;

/** Wait (briefly) for the site's display fonts so the canvas doesn't paint in a fallback face. */
export async function loadFaceFonts(): Promise<void> {
	if (typeof document === "undefined" || !document.fonts) return;
	const all = Promise.all([document.fonts.load(ANTON(80), "+-0123456789TARE"), document.fonts.load(MONO(24), "POINTS")].map((p) => p.catch(() => [])));
	await Promise.race([all, new Promise((r) => setTimeout(r, 2500))]);
}

function texture(canvas: HTMLCanvasElement): CanvasTexture {
	const t = new CanvasTexture(canvas);
	t.colorSpace = SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

/** Signed label with a true minus sign: "+4", "0", "−4". */
export const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

export function paintDialFace(readings: ScaleReadings, colors: TareScaleColors): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = SIZE;
	const g = canvas.getContext("2d")!;
	const c = SIZE / 2;
	const R = SIZE / 2;
	const max = readings.dialMax;
	const angle = (v: number) => (v / max) * (DIAL_SWEEP / 2);
	// Canvas y runs down; dial angles are clockwise from twelve o'clock.
	const at = (a: number, r: number): [number, number] => [c + Math.sin(a) * r * R, c - Math.cos(a) * r * R];

	g.fillStyle = colors.face;
	g.beginPath();
	g.arc(c, c, R, 0, Math.PI * 2);
	g.fill();

	// The band's track across the whole sweep, so an empty stretch reads as "outside the interval".
	const a0 = -Math.PI / 2 - DIAL_SWEEP / 2;
	const a1 = -Math.PI / 2 + DIAL_SWEEP / 2;
	g.fillStyle = "#e4dcc6";
	g.beginPath();
	g.arc(c, c, BAND_OUTER * R, a0, a1);
	g.arc(c, c, BAND_INNER * R, a1, a0, true);
	g.closePath();
	g.fill();

	// The simulation's true lift: a lime pointer in from the rim, under its tick.
	const tri = (a: number, rTip: number, rBase: number, half: number) => {
		const [tx, ty] = at(a, rTip);
		const [lx, ly] = at(a - half, rBase);
		const [rx, ry] = at(a + half, rBase);
		g.beginPath();
		g.moveTo(tx, ty);
		g.lineTo(lx, ly);
		g.lineTo(rx, ry);
		g.closePath();
	};
	g.lineWidth = 6;
	g.lineJoin = "round";
	g.strokeStyle = colors.ink;
	g.fillStyle = colors.button;
	tri(angle(readings.trueLift), 0.8, 0.985, 0.075);
	g.fill();
	g.stroke();

	// Ticks every point, longer every labelStep, heaviest at zero.
	g.strokeStyle = colors.ink;
	g.lineCap = "round";
	for (let v = -max; v <= max; v += readings.tickStep) {
		const major = v % readings.labelStep === 0;
		g.lineWidth = v === 0 ? 14 : major ? 8 : 4;
		const [x0, y0] = at(angle(v), major ? 0.83 : 0.9);
		const [x1, y1] = at(angle(v), 0.97);
		g.beginPath();
		g.moveTo(x0, y0);
		g.lineTo(x1, y1);
		g.stroke();
	}
	g.fillStyle = colors.ink;
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.font = ANTON(78);
	for (let v = -max; v <= max; v += readings.labelStep) {
		const [x, y] = at(angle(v), 0.735);
		g.fillText(signed(v), x, y);
	}

	// Units and legend, inside the band below the hub.
	g.fillStyle = colors.ink;
	g.font = ANTON(60);
	g.fillText("B − A", c, c + 0.27 * R);
	g.font = MONO(24);
	g.fillText("LIFT, POINTS", c, c + 0.37 * R);
	const ly = c + 0.45 * R;
	g.fillStyle = colors.button;
	g.beginPath();
	g.moveTo(c - 0.25 * R, ly - 12);
	g.lineTo(c - 0.25 * R + 22, ly - 12);
	g.lineTo(c - 0.25 * R + 11, ly + 10);
	g.closePath();
	g.fill();
	g.lineWidth = 4;
	g.stroke();
	g.fillStyle = colors.ink;
	g.textAlign = "left";
	g.fillText(`TRUE ${signed(readings.trueLift)}`, c - 0.25 * R + 34, ly);
	return texture(canvas);
}

export function paintButtonLabel(colors: TareScaleColors): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 256;
	const g = canvas.getContext("2d")!;
	g.fillStyle = colors.button;
	g.fillRect(0, 0, 256, 256);
	g.fillStyle = colors.ink;
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.font = ANTON(86);
	g.fillText("TARE", 128, 134);
	return texture(canvas);
}
