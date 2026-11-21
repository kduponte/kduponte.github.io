// The static stand-in for the 3D tare scale, shown until WebGL mounts and kept if it can't: the
// same scale drawn straight on, with the last day's reading in two states (raw and tared) that the
// readout can switch between, the same dial mapping, and the same 1,200 visitors in the bowl.
import type { Arm } from "../stats-sim/cuped-cloud";
import type { Reading, ScaleReadings } from "../stats-sim/cuped-readings";
import { BAND_INNER, BAND_OUTER, BOWL_H, BOWL_R, DEFAULT_TARE_SCALE_COLORS, DIAL_CENTER, DIAL_R, DIAL_SWEEP, packBowl, type TareScaleColors } from "./tare-scale-model";

export const FALLBACK_VIEWBOX = "0 0 320 340";
const S = 118; // px per scene unit
const OX = 160;
const OY = 328;
const X = (x: number) => Math.round((OX + x * S) * 10) / 10;
const Y = (y: number) => Math.round((OY - y * S) * 10) / 10;
const r1 = (v: number) => Math.round(v * 10) / 10;

// Matches tare-scale-model.ts.
const FOOT_H = 0.08;
const BODY_W_BOTTOM = 2.2;
const BODY_W_TOP = 1.8;
const BODY_H = 1.55;
const PAN_Y = FOOT_H + BODY_H + 0.1;
const BOWL_Y = PAN_Y + 0.06;

const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

export function scaleFallbackSvg(readings: ScaleReadings, arms: Arm[], idPrefix: string, colors: TareScaleColors = DEFAULT_TARE_SCALE_COLORS): string {
	const max = readings.dialMax;
	const angle = (v: number) => (Math.max(-max, Math.min(max, v)) / max) * (DIAL_SWEEP / 2);
	const cx = X(DIAL_CENTER.x);
	const cy = Y(DIAL_CENTER.y);
	const R = DIAL_R * S;
	const at = (a: number, r: number) => `${r1(cx + Math.sin(a) * r * R)} ${r1(cy - Math.cos(a) * r * R)}`;
	const sector = (a0: number, a1: number, rIn: number, rOut: number) =>
		`M${at(a0, rOut)}A${r1(rOut * R)} ${r1(rOut * R)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${at(a1, rOut)}L${at(a1, rIn)}A${r1(rIn * R)} ${r1(rIn * R)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${at(a0, rIn)}Z`;
	const ink = colors.ink;

	const ids = { a: `${idPrefix}-a`, b: `${idPrefix}-b` };
	const marker = (id: string, fill: string) =>
		`<marker id="${id}" viewBox="-3 -3 6 6" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" overflow="visible"><circle r="2.1" fill="${fill}" stroke="${ink}" stroke-width="0.9"/></marker>`;

	// Body, feet, neck and pan.
	const body = `<path d="M${X(-BODY_W_BOTTOM / 2 + 0.2)} ${Y(FOOT_H)}H${X(BODY_W_BOTTOM / 2 - 0.2)}Q${X(BODY_W_BOTTOM / 2)} ${Y(FOOT_H)} ${X(BODY_W_BOTTOM / 2 - 0.03)} ${Y(FOOT_H + 0.2)}L${X(BODY_W_TOP / 2 + 0.03)} ${Y(FOOT_H + BODY_H - 0.2)}Q${X(BODY_W_TOP / 2)} ${Y(FOOT_H + BODY_H)} ${X(BODY_W_TOP / 2 - 0.2)} ${Y(FOOT_H + BODY_H)}H${X(-BODY_W_TOP / 2 + 0.2)}Q${X(-BODY_W_TOP / 2)} ${Y(FOOT_H + BODY_H)} ${X(-BODY_W_TOP / 2 - 0.03)} ${Y(FOOT_H + BODY_H - 0.2)}L${X(-BODY_W_BOTTOM / 2 + 0.03)} ${Y(FOOT_H + 0.2)}Q${X(-BODY_W_BOTTOM / 2)} ${Y(FOOT_H)} ${X(-BODY_W_BOTTOM / 2 + 0.2)} ${Y(FOOT_H)}Z" fill="${colors.body}" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/>`;
	const feet = [-1, 1].map((s) => `<rect x="${X(s * 0.85 - 0.11)}" y="${Y(FOOT_H)}" width="${r1(0.22 * S)}" height="${r1(FOOT_H * S)}" fill="${ink}"/>`).join("");
	const pan = `<rect x="${X(-0.3)}" y="${Y(PAN_Y)}" width="${r1(0.6 * S)}" height="${r1(0.1 * S)}" fill="${colors.steel}" stroke="${ink}" stroke-width="2.5"/><rect x="${X(-0.95)}" y="${Y(PAN_Y + 0.06)}" width="${r1(1.9 * S)}" height="${r1(0.06 * S)}" rx="2" fill="${colors.steel}" stroke="${ink}" stroke-width="2.5"/>`;

	// Visitors in the bowl, seen from the front, far ones first: in thin depth bands, each drawing
	// both arms, so neither color covers the other.
	const order = packBowl(arms.length)
		.map((p, i) => ({ p, arm: arms[i] }))
		.sort((u, v) => u.p.z - v.p.z);
	const BANDS = 24;
	const lines: string[] = [];
	for (let b = 0; b < BANDS; b++) {
		const band = order.slice(Math.floor((b * order.length) / BANDS), Math.floor(((b + 1) * order.length) / BANDS));
		for (const arm of ["A", "B"] as const) {
			const coords = band.filter((o) => o.arm === arm).map((o) => `${X(o.p.x)},${Y(o.p.y + BOWL_Y)}`);
			const id = arm === "A" ? ids.a : ids.b;
			if (coords.length) lines.push(`<polyline points="${coords.join(" ")}" fill="none" stroke="none" marker-start="url(#${id})" marker-mid="url(#${id})" marker-end="url(#${id})"/>`);
		}
	}
	const bowl = `<path d="M${X(-BOWL_R)} ${Y(BOWL_Y + BOWL_H)}A${r1(BOWL_R * S)} ${r1(BOWL_H * S)} 0 0 0 ${X(BOWL_R)} ${Y(BOWL_Y + BOWL_H)}" fill="${colors.glass}" fill-opacity="0.25" stroke="${ink}" stroke-width="3.5"/>`;

	// Dial: bezel, face, band track, ticks, numbers, true-lift pointer, units.
	const a0 = -DIAL_SWEEP / 2;
	const a1 = DIAL_SWEEP / 2;
	const ticks: string[] = [];
	for (let v = -max; v <= max; v += readings.tickStep) {
		const major = v % readings.labelStep === 0;
		ticks.push(`<path d="M${at(angle(v), major ? 0.83 : 0.9)}L${at(angle(v), 0.97)}" stroke="${ink}" stroke-width="${v === 0 ? 2.6 : major ? 1.6 : 0.8}" stroke-linecap="round"/>`);
	}
	const labels: string[] = [];
	for (let v = -max; v <= max; v += readings.labelStep) {
		const [x, y] = at(angle(v), 0.735).split(" ");
		labels.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Anton, Impact, sans-serif" font-size="11" fill="${ink}">${signed(v)}</text>`);
	}
	const t = angle(readings.trueLift);
	const pointer = `<path d="M${at(t, 0.8)}L${at(t - 0.075, 0.985)}L${at(t + 0.075, 0.985)}Z" fill="${colors.button}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
	const dial = [
		`<circle cx="${cx}" cy="${cy}" r="${r1(R + 5)}" fill="${colors.steel}" stroke="${ink}" stroke-width="3"/>`,
		`<circle cx="${cx}" cy="${cy}" r="${r1(R)}" fill="${colors.face}" stroke="${ink}" stroke-width="1.5"/>`,
		`<path d="${sector(a0, a1, BAND_INNER, BAND_OUTER)}" fill="#e4dcc6"/>`,
		pointer,
		...ticks,
		...labels,
		`<text x="${cx}" y="${r1(cy + 0.3 * R)}" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="9" fill="${ink}">B − A</text>`,
		`<text x="${cx}" y="${r1(cy + 0.42 * R)}" text-anchor="middle" font-family="Silkscreen, monospace" font-size="4" fill="${ink}">LIFT, POINTS</text>`,
	].join("");

	const reading = (state: string, r: Reading, fill: string, hidden: boolean) => {
		const b0 = angle(r.low);
		const b1 = angle(r.high);
		const n = angle(r.lift);
		return `<g data-fb-state="${state}"${hidden ? " hidden" : ""}><path d="${sector(b0, b1, BAND_INNER, BAND_OUTER)}" fill="${fill}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/><path d="M${at(n + Math.PI, 0.12)}L${at(n, 0.93)}" stroke="${ink}" stroke-width="3" stroke-linecap="round"/></g>`;
	};
	const last = readings.days[readings.days.length - 1];
	const hub = `<circle cx="${cx}" cy="${cy}" r="5" fill="${colors.steel}" stroke="${ink}" stroke-width="1.5"/>`;
	const bx = X(0.78);
	const by = Y(FOOT_H + 0.36);
	const button = `<circle cx="${bx}" cy="${by}" r="${r1(0.14 * S)}" fill="${colors.button}" stroke="${ink}" stroke-width="2.5"/><text x="${bx}" y="${r1(by + 0.5)}" text-anchor="middle" dominant-baseline="central" font-family="Anton, Impact, sans-serif" font-size="8" fill="${ink}">TARE</text>`;

	return [
		`<defs>${marker(ids.a, colors.control)}${marker(ids.b, colors.treatment)}</defs>`,
		`<ellipse cx="${OX}" cy="${OY + 2}" rx="${r1(1.5 * S)}" ry="9" fill="${ink}" opacity="0.15"/>`,
		feet,
		body,
		pan,
		lines.join(""),
		bowl,
		dial,
		reading("raw", last.raw, colors.rawBand, false),
		reading("cuped", last.cuped, colors.cupedBand, true),
		hub,
		button,
	].join("");
}
