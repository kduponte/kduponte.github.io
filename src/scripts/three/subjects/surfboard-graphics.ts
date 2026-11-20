/**
 * Canvas-painted deck and bottom graphics for the Volume Gap boards. Stylized evocations of each
 * board's look (pink resin and pinlines, the '76 Sting's sprayed rails, a retro fish laminate, a
 * Lightning Bolt inlay, a clear white blank, a carbon frame, tiger stripes, the classic Wavestorm stripes), never a
 * copy of a real board's artwork. Labels are the makers' own logo files (tinted to suit each board),
 * plus a few typeset names and shaper signatures.
 * Painted in the board's own texture space (see surfboard-morph's uv): canvas x runs nose to
 * tail, canvas y maps across the deck (top half) and bottom (lower half).
 *
 * New boards pick a painter by name in iconic_boards.json ("graphic") and pass colors and labels.
 */
import type { FinSetup, FinSpec, LabelSpec, LogoSpec } from "../../../lib/surf-volume/iconic-boards";
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

/**
 * AIPA '76 Sting "Spray", after the real board: yellow deck, deep-blue sprayed rails that turn
 * light blue behind the stinger step, and a short rainbow burst in the rail band mid-board.
 */
const stingSpray: Painter = (pen, c) => {
	const base = pick(c, "base", "#ffd400");
	const rail = pick(c, "rail", "#2438ff");
	const railTail = pick(c, "rail_tail", "#8fd0ff");
	const bands = Array.isArray(c.bands) ? c.bands : ["#d62828", "#ff5a1f", "#ff9f1c", "#8fd0ff"];
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	// Where the outline steps in, measured from the nose (no step: three-quarters back).
	const step = pen.p.xStep !== null ? pen.p.halfL - pen.p.xStep : pen.L * 0.75;
	const burst0 = pen.L * 0.44;
	const burst1 = pen.L * 0.53;
	for (const side of ["deck", "bottom"] as const) {
		for (const sign of [1, -1]) {
			pen.railBand(side, sign * 0.84, sign, rail, 0, step);
			pen.railBand(side, sign * 0.84, sign, railTail, step, pen.L);
			bands.forEach((band, i) => {
				const a = burst0 + ((burst1 - burst0) * i) / bands.length;
				pen.railBand(side, sign * 0.78, sign, band, a, a + (burst1 - burst0) / bands.length);
			});
		}
		pen.stringer(side, 0.18, adjust(base, -0.6));
	}
};

/**
 * Retro fish: a solid resin tint that pools a shade deeper toward the rails, a thin stringer, and an
 * optional pinline; the model's logo goes on top.
 */
const fishLaminate: Painter = (pen, c) => {
	const base = pick(c, "base", "#f2782b");
	const wood = pick(c, "wood", "#fbfaf5");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) {
		pen.railFade(side, [adjust(base, 0.2), fadeTo(adjust(base, 0.2), 0)], 0.7);
		pen.stringer(side, 0.22, wood);
	}
	if (typeof c.pinline === "string") for (const sign of [1, -1]) pen.railBand("deck", sign * 0.85, sign * 0.865, c.pinline, 3, pen.L);
};

/**
 * Grow a polygon outward by `d` inches (mitered, with sharp tips capped), for an inlay's pinline.
 * Expects counter-clockwise or clockwise points alike: it picks the side that grows the area.
 */
function grow(pts: [number, number][], d: number): [number, number][] {
	const area = pts.reduce((a, [x0, z0], i) => {
		const [x1, z1] = pts[(i + 1) % pts.length];
		return a + x0 * z1 - x1 * z0;
	}, 0);
	const out = area > 0 ? -1 : 1;
	return pts.map(([x, z], i) => {
		const [px, pz] = pts[(i + pts.length - 1) % pts.length];
		const [nx, nz] = pts[(i + 1) % pts.length];
		const n = (ax: number, az: number, bx: number, bz: number): [number, number] => {
			const len = Math.hypot(bx - ax, bz - az) || 1;
			return [((bz - az) / len) * out, (-(bx - ax) / len) * out];
		};
		const [n1x, n1z] = n(px, pz, x, z);
		const [n2x, n2z] = n(x, z, nx, nz);
		const bx = n1x + n2x;
		const bz = n1z + n2z;
		const blen = Math.hypot(bx, bz) || 1;
		const cos = (bx / blen) * n1x + (bz / blen) * n1z;
		const miter = Math.min(d / Math.max(cos, 1e-3), d * 3);
		return [x + (bx / blen) * miter, z + (bz / blen) * miter];
	});
}

/**
 * Gerry Lopez's Lightning Bolt look: a solid resin-tint board with one big contrasting bolt inlaid
 * down the stringer in the front half, edged with a thin pinline over a drop shadow. Placement and size follow
 * photos of Lopez-shaped Bolt single fins: a long, slim bolt from about 14% to 52% of the length,
 * spanning under a third of the board's width.
 */
const boltInlay: Painter = (pen, c) => {
	const base = pick(c, "base", "#d62828");
	const bolt = pick(c, "bolt", "#fbfaf5");
	const ink = pick(c, "accent", "#111111");
	const wood = pick(c, "wood", "#e9c48f");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) {
		pen.railBand(side, 0.9, 1, adjust(base, 0.14));
		pen.railBand(side, -0.9, -1, adjust(base, 0.14));
		pen.stringer(side, 0.3, wood);
	}
	// The bolt in a unit frame (u: 0 at its front tip, 1 at its back tip; w: across), as two
	// overlapping blades with slanted cuts, then laid along the stringer.
	const unit: [number, number][] = [
		[0, 0],
		[0.6, -0.5],
		[0.53, -0.08],
		[1, 0],
		[0.4, 0.5],
		[0.47, 0.08],
	];
	const from = pen.L * 0.14;
	const to = pen.L * 0.52;
	const mid = (from + to) / 2;
	const span = 0.3 * 2 * pen.halfWidth(mid);
	const pts = unit.map(([u, w]): [number, number] => [from + u * (to - from), w * span]);
	// Drop shadow: the same bolt knocked back toward the tail and one rail, then the pinline and bolt.
	const shadow = pts.map(([x, z]): [number, number] => [x + 0.55, z + 0.45]);
	pen.poly("deck", grow(shadow, 0.25), pick(c, "shadow", ink));
	pen.poly("deck", grow(pts, 0.25), ink);
	pen.poly("deck", pts, bolt);
};

/** Haydenshapes FutureFlex: stringerless white board inside a dark carbon perimeter frame. */
const futureflex: Painter = (pen, c) => {
	const base = pick(c, "base", "#f4f4f0");
	const carbon = pick(c, "carbon", "#2b2b2b");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) {
		for (const sign of [1, -1]) {
			pen.railBand(side, sign * 0.8, sign * 1, carbon);
			// A faint twill so the band reads as woven carbon.
			const y0 = pen.y(side, sign * 0.8);
			const y1 = pen.y(side, sign);
			pen.ctx.strokeStyle = adjust(carbon, -0.18);
			pen.ctx.lineWidth = 1;
			for (let x = -40; x < TEX_W; x += 7) {
				pen.ctx.beginPath();
				pen.ctx.moveTo(x, y0);
				pen.ctx.lineTo(x + Math.abs(y1 - y0), y1);
				pen.ctx.stroke();
			}
		}
	}
};

/** Pyzel White Tiger: a white board with tiger stripes, a nod to the name (stylized, not stock art). */
const tigerStripes: Painter = (pen, c) => {
	const base = pick(c, "base", "#fbfaf5");
	const ink = pick(c, "accent", "#111111");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) pen.stringer(side, 0.18, adjust(base, 0.3));
	// Tapered wedges from each rail toward the stringer, lengths varied by a fixed sequence.
	const reach = [0.55, 0.38, 0.62, 0.45, 0.33, 0.58, 0.42, 0.5];
	const thick = [1.5, 1.1, 1.8, 1.3, 0.9, 1.6, 1.2, 1.4];
	// A wavy stripe that tapers from a thick base to a point, sweeping toward the tail.
	const stripe = (x: number, fromZ: number, toZ: number, width: number) => {
		const pts: [number, number][] = [];
		const steps = 8;
		for (let i = 0; i <= steps; i++) {
			const f = i / steps;
			const z = fromZ + (toZ - fromZ) * f;
			const sway = 0.9 * Math.sin(f * Math.PI * 1.4) + 1.8 * f;
			pts.push([x + sway - (width / 2) * (1 - f), z]);
		}
		for (let i = steps; i >= 0; i--) {
			const f = i / steps;
			const z = fromZ + (toZ - fromZ) * f;
			const sway = 0.9 * Math.sin(f * Math.PI * 1.4) + 1.8 * f;
			pts.push([x + sway + (width / 2) * (1 - f), z]);
		}
		pen.poly("deck", pts, ink);
	};
	let k = 0;
	for (let x = 6; x < pen.L - 5; x += 5.5) {
		const hw = pen.halfWidth(x);
		if (hw < 3) continue;
		for (const sign of [1, -1]) {
			// From the rail inward...
			const r = reach[k % reach.length];
			stripe(x, sign * hw * 1.05, sign * hw * (1 - r - 0.2), thick[k % thick.length]);
			// ...and, offset half a step, from the stringer outward.
			const r2 = reach[(k + 3) % reach.length];
			stripe(x + 2.75, sign * 0.2, sign * hw * (0.25 + r2 * 0.5), thick[(k + 5) % thick.length] * 0.8);
			k++;
		}
	}
};

/**
 * The classic Costco Wavestorm 8': lengthwise stripes from navy rails through blues and greens to a
 * white center, a waffle-textured foam deck, a traction pad on the tail, and a white slick bottom.
 */
const classicStripes: Painter = (pen, c) => {
	const stripes = Array.isArray(c.stripes) ? c.stripes : ["#1b2a7a", "#2438ff", "#4aa3e8", "#3fb44a", "#c6e84a", "#ffffff"];
	// Stripe edges across the deck (rail = 1, stringer = 0), read off AGIT's product shot.
	const edges = [1, 0.86, 0.7, 0.54, 0.4, 0.26, 0];
	const bottom = pick(c, "bottom", "#f4f5f2");
	const rail = pick(c, "rail", stripes[0]);
	const pad = pick(c, "pad", "#9aa6bf");
	pen.ctx.fillStyle = bottom;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	stripes.forEach((color, i) => {
		for (const sign of [1, -1]) pen.railBand("deck", sign * edges[i], sign * edges[i + 1], color);
	});
	// The foam's waffle texture.
	pen.ctx.strokeStyle = "rgba(17, 17, 17, 0.1)";
	pen.ctx.lineWidth = 1.5;
	for (let x = -TEX_H; x < TEX_W; x += 14) {
		for (const dir of [1, -1]) {
			pen.ctx.beginPath();
			pen.ctx.moveTo(x, 0);
			pen.ctx.lineTo(x + dir * (TEX_H / 2), TEX_H / 2);
			pen.ctx.stroke();
		}
	}
	// Traction pad on the tail, following the outline, with diamond grooves.
	const from = pen.L - 20;
	const to = pen.L - 3;
	const outline: [number, number][] = [];
	for (let k = 0; k <= 24; k++) outline.push([from + ((to - from) * k) / 24, 0.74 * pen.halfWidth(from + ((to - from) * k) / 24)]);
	for (let k = 24; k >= 0; k--) outline.push([outline[k][0], -outline[k][1]]);
	pen.poly("deck", outline, pad);
	const { ctx } = pen;
	ctx.save();
	ctx.beginPath();
	outline.forEach(([at, z], k) => {
		const [x, y] = pen.pt("deck", at, z);
		if (k) ctx.lineTo(x, y);
		else ctx.moveTo(x, y);
	});
	ctx.closePath();
	ctx.clip();
	ctx.strokeStyle = adjust(pad, 0.3);
	ctx.lineWidth = 2;
	for (let x = pen.x(from) - TEX_H; x < pen.x(to) + TEX_H; x += 10) {
		for (const dir of [1, -1]) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x + dir * (TEX_H / 2), TEX_H / 2);
			ctx.stroke();
		}
	}
	ctx.restore();
	// The deck color wraps the rails onto the slick bottom.
	for (const sign of [1, -1]) pen.railBand("bottom", sign * 0.9, sign * 1, rail);
};

/** A clear-glassed white board: just the blank, a thin wood stringer and the faintest rail shade. */
const clearWhite: Painter = (pen, c) => {
	const base = pick(c, "base", "#fbfaf5");
	const wood = pick(c, "wood", "#b5754a");
	pen.ctx.fillStyle = base;
	pen.ctx.fillRect(0, 0, TEX_W, TEX_H);
	for (const side of ["deck", "bottom"] as const) {
		pen.railBand(side, 0.92, 1, adjust(base, 0.05));
		pen.railBand(side, -0.92, -1, adjust(base, 0.05));
		pen.stringer(side, 0.22, wood);
	}
};

/**
 * T&C's Tanaka Glide, after T&C's own product shot: an airbrushed mint-to-blue deck, a big
 * pink-orange-yellow lightning bolt down one rail, a yellow triangle, white slashes on the tail,
 * and a white bottom with sprayed rails.
 */
const tcAirbrush: Painter = (pen, c) => {
	const deck = Array.isArray(c.deck) ? c.deck : ["#a6f0d6", "#5fd3e2", "#36aee8", "#2a92dc"];
	const bolt = Array.isArray(c.bolt) ? c.bolt : ["#ff4f9a", "#ff9a3c", "#ffe14a"];
	const tri = pick(c, "triangle", "#ffe45c");
	const ink = pick(c, "accent", "#111111");
	const wood = pick(c, "wood", "#e9c48f");
	const { ctx, L } = pen;
	const along = (stops: string[], from: number, to: number) => {
		const g = ctx.createLinearGradient(pen.x(from), 0, pen.x(to), 0);
		stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
		return g;
	};
	ctx.fillStyle = along(deck, 0, L);
	ctx.fillRect(0, 0, TEX_W, TEX_H / 2);
	ctx.fillStyle = pick(c, "bottom", "#fbfaf5");
	ctx.fillRect(0, TEX_H / 2, TEX_W, TEX_H / 2);
	for (const sign of [1, -1]) pen.railBand("bottom", sign * 0.86, sign, along(deck, 0, L));
	pen.railBand("bottom", 0.86, 1, bolt[0], 0, L * 0.12);
	for (const side of ["deck", "bottom"] as const) pen.stringer(side, 0.16, wood);
	// The bolt, in a frame running down the +z rail: u nose-to-tail along the board, w from
	// near the stringer (0) to the rail (1).
	const shape: [number, number][] = [
		[0, 0.42],
		[0, 1],
		[0.45, 0.66],
		[0.41, 0.9],
		[1, 0.05],
		[0.56, 0.36],
		[0.6, 0.12],
	];
	const u0 = L * 0.03;
	const u1 = L * 0.6;
	const pts = shape.map(([u, w]): [number, number] => {
		const at = u0 + u * (u1 - u0);
		return [at, (0.12 + 0.88 * w) * pen.halfWidth(at) * 0.97];
	});
	pen.poly("deck", grow(pts, 0.22), ink);
	pen.poly("deck", pts, along(bolt, u0, u1));
	// Triangle on the other side, and the tail slashes.
	const triPts: [number, number][] = [
		[L * 0.47, -0.08 * pen.halfWidth(L * 0.47)],
		[L * 0.68, -0.96 * pen.halfWidth(L * 0.68)],
		[L * 0.68, -0.1 * pen.halfWidth(L * 0.68)],
	];
	pen.poly("deck", grow(triPts, 0.22), ink);
	pen.poly("deck", triPts, tri);
	for (let k = 0; k < 4; k++) {
		const a = L * (0.8 + k * 0.045);
		pen.poly("deck", [
			[a, -pen.halfWidth(a)],
			[a + L * 0.022, -pen.halfWidth(a + L * 0.022)],
			[a - L * 0.04, -0.15 * pen.halfWidth(a)],
			[a - L * 0.062, -0.15 * pen.halfWidth(a)],
		], pick(c, "slash", "#fbfaf5"));
	}
};

/**
 * Catch Surf's Odysea Log (Blue/Gradient): a sky-blue waffle foam deck, a sunset gradient on the
 * slick bottom, and a black bumper on the tail.
 */
const odyseaLog: Painter = (pen, c) => {
	const deck = pick(c, "base", "#019dd6");
	const slick = Array.isArray(c.bottom) ? c.bottom : ["#ff5a8a", "#ff8a3d", "#ffd23a"];
	const { ctx, L } = pen;
	ctx.fillStyle = deck;
	ctx.fillRect(0, 0, TEX_W, TEX_H / 2);
	const g = ctx.createLinearGradient(0, TEX_H / 2, TEX_W, TEX_H);
	slick.forEach((s, i) => g.addColorStop(i / (slick.length - 1), s));
	ctx.fillStyle = g;
	ctx.fillRect(0, TEX_H / 2, TEX_W, TEX_H / 2);
	for (const sign of [1, -1]) pen.railBand("bottom", sign * 0.92, sign, deck);
	// Waffle texture of the foam deck.
	ctx.strokeStyle = "rgba(17, 17, 17, 0.1)";
	ctx.lineWidth = 1.5;
	for (let x = -TEX_H; x < TEX_W; x += 14) {
		for (const dir of [1, -1]) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x + dir * (TEX_H / 2), TEX_H / 2);
			ctx.stroke();
		}
	}
	// Bumper tail and the leash plug.
	ctx.fillStyle = pick(c, "bumper", "#1a1a1a");
	ctx.fillRect(pen.x(L - 1.2), 0, TEX_W - pen.x(L - 1.2), TEX_H);
	pen.circle("deck", L - 3, 0, 0.55, "#1a1a1a");
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
	"sting-spray": stingSpray,
	"fish-laminate": fishLaminate,
	"bolt-inlay": boltInlay,
	futureflex,
	"tiger-stripes": tigerStripes,
	"classic-stripes": classicStripes,
	"tc-airbrush": tcAirbrush,
	"odysea-log": odyseaLog,
	"clear-white": clearWhite,
};

type LabelFont = NonNullable<LabelSpec["font"]>;

const LABEL_FONTS: Record<LabelFont, (px: number) => string> = {
	display: (px) => `400 ${px}px Anton, Impact, sans-serif`,
	script: (px) => `italic 400 ${px}px "Instrument Serif", Georgia, serif`,
	sans: (px) => `800 ${px}px "Bricolage Grotesque Variable", system-ui, sans-serif`,
	mono: (px) => `400 ${px}px Silkscreen, monospace`,
};

/** Wait (briefly) for the site's fonts so labels are typeset in them, not a fallback. */
export async function loadLabelFonts(): Promise<void> {
	if (typeof document === "undefined" || !document.fonts) return;
	const all = Promise.all(Object.values(LABEL_FONTS).map((f) => document.fonts.load(f(40), "AaPp'.").catch(() => [])));
	await Promise.race([all, new Promise((r) => setTimeout(r, 2500))]);
}

/** A loaded logo: an image, or (for an icon-font logo) the font family holding its glyph. */
export interface LogoAsset {
	spec: LogoSpec;
	image?: HTMLImageElement;
	fontFamily?: string;
}
export type LogoAssets = Map<string, LogoAsset>;

/** Load every logo file; any that fail are left out and their labels skipped. */
export async function loadLogos(logos: Record<string, LogoSpec> = {}): Promise<LogoAssets> {
	const assets: LogoAssets = new Map();
	await Promise.all(
		Object.entries(logos).map(async ([key, spec]) => {
			try {
				if (spec.mask === "glyph") {
					const fontFamily = `board-logo-${key}`;
					const face = new FontFace(fontFamily, `url(${spec.file})`);
					document.fonts.add(await face.load());
					assets.set(key, { spec, fontFamily });
				} else {
					const image = new Image();
					image.src = spec.file;
					await image.decode();
					assets.set(key, { spec, image });
				}
			} catch (err) {
				console.warn(`Board logo "${key}" failed to load`, err);
			}
		}),
	);
	return assets;
}

/** Fill style for a label: one color, or hard left-to-right bands across `width` pixels. */
function paint(ctx: CanvasRenderingContext2D, color: string | string[], width: number): string | CanvasGradient {
	if (!Array.isArray(color)) return color;
	const g = ctx.createLinearGradient(0, 0, width, 0);
	color.forEach((c, i) => {
		g.addColorStop(i / color.length, c);
		g.addColorStop((i + 1) / color.length - 1e-4, c);
	});
	return g;
}

/** Render a logo, colored per its mask, into its own canvas (so tinting never touches the board). */
function logoDecal(asset: LogoAsset, color: string | string[]): HTMLCanvasElement {
	const H = 256;
	const decal = document.createElement("canvas");
	const ctx = decal.getContext("2d")!;
	const { spec } = asset;
	if (spec.mask === "glyph" && asset.fontFamily && spec.glyph) {
		ctx.font = `400 ${H}px "${asset.fontFamily}"`;
		const m = ctx.measureText(spec.glyph);
		const top = m.actualBoundingBoxAscent;
		const height = top + m.actualBoundingBoxDescent || H;
		const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight || m.width;
		decal.width = Math.ceil((width / height) * H);
		decal.height = H;
		ctx.font = `400 ${H}px "${asset.fontFamily}"`;
		ctx.fillStyle = paint(ctx, color, decal.width);
		const k = H / height;
		ctx.setTransform(k, 0, 0, k, m.actualBoundingBoxLeft * k, top * k);
		ctx.fillText(spec.glyph, 0, 0);
		return decal;
	}
	// Images work at their own resolution (capped), so a logo that fills only part of its file
	// still has pixels to spare once the empty margin is trimmed away.
	const img = asset.image!;
	const [cx, cy, cw, ch] = spec.crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
	const k = Math.min(1, 1024 / Math.max(cw, ch));
	decal.width = Math.max(1, Math.round(cw * k));
	decal.height = Math.max(1, Math.round(ch * k));
	ctx.drawImage(img, cx, cy, cw, ch, 0, 0, decal.width, decal.height);
	if (spec.mask === "alpha") {
		ctx.globalCompositeOperation = "source-in";
		ctx.fillStyle = paint(ctx, color, decal.width);
		ctx.fillRect(0, 0, decal.width, decal.height);
		ctx.globalCompositeOperation = "source-over";
	} else if (spec.mask === "luma" || spec.mask === "ink") {
		// luma: light marks on a dark ground; ink: dark marks on a light ground. Either way the
		// marks become the label color and the ground drops out.
		const data = ctx.getImageData(0, 0, decal.width, decal.height);
		const tint = document.createElement("canvas").getContext("2d")!;
		tint.fillStyle = Array.isArray(color) ? color[0] : color;
		tint.fillRect(0, 0, 1, 1);
		const [r, g, b] = tint.getImageData(0, 0, 1, 1).data;
		const px = data.data;
		for (let i = 0; i < px.length; i += 4) {
			const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
			// Ink logos are scans and JPEG-ish: push the near-white ground fully clear.
			const cover = spec.mask === "luma" ? lum : Math.min(1, Math.max(0, (0.86 - lum) / 0.7));
			px[i + 3] = Math.round(px[i + 3] * cover);
			px[i] = r;
			px[i + 1] = g;
			px[i + 2] = b;
		}
		ctx.putImageData(data, 0, 0);
	} else if (spec.mask === "knockout") {
		knockOutBackground(ctx, decal.width, decal.height, spec.ground ?? 0.885, spec.whiten ?? false);
	} else if (spec.mask === "key" && spec.key) {
		// A logo printed on a known ground color (a board photo): that color drops out.
		const tint = document.createElement("canvas").getContext("2d")!;
		tint.fillStyle = spec.key;
		tint.fillRect(0, 0, 1, 1);
		const [kr, kg, kb] = tint.getImageData(0, 0, 1, 1).data;
		const data = ctx.getImageData(0, 0, decal.width, decal.height);
		const px = data.data;
		for (let i = 0; i < px.length; i += 4) {
			const d = Math.hypot(px[i] - kr, px[i + 1] - kg, px[i + 2] - kb);
			px[i + 3] = Math.round(px[i + 3] * Math.min(1, Math.max(0, (d - 45) / 70)));
		}
		ctx.putImageData(data, 0, 0);
	}
	return trim(decal);
}

/**
 * Clear the near-white ground around a full-color logo (a screenshot on white), flood-filling
 * from the edges so white inside the artwork, behind its own outline, is kept.
 */
function knockOutBackground(ctx: CanvasRenderingContext2D, w: number, h: number, ground: number, whiten: boolean) {
	const data = ctx.getImageData(0, 0, w, h);
	const px = data.data;
	const lumOf = (p: number) => (0.299 * px[p * 4] + 0.587 * px[p * 4 + 1] + 0.114 * px[p * 4 + 2]) / 255;
	const isGround = (p: number) => px[p * 4 + 3] > 0 && lumOf(p) >= ground;
	const seen = new Uint8Array(w * h);
	const stack: number[] = [];
	for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
	for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
	while (stack.length) {
		const p = stack.pop()!;
		if (seen[p]) continue;
		seen[p] = 1;
		if (!isGround(p) && px[p * 4 + 3] > 0) continue;
		px[p * 4 + 3] = 0;
		const x = p % w;
		if (x > 0) stack.push(p - 1);
		if (x < w - 1) stack.push(p + 1);
		if (p >= w) stack.push(p - w);
		if (p < w * (h - 1)) stack.push(p + w);
	}
	// Photo crops: flatten what's left of the light ground inside the artwork to clean white.
	if (whiten) for (let p = 0; p < w * h; p++) if (px[p * 4 + 3] > 0 && lumOf(p) >= ground) px[p * 4] = px[p * 4 + 1] = px[p * 4 + 2] = 255;
	ctx.putImageData(data, 0, 0);
}

/** Crop a decal to its visible pixels, so its height_in measures the logo, not the file's margin. */
function trim(decal: HTMLCanvasElement): HTMLCanvasElement {
	const { width: w, height: h } = decal;
	const px = decal.getContext("2d")!.getImageData(0, 0, w, h).data;
	let x0 = w;
	let y0 = h;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (px[(y * w + x) * 4 + 3] > 8) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
		}
	}
	if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return decal;
	const out = document.createElement("canvas");
	out.width = x1 - x0 + 1;
	out.height = y1 - y0 + 1;
	out.getContext("2d")!.drawImage(decal, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
	return out;
}

/**
 * Lay a label out in plan inches. The texture stretches differently along and across the board
 * (and the across scale changes as the outline tapers), so everything is drawn in inch space and
 * mapped locally; it reads nose-right for "along" labels and nose-up for "across" ones, on deck
 * and bottom alike. Text goes glyph by glyph so long names keep their shape.
 */
function drawLabel(pen: Pen, l: LabelSpec, logos: LogoAssets) {
	const { ctx } = pen;
	const sx = TEX_W / pen.L;
	const sy = (at: number) => TEX_H / 4 / Math.max(pen.halfWidth(at), 0.5);
	const rot = l.orient === "across" ? -Math.PI / 2 : Math.PI;
	const place = (at: number, z: number, draw: () => void) => {
		const [cx, cy] = pen.pt(l.side, at, z);
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(sx, sy(at));
		ctx.rotate(rot);
		draw();
		ctx.restore();
	};
	/** A laminate patch, `length` inches along the reading direction and `height` across it. */
	const patch = (length: number, height: number) => {
		if (!l.patch) return;
		const [along, across] = l.orient === "across" ? [height, length] : [length, height];
		const rect = (grow: number): [number, number][] => [
			[l.at_in - along / 2 - grow, l.z_in - across / 2 - grow],
			[l.at_in + along / 2 + grow, l.z_in - across / 2 - grow],
			[l.at_in + along / 2 + grow, l.z_in + across / 2 + grow],
			[l.at_in - along / 2 - grow, l.z_in + across / 2 + grow],
		];
		pen.poly(l.side, rect(0.14), "#111111");
		pen.poly(l.side, rect(0), l.patch);
	};

	if (l.logo) {
		const asset = logos.get(l.logo);
		if (!asset) return;
		const decal = logoDecal(asset, l.color);
		const h = l.height_in;
		const w = (decal.width / decal.height) * h;
		patch(w + h * 0.6, h * 1.5);
		place(l.at_in, l.z_in, () => ctx.drawImage(decal, -w / 2, -h / 2, w, h));
		return;
	}
	if (!l.text) return;
	const BASE = 100;
	ctx.font = LABEL_FONTS[l.font ?? "display"](BASE);
	const cap = ctx.measureText("H").actualBoundingBoxAscent || 0.72 * BASE;
	const k = l.height_in / cap; // inches per base-font pixel
	const widths = [...l.text].map((ch) => ctx.measureText(ch).width * k);
	const total = widths.reduce((a, b) => a + b, 0);
	patch(total + l.height_in * 0.9, l.height_in * 1.7);
	const glyph = (ch: string, at: number, z: number) =>
		place(at, z, () => {
			ctx.scale(k, k);
			ctx.textAlign = "center";
			ctx.textBaseline = "alphabetic";
			ctx.fillStyle = paint(ctx, l.color, 0);
			ctx.fillText(ch, 0, cap / 2);
		});
	if (l.orient === "across") {
		glyph(l.text, l.at_in, l.z_in);
		return;
	}
	// Reading toward the nose: the first glyph sits nearest the tail.
	let run = 0;
	[...l.text].forEach((ch, i) => {
		glyph(ch, l.at_in + total / 2 - run - widths[i] / 2, l.z_in);
		run += widths[i];
	});
}

/** A rounded slot in plan inches: `length` along the board, `width` across, centered on a point. */
function stadium(cx: number, cz: number, length: number, width: number): [number, number][] {
	const r = width / 2;
	const half = Math.max(0, length / 2 - r);
	const pts: [number, number][] = [];
	for (let k = 0; k <= 12; k++) {
		const a = -Math.PI / 2 + (Math.PI * k) / 12;
		pts.push([cx - half - r * Math.cos(a), cz + r * Math.sin(a)]);
	}
	for (let k = 0; k <= 12; k++) {
		const a = Math.PI / 2 + (Math.PI * k) / 12;
		pts.push([cx + half - r * Math.cos(a), cz + r * Math.sin(a)]);
	}
	return pts;
}

/**
 * The fin boxes (or glass-on fillets, or soft-fin plates) on the bottom, sized for each system:
 * a long single Futures box, a shorter FCS II tab box, a long US single box with its plate screw.
 */
function drawFinBoxes(pen: Pen, layout: FinSpec[], setup: FinSetup, finColor: string) {
	const box = setup.box_color ?? "#151515";
	const dark = parseInt(box.slice(1, 3), 16) < 128;
	const slot = dark ? "#000000" : adjust(box, 0.35);
	const screw = "#9aa0a6";
	for (const fin of layout) {
		const at = pen.L - fin.from_tail_in;
		const z = fin.off_center_in;
		const b = fin.base_in;
		switch (setup.system) {
			case "futures":
				pen.poly("bottom", stadium(at, z, b + 0.5, 0.7), box);
				pen.poly("bottom", stadium(at, z, b + 0.15, 0.3), slot);
				break;
			case "fcs2":
				pen.poly("bottom", stadium(at, z, b * 0.95, 0.62), box);
				pen.poly("bottom", stadium(at, z, b * 0.8, 0.26), slot);
				break;
			case "us-box": {
				const len = Math.min(10, b * 1.35);
				pen.poly("bottom", stadium(at, z, len, 0.85), box);
				pen.poly("bottom", stadium(at, z, len - 0.3, 0.32), "#000000");
				pen.circle("bottom", at - b / 2 + 0.2, z, 0.3, screw);
				break;
			}
			case "glass-on":
				// The resin fillet that blends a glassed-on fin into the bottom.
				pen.poly("bottom", stadium(at, z, b + 1.4, 1.2), fadeTo(adjust(finColor, 0.15), 0.85));
				break;
			case "soft":
				pen.poly("bottom", stadium(at, z, b * 0.75, 0.95), box);
				pen.circle("bottom", at - b * 0.2, z, 0.18, screw);
				pen.circle("bottom", at + b * 0.2, z, 0.18, screw);
				break;
			case "screw-through":
				// Fin plugs on the bottom, and the screws that hold the fins showing through the deck.
				pen.poly("bottom", stadium(at, z, b * 0.85, 1.0), box);
				for (const k of [-0.22, 0.22]) pen.circle("deck", at + b * k, z, 0.35, "#1a1a1a");
				break;
		}
	}
}

/** Paint a board's deck and bottom, its fin boxes, then its labels, into a new canvas. */
export function paintBoardCanvas(
	prepared: PreparedBoard,
	graphic: string,
	colors: BoardColors,
	labels: LabelSpec[] = [],
	logos: LogoAssets = new Map(),
	fins?: { layout: FinSpec[]; setup: FinSetup },
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = TEX_W;
	canvas.height = TEX_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	const pen = new Pen(ctx, prepared);
	(PAINTERS[graphic] ?? plain)(pen, colors);
	if (fins) drawFinBoxes(pen, fins.layout, fins.setup, pick(colors, "fin", "#111111"));
	for (const l of labels) drawLabel(pen, l, logos);
	return canvas;
}
