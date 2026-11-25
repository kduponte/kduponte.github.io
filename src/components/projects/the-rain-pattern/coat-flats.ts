// Chore coat flats, size M, drawn at 7 units per inch in a 460 x 300 box with center front at x 230.
// Chest 24 in flat (168 units, x 146 to 314), body length 29 in from the high point of the shoulder
// (y 34 to 237), across shoulder 19.5 in (x 162 to 298). The sleeves are straight bands, 8 in wide
// and 24 in long, set at 50 degrees from plumb so the pockets stay in view, with a 2.5 in cuff.

type Pt = [number, number];
export const COAT_BOX = { w: 460, h: 300 };
const CX = 230;

export interface CoatOptions {
	shell: string;
	thread: string;
	line?: string;
	/** The favicon ripple as a data URI, recolored for the woven label. */
	mark: string;
	/** Nao at its real size, filling the rectangle x, y, w, h (drawing units). */
	lining: (x: number, y: number, w: number, h: number) => string;
	/** Caption under each flat, centered at x. */
	caption: (text: string, x: number) => string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const path = (pts: Pt[], close = false) => pts.map(([x, y], i) => `${i ? "L" : "M"}${r1(x)} ${r1(y)}`).join(" ") + (close ? " Z" : "");

// One sleeve, the left one: a band of constant width from the armhole, shoulder point to underarm.
const TH = (50 * Math.PI) / 180;
const DIR: Pt = [-Math.sin(TH), Math.cos(TH)];
const PERP: Pt = [Math.cos(TH), Math.sin(TH)];
const SP: Pt = [162, 48]; // shoulder point
const UA: Pt = [146, 134.5]; // underarm
const SLEEVE = 168; // 24 in along the top
const SLEEVE_W = 56; // 8 in
const CUFF = 17.5; // 2.5 in
const along = (p: Pt, d: Pt, t: number): Pt => [p[0] + d[0] * t, p[1] + d[1] * t];
const CUFF_OUT = along(SP, DIR, SLEEVE);
const CUFF_IN = along(CUFF_OUT, PERP, SLEEVE_W);
const BAND_OUT = along(CUFF_OUT, DIR, -CUFF);
const BAND_IN = along(CUFF_IN, DIR, -CUFF);
const HPS: Pt = [206, 34]; // high point of the shoulder
const HEM: Pt = [148, 237];
const mirror = ([x, y]: Pt): Pt => [2 * CX - x, y];
const LEFT: Pt[] = [HPS, SP, CUFF_OUT, CUFF_IN, UA, HEM];
const OUTLINE = `${path([...LEFT, ...LEFT.map(mirror).reverse()])} Q${CX} 28 ${HPS[0]} ${HPS[1]} Z`;

const BUTTONS = [84, 113, 142, 171, 200];
// Damask label, 1.7 x 1.1 in, black, with the ripple woven in white, sewn on the chest pocket.
const LABEL = { x: 262, y: 103, w: 12, h: 8 };

export function coatFlats({ shell, thread, line = "#111", mark, lining, caption }: CoatOptions) {
	const ts = `fill="none" stroke="${thread}" stroke-width="1.1" stroke-dasharray="3 2.4"`;
	const ln = `stroke="${line}" stroke-width="2.2" stroke-linejoin="round"`;
	const thin = `fill="none" stroke="${line}" stroke-width="1.3"`;
	const both = (f: (m: (p: Pt) => Pt) => string) => f((p) => p) + f(mirror);

	// Armholes, topstitched; cuff bands with a button each; side seams; the hem's topstitching.
	const armhole = both((m) => {
		const [a, b] = [m(SP), m(UA)];
		const s = a[0] < CX ? 1 : -1;
		return `<path d="M${a[0]} ${a[1]} Q${a[0] - 6 * s} ${(a[1] + b[1]) / 2} ${b[0]} ${b[1]}" ${thin}/><path d="M${a[0] + 3 * s} ${a[1] + 2} Q${a[0] - 3 * s} ${(a[1] + b[1]) / 2} ${b[0] + 3 * s} ${b[1] - 2}" ${ts}/>`;
	});
	const cuffs = both((m) => {
		const [a, b] = [m(BAND_OUT), m(BAND_IN)];
		const btn = m(along(along(BAND_IN, PERP, -8), DIR, CUFF / 2));
		return `<path d="${path([a, b])}" ${thin} stroke-width="1.8"/><path d="${path([m(along(BAND_OUT, DIR, 3.5)), m(along(BAND_IN, DIR, 3.5))])}" ${ts}/><circle cx="${r1(btn[0])}" cy="${r1(btn[1])}" r="2.5" fill="${shell}" stroke="${line}" stroke-width="1.2"/>`;
	});
	const sides = both((m) => `<path d="${path([m(UA), m(HEM)])}" ${thin}/>`);
	const shellBody = `<path d="${OUTLINE}" fill="${shell}" ${ln}/>${armhole}${sides}`;
	const hemStitch = `<path d="M${HEM[0] + 2} 232 H${2 * CX - HEM[0] - 2}" ${ts}/>`;

	// A patch pocket, drawn through f so the open view can swing it with its front.
	const pocket = (f: (p: Pt) => Pt, x: number, y: number, w: number, h: number) =>
		`<path d="${path(([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as Pt[]).map(f), true)}" fill="${shell}" ${ln}/>` +
		`<path d="${path(([[x + 3, y + 2.5], [x + 3, y + h - 3], [x + w - 3, y + h - 3], [x + w - 3, y + 2.5]] as Pt[]).map(f))}" ${ts}/>` +
		`<path d="${path(([[x, y + 6], [x + w, y + 6]] as Pt[]).map(f))}" ${ts}/>`;
	const chest = (f: (p: Pt) => Pt, k = 1) => {
		const [lx, ly] = f([LABEL.x + LABEL.w / 2, LABEL.y]);
		return pocket(f, 252, 90, 32, 36) + `<path d="${path(([[263, 90], [263, 100]] as Pt[]).map(f))}" ${ts}/>` + label(lx - (LABEL.w * k) / 2, ly, LABEL.w * k, LABEL.h, false);
	};
	function label(x: number, y: number, w: number, h: number, big: boolean) {
		const m = h * 0.78;
		return (
			`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${big ? 2 : 0.6}" fill="#151515" stroke="${line}" stroke-width="${big ? 1.6 : 0.8}"/>` +
			`<image href="${mark}" x="${r1(x + (w - m) / 2)}" y="${r1(y + (h - m) / 2)}" width="${r1(m)}" height="${r1(m)}"/>` +
			(big ? `<path d="M${x + 3} ${y + 3} H${x + w - 3} V${y + h - 3} H${x + 3} Z" fill="none" stroke="#6a6a6a" stroke-width="0.9" stroke-dasharray="2.4 1.8"/>` : "")
		);
	}
	const collar = `<path d="M206 34 Q230 46 254 34" fill="none" stroke="${line}" stroke-width="1.6"/>
		<path d="M206 34 L184 42 L210 78 L228 60 Z" fill="${shell}" ${ln}/><path d="M254 34 L276 42 L250 78 L232 60 Z" fill="${shell}" ${ln}/>
		<path d="M188 43 L209 72 M272 43 L251 72" ${ts}/>`;
	const id = (p: Pt) => p;

	// Outside front, with the label called out larger beside it.
	const lc: Pt = [LABEL.x + LABEL.w / 2, LABEL.y + LABEL.h / 2];
	const callout = `<circle cx="${lc[0]}" cy="${lc[1]}" r="10" fill="none" stroke="${line}" stroke-width="1"/>
		<path d="M${lc[0] + 10} ${lc[1] - 2} L386 72" stroke="${line}" stroke-width="1"/>
		${label(386, 48, 64, 44, true)}
		<text x="418" y="106" text-anchor="middle" font-size="9" font-family="Silkscreen, monospace" fill="${line}">DAMASK LABEL</text>`;
	const front = `${shellBody}${hemStitch}${collar}
		<path d="M228 60 V237 M236 58 V237" ${thin} stroke-width="1.6"/><path d="M239 60 V232" ${ts}/>
		${BUTTONS.map((y) => `<circle cx="232" cy="${y}" r="3.1" fill="${shell}" stroke="${line}" stroke-width="1.4"/><path d="M230.6 ${y} h2.8" stroke="${line}" stroke-width="0.8"/>`).join("")}
		${chest(id)}${pocket(id, 160, 158, 50, 54)}${pocket(id, 250, 158, 50, 54)}${cuffs}${callout}
		${caption("Outside front", CX)}`;

	// Outside back: the collar folded down over its stand, and a center seam down the spine,
	// felled and topstitched each side.
	const back = `${shellBody}${hemStitch}
		<path d="M204 34 Q230 26 256 34 L258 44 Q230 36 202 44 Z" fill="${shell}" ${ln}/><path d="M205 41 Q230 33 255 41" ${ts}/>
		<path d="M230 41 V237" ${thin} stroke-width="1.6"/><path d="M226.5 44 V232 M233.5 44 V232" ${ts}/>
		${cuffs}
		${caption("Outside back", CX)}`;

	// Open: unbuttoned, the fronts hang open from the collar. Each front turns away toward its side
	// seam, so what's sewn on it narrows with it, and the inside shows between them: Nao on the
	// lining, a plain back-neck facing with the woven neck label, a plain hem facing, and the front
	// facings rolling along each edge. Buttons sit on the left front; buttonholes on the right placket.
	const EL: [Pt, Pt] = [[226, 62], [188, 237]];
	const ER: [Pt, Pt] = [[234, 62], [272, 237]];
	const at = (e: [Pt, Pt], y: number) => e[0][0] + ((e[1][0] - e[0][0]) * (Math.max(y, 62) - 62)) / 175;
	const [sL, sR] = [147, 313]; // side seams
	const toL = ([x, y]: Pt): Pt => [sL + ((x - sL) * (at(EL, y) - sL)) / (240 - sL), y]; // the left front closes to x 240, under the placket
	const toR = ([x, y]: Pt): Pt => [sR - ((sR - x) * (sR - at(ER, y))) / (sR - 228), y];
	const gap: Pt[] = [EL[0], EL[1], ER[1], ER[0]];
	const reveal = `${path(gap)} L254 34 Q${CX} 46 206 34 Z`;
	const roll = (e: [Pt, Pt], s: number): Pt[] => [e[0], e[1], [e[1][0] + 8 * s, e[1][1]], [e[0][0] + 2 * s, e[0][1] + 4]];
	const yHem = 227;
	const open = `<defs><clipPath id="coat-open"><path d="${reveal}"/></clipPath></defs>
		${shellBody}${hemStitch}
		<g clip-path="url(#coat-open)">
			${lining(196, 30, 68, 210)}
			<path d="M196 30 H264 V64 Q${CX} 72 196 64 Z" fill="${shell}"/><path d="M196 64 Q${CX} 72 264 64" ${thin}/><path d="M196 61 Q${CX} 69 264 61" ${ts}/>
			<path d="${path([[at(EL, yHem), yHem], [at(ER, yHem), yHem], ER[1], EL[1]], true)}" fill="${shell}"/><path d="M196 ${yHem} H264" ${thin}/><path d="M196 ${yHem + 3} H264" ${ts}/>
			<rect x="223" y="44" width="14" height="8" fill="#f3f3f1" stroke="${line}" stroke-width="0.9"/>
			<path d="${path(roll(EL, 1), true)}" fill="${shell}" ${thin}/><path d="${path(roll(ER, -1), true)}" fill="${shell}" ${thin}/>
		</g>
		<path d="${path([EL[0], EL[1]])} M${ER[0][0]} ${ER[0][1]} L${ER[1][0]} ${ER[1][1]}" fill="none" ${ln}/>
		${collar}
		<path d="${path([toR([236, 58]), toR([236, 237])])}" ${thin} stroke-width="1.6"/><path d="${path([toR([239, 60]), toR([239, 232])])}" ${ts}/>
		${BUTTONS.map((y) => `<path d="${path([toR([229.5, y]), toR([234.5, y])])}" stroke="${line}" stroke-width="1.3"/>`).join("")}
		${BUTTONS.map((y) => { const [x] = toL([232, y]); return `<circle cx="${r1(x)}" cy="${y}" r="3.1" fill="${shell}" stroke="${line}" stroke-width="1.4"/><path d="M${r1(x - 1.4)} ${y} h2.8" stroke="${line}" stroke-width="0.8"/>`; }).join("")}
		${chest(toR, (sR - at(ER, LABEL.y)) / (sR - 228))}${pocket(toL, 160, 158, 50, 54)}${pocket(toR, 250, 158, 50, 54)}${cuffs}
		${caption("Open", CX)}`;

	return { front, back, open };
}
