// The gauge console's static fallback: the same 20 dials drawn flat, front-on, from the same run,
// so the page still shows real numbers when WebGL is unavailable (and before it loads). Pure string
// building, used at build time and, without WebGL, by the readout script to redraw it.
import { inRed, type Correction, type GaugeRun } from "../stats-sim/dashboard-runs";
import { COLS, DEFAULT_CONSOLE_COLORS, DIAL_HALF_SWEEP, DIAL_Z_MAX, ROWS, dialAngle } from "./gauge-dial";

const PITCH = 100;
const R = 37;
const CX = 280;
const CY = 230;
const PANEL_W = COLS * PITCH + 36;
const PANEL_H = ROWS * PITCH + 26;
const PX = CX - PANEL_W / 2;
const PY = CY - PANEL_H / 2;
/** Hood on top, ledge below and 22 px wider each side, plus room for the 6 px strokes. */
export const FALLBACK_VIEWBOX = `${PX - 22 - 12} ${PY - 26 - 12} ${PANEL_W + 44 + 24} ${PANEL_H + 26 + 18 + 24}`;

const c = DEFAULT_CONSOLE_COLORS;
const f = (n: number) => n.toFixed(1);

/** A point at `r` from (x, y), `a` radians clockwise from straight up (SVG y runs down). */
function at(x: number, y: number, r: number, a: number): [number, number] {
	return [x + r * Math.sin(a), y - r * Math.cos(a)];
}

function arc(x: number, y: number, r: number, a0: number, a1: number): string {
	const [x0, y0] = at(x, y, r, a0);
	const [x1, y1] = at(x, y, r, a1);
	return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

export function gaugeConsoleSvg(run: GaugeRun, mode: Correction): string {
	const line = run.redline[mode];
	const inner = dialAngle(line.z);
	const [panelW, panelH, px, py] = [PANEL_W, PANEL_H, PX, PY];
	const out: string[] = [];
	out.push(`<g stroke="${c.trim}" stroke-width="6" stroke-linejoin="round">`);
	out.push(`<rect x="${px - 22}" y="${py + panelH - 4}" width="${panelW + 44}" height="22" rx="8" fill="${c.dash}"/>`);
	out.push(`<rect x="${px}" y="${py}" width="${panelW}" height="${panelH}" rx="14" fill="${c.dash}"/>`);
	out.push(`<rect x="${px - 12}" y="${py - 26}" width="${panelW + 24}" height="30" rx="8" fill="${c.dash}"/>`);
	out.push(`</g>`);

	run.metrics.forEach((m, i) => {
		const x = CX + ((i % COLS) - (COLS - 1) / 2) * PITCH;
		const y = CY + (Math.floor(i / COLS) - (ROWS - 1) / 2) * PITCH;
		out.push(`<circle cx="${x}" cy="${y}" r="${R}" fill="${c.face}" stroke="${c.trim}" stroke-width="8"/>`);
		if (inner < DIAL_HALF_SWEEP) {
			const band = `stroke="${c.redline}" stroke-width="7" fill="none"`;
			out.push(`<path d="${arc(x, y, R - 8, inner, DIAL_HALF_SWEEP)}" ${band}/>`);
			out.push(`<path d="${arc(x, y, R - 8, -DIAL_HALF_SWEEP, -inner)}" ${band}/>`);
		}
		for (let z = -DIAL_Z_MAX; z <= DIAL_Z_MAX; z++) {
			const a = dialAngle(z);
			const [x0, y0] = at(x, y, z === 0 ? R - 15 : R - 10, a);
			const [x1, y1] = at(x, y, R - 4, a);
			out.push(`<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${c.ink}" stroke-width="${z === 0 ? 2.5 : 1.5}"/>`);
		}
		const flagged = inRed(m.z, line);
		const lamp = flagged ? (m.is_null ? c.null : c.lift) : c.lampOff;
		out.push(`<rect x="${x - 6}" y="${y + 19}" width="12" height="5" rx="2" fill="${lamp}" stroke="${c.trim}" stroke-width="1"/>`);
		out.push(
			`<text x="${x}" y="${y + 15}" text-anchor="middle" font-size="9" font-family="Silkscreen, monospace" fill="${c.ink}">${m.number}</text>`,
		);
		const [nx, ny] = at(x, y, R - 6, dialAngle(m.z));
		out.push(`<line x1="${x}" y1="${y}" x2="${f(nx)}" y2="${f(ny)}" stroke="${c.ink}" stroke-width="3" stroke-linecap="round"/>`);
		out.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${c.trim}"/>`);
	});
	return out.join("");
}
