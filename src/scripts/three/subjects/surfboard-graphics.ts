/**
 * Canvas-painted deck and bottom graphics for the Volume Gap boards. Stylized evocations of each
 * board's look (pink resin and pinlines, a 70s airbrushed rainbow, a retro fish laminate), never
 * a copy of a real logo. Painted in the board's own texture space (see surfboard-morph's uv):
 * canvas x runs nose to tail, canvas y maps across the deck (top half) and bottom (lower half).
 *
 * New boards pick a painter by name in iconic_boards.json ("graphic") and pass colors.
 */
import { bottomV, deckV, halfWidthIn, type PreparedBoard } from "../../../lib/three/surfboard-morph";

export const TEX_W = 2048;
export const TEX_H = 512;

export type BoardColors = Record<string, string | string[]>;
type Side = "deck" | "bottom";

const pick = (c: BoardColors, key: string, fallback: string) => (typeof c[key] === "string" ? (c[key] as string) : fallback);

/** Draws in plan inches (from the nose tip, across from the stringer) onto the texture. */
class Pen {
	readonly L: number;
	constructor(
		readonly ctx: CanvasRenderingContext2D,
		readonly p: PreparedBoard,
	) {
		this.L = p.shape.lengthIn;
	}

	x(fromNoseIn: number) {
		return (fromNoseIn / this.L) * TEX_W;
	}

	halfWidth(fromNoseIn: number) {
		return halfWidthIn(this.p, this.p.halfL - fromNoseIn);
	}

	/** Canvas y for across-board t on one side. */
	y(side: Side, t: number) {
		return (side === "deck" ? deckV(t) : bottomV(t)) * TEX_H;
	}

	/** Canvas point for a plan point; z beyond the rail clamps to the rail. */
	pt(side: Side, fromNoseIn: number, zIn: number): [number, number] {
		const hw = this.halfWidth(fromNoseIn);
		const t = hw > 1e-6 ? Math.max(-1, Math.min(1, zIn / hw)) : 0;
		return [this.x(fromNoseIn), this.y(side, t)];
	}

	/** Fill a polygon given in plan inches, subdividing edges so it bends with the outline. */
	poly(side: Side, pts: [number, number][], fill: string | CanvasGradient) {
		const { ctx } = this;
		ctx.beginPath();
		pts.forEach(([ax, az], i) => {
			const [bx, bz] = pts[(i + 1) % pts.length];
			for (let k = 0; k < 16; k++) {
				const f = k / 16;
				const [cx, cy] = this.pt(side, ax + (bx - ax) * f, az + (bz - az) * f);
				if (i === 0 && k === 0) ctx.moveTo(cx, cy);
				else ctx.lineTo(cx, cy);
			}
		});
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
	}

	circle(side: Side, fromNoseIn: number, zIn: number, r: number, fill: string) {
		const pts: [number, number][] = [];
		for (let a = 0; a < 48; a++) pts.push([fromNoseIn + r * Math.cos((a / 48) * Math.PI * 2), zIn + r * Math.sin((a / 48) * Math.PI * 2)]);
		this.poly(side, pts, fill);
	}

	/** A band at a constant fraction of the half-width, so it follows the rail like a pinline. */
	railBand(side: Side, t0: number, t1: number, fill: string | CanvasGradient, fromIn = 0, toIn = this.L) {
		const y0 = this.y(side, t0);
		const y1 = this.y(side, t1);
		this.ctx.fillStyle = fill;
		this.ctx.fillRect(this.x(fromIn), Math.min(y0, y1), this.x(toIn) - this.x(fromIn), Math.abs(y1 - y0));
	}

	/** A strip of constant real width down the middle: a wood stringer. */
	stringer(side: Side, widthIn: number, fill: string) {
		const top: [number, number][] = [];
		const bottom: [number, number][] = [];
		for (let k = 0; k <= 200; k++) {
			const s = k / 200;
			const hw = this.halfWidth(s * this.L);
			const t = hw > 1e-6 ? Math.min(1, widthIn / 2 / hw) : 1;
			top.push([this.x(s * this.L), this.y(side, t)]);
			bottom.push([this.x(s * this.L), this.y(side, -t)]);
		}
		const { ctx } = this;
		ctx.beginPath();
		[...top, ...bottom.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
	}

	/** A soft airbrushed fade from the rail (t = 1) inward to `inner`, on both rails. */
	railFade(side: Side, stops: string[], inner: number) {
		for (const sign of [1, -1]) {
			const g = this.ctx.createLinearGradient(0, this.y(side, sign), 0, this.y(side, sign * inner));
			stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
			this.railBand(side, sign, sign * inner, g);
		}
	}
}

/** Mix a hex color toward black (amount > 0) or white (amount < 0). */
function adjust(hex: string, amount: number): string {
	const n = parseInt(hex.slice(1), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amount >= 0 ? v * (1 - amount) : v + (255 - v) * -amount));
	return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function fadeTo(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

type Painter = (pen: Pen, colors: BoardColors) => void;

/** Takayama-style noserider: pink resin tint, wood stringer, black double pinlines. */
const pinkResin: Painter = (pen, c) => {
	const base = pick(c, "base", "#ff8fcf");
	const wood = pick(c, "wood", "#e9c48f");
	const ink = pick(c, "accent", "#111111");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) {
		// Resin pools a shade deeper on the rails.
		pen.railBand(side, 0.9, 1, adjust(base, 0.1));
		pen.railBand(side, -0.9, -1, adjust(base, 0.1));
		pen.stringer(side, 0.5, adjust(wood, 0.45));
		pen.stringer(side, 0.36, wood);
	}
	for (const sign of [1, -1]) {
		pen.railBand("deck", sign * 0.78, sign * 0.8, ink, 2, pen.L - 1);
		pen.railBand("deck", sign * 0.835, sign * 0.845, ink, 2, pen.L - 1);
	}
};

/** 70s single fin: cream deck with a rainbow airbrushed in from the rails and a tail-block sun. */
const rainbowAirbrush: Painter = (pen, c) => {
	const base = pick(c, "base", "#f6f1e4");
	const bottom = pick(c, "bottom", "#8fd0ff");
	const ink = pick(c, "accent", "#111111");
	const bands = Array.isArray(c.bands) ? c.bands : ["#ff5a1f", "#ffd400", "#c8ff3d", "#8fd0ff", "#2438ff"];
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H / 2);
	pen.ctx.fillStyle = bottom;
	pen.ctx.fillRect(0, TEX_H / 2, TEX_W, TEX_H / 2);

	// Deck: the spectrum sprayed in from each rail, coolest at the rail, fading to the cream.
	pen.railFade("deck", [...[...bands].reverse(), fadeTo(base, 0)], 0.3);
	// A rising sun on the tail block, rays first.
	const sunX = pen.L - 12;
	for (let k = 0; k < 9; k++) {
		const a = Math.PI * (0.5 + (k + 0.5) / 9);
		const a0 = a - 0.07;
		const a1 = a + 0.07;
		pen.poly(
			"deck",
			[
				[sunX + 3.4 * Math.cos(a0), 3.4 * Math.sin(a0)],
				[sunX + 6.5 * Math.cos(a0), 6.5 * Math.sin(a0)],
				[sunX + 6.5 * Math.cos(a1), 6.5 * Math.sin(a1)],
				[sunX + 3.4 * Math.cos(a1), 3.4 * Math.sin(a1)],
			],
			bands[0],
		);
	}
	pen.circle("deck", sunX, 0, 3, bands[1]);
	// Bottom: the same spray, warm end at the rail.
	pen.railFade("bottom", [...bands, fadeTo(bottom, 0)], 0.45);
	for (const side of ["deck", "bottom"] as const) pen.stringer(side, 0.18, adjust(base, 0.35));
	for (const sign of [1, -1]) pen.railBand("deck", sign * 0.27, sign * 0.285, ink, 4, pen.L - 4);
};

/** Retro fish: yellow resin tint, cream stringer, pinline, and a round fish laminate up front. */
const fishLaminate: Painter = (pen, c) => {
	const base = pick(c, "base", "#ffd400");
	const lam = pick(c, "laminate", "#2438ff");
	const wood = pick(c, "wood", "#f6f1e4");
	const ink = pick(c, "accent", "#111111");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) {
		pen.railBand(side, 0.92, 1, adjust(base, 0.12));
		pen.railBand(side, -0.92, -1, adjust(base, 0.12));
		pen.stringer(side, 0.42, wood);
	}
	for (const sign of [1, -1]) pen.railBand("deck", sign * 0.85, sign * 0.865, ink, 3, pen.L);
	// Laminate: ink ring, cream ring, color disc, and a plain fish (not any brand's mark).
	const lx = 15;
	pen.circle("deck", lx, 0, 4.1, ink);
	pen.circle("deck", lx, 0, 3.75, wood);
	pen.circle("deck", lx, 0, 3.3, lam);
	const fish: [number, number][] = [];
	for (let a = 0; a < 32; a++) {
		const th = (a / 32) * Math.PI * 2;
		fish.push([lx - 0.4 + 1.6 * Math.cos(th), 0.95 * Math.sin(th)]);
	}
	pen.poly("deck", fish, wood);
	pen.poly(
		"deck",
		[
			[lx + 0.9, 0],
			[lx + 2.4, 1.05],
			[lx + 2.4, -1.05],
		],
		wood,
	);
	pen.circle("deck", lx - 1.25, 0.3, 0.22, ink);
};

/** Fallback for boards added without a painter: base color and a stringer. */
const plain: Painter = (pen, c) => {
	pen.ctx.fillStyle = pick(c, "base", "#f6f1e4");
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	pen.stringer("deck", 0.3, pick(c, "accent", "#111111"));
	pen.stringer("bottom", 0.3, pick(c, "accent", "#111111"));
};

const PAINTERS: Record<string, Painter> = {
	"pink-resin": pinkResin,
	"rainbow-airbrush": rainbowAirbrush,
	"fish-laminate": fishLaminate,
};

/** Paint a board's deck and bottom into a new canvas. */
export function paintBoardCanvas(prepared: PreparedBoard, graphic: string, colors: BoardColors): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = TEX_W;
	canvas.height = TEX_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	(PAINTERS[graphic] ?? plain)(new Pen(ctx, prepared), colors);
	return canvas;
}
