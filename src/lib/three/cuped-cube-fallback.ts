// The static stand-in for the 3D CUPED cube, shown until WebGL mounts and kept if it can't: the
// same cube and the same 1,200 visitors in an oblique drawing (front face true to scale, depth
// receding up and to the right, day 1 at the back), in two states, raw and adjusted, that the
// viewer's readout can switch between. Dots are polyline vertex markers so the markup stays small.
import { postAxisPosition, postAxisTicks, varianceAt, writeCloudCoordinates, type CupedCloud } from "../stats-sim/cuped-cloud";
import { CUBE_HALF, DATA_HALF, DEFAULT_CUPED_CUBE_COLORS, type CupedCubeColors } from "./cuped-cube-model";

export const FALLBACK_VIEWBOX = "0 0 400 350";
const LEFT = 62;
const TOP = 82;
/** Front face side, px (the cube's 2 units). */
const FACE = 216;
/** Where the back face sits relative to the front one. */
const DEPTH_DX = 54;
const DEPTH_DY = -42;
const PX = FACE / (2 * CUBE_HALF);

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Screen point of a scene-space position (x right, y up from the cube center, z toward the viewer). */
function project(x: number, y: number, z: number): [number, number] {
	const k = (CUBE_HALF - z) / (2 * CUBE_HALF);
	return [r1(LEFT + FACE / 2 + x * PX + k * DEPTH_DX), r1(TOP + FACE / 2 - y * PX + k * DEPTH_DY)];
}

function cloudGroup(cloud: CupedCloud, t: number, state: string, ids: { a: string; b: string }, colors: CupedCubeColors): string {
	const coords = writeCloudCoordinates(cloud, t, new Float32Array(cloud.visitors.length * 3));
	const days = cloud.config.days;
	const lines: string[] = [];
	// Back to front, one layer per day, so nearer visitors overlap farther ones.
	for (let day = 1; day <= days; day++) {
		for (const arm of ["A", "B"] as const) {
			const pts: string[] = [];
			cloud.visitors.forEach((v, i) => {
				if (v.day !== day || v.arm !== arm) return;
				const [px, py] = project(DATA_HALF * coords[i * 3], DATA_HALF * coords[i * 3 + 1], DATA_HALF * coords[i * 3 + 2]);
				pts.push(`${px},${py}`);
			});
			const id = arm === "A" ? ids.a : ids.b;
			if (pts.length) lines.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="none" marker-start="url(#${id})" marker-mid="url(#${id})" marker-end="url(#${id})"/>`);
		}
	}
	// Mean +/- 1 SD bracket, beside the right face at the front edge.
	const sd = Math.sqrt(varianceAt(cloud, t));
	const center = DATA_HALF * postAxisPosition(cloud, cloud.yMean);
	const half = (DATA_HALF * sd) / cloud.config.y_sd / cloud.halfRangeSd;
	const [bx, by0] = project(CUBE_HALF + 0.14, center - half, CUBE_HALF);
	const [, by1] = project(CUBE_HALF + 0.14, center + half, CUBE_HALF);
	const bracket = `<path d="M${bx} ${by0}V${by1}M${r1(bx - 8)} ${by0}H${r1(bx + 8)}M${r1(bx - 8)} ${by1}H${r1(bx + 8)}" stroke="${colors.ink}" stroke-width="7" stroke-linecap="round"/><path d="M${bx} ${by0}V${by1}M${r1(bx - 8)} ${by0}H${r1(bx + 8)}M${r1(bx - 8)} ${by1}H${r1(bx + 8)}" stroke="${colors.bracket}" stroke-width="3.5" stroke-linecap="round"/>`;
	return `<g data-fb-state="${state}"${t > 0 ? " hidden" : ""}>${lines.join("")}${bracket}</g>`;
}

/**
 * The fallback's inner SVG markup. `idPrefix` keeps the dot markers' ids unique when more than one
 * cube is on a page.
 */
export function cubeFallbackSvg(cloud: CupedCloud, idPrefix: string, colors: CupedCubeColors = DEFAULT_CUPED_CUBE_COLORS): string {
	const ids = { a: `${idPrefix}-a`, b: `${idPrefix}-b` };
	const marker = (id: string, fill: string) =>
		`<marker id="${id}" viewBox="-3 -3 6 6" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" overflow="visible"><circle r="2.3" fill="${fill}" stroke="${colors.ink}" stroke-width="1"/></marker>`;

	const c = CUBE_HALF;
	const corner = (x: number, y: number, z: number) => project(x * c, y * c, z * c).join(" ");
	const edge = (a: [number, number, number], b: [number, number, number]) => `M${corner(...a)}L${corner(...b)}`;
	const back = [
		edge([-1, -1, -1], [1, -1, -1]),
		edge([-1, -1, -1], [-1, 1, -1]),
		edge([-1, -1, -1], [-1, -1, 1]),
	].join("");
	const front = [
		edge([-1, -1, 1], [1, -1, 1]),
		edge([1, -1, 1], [1, 1, 1]),
		edge([1, 1, 1], [-1, 1, 1]),
		edge([-1, 1, 1], [-1, -1, 1]),
		edge([-1, 1, 1], [-1, 1, -1]),
		edge([-1, 1, -1], [1, 1, -1]),
		edge([1, 1, 1], [1, 1, -1]),
		edge([1, 1, -1], [1, -1, -1]),
		edge([1, -1, 1], [1, -1, -1]),
	].join("");

	// Plinth: front face and top, a little wider than the cube.
	const p = 0.16;
	const [fx0, fy] = project(-c - p, -c - 0.03, c + p);
	const [fx1] = project(c + p, -c - 0.03, c + p);
	const [bx1, by] = project(c + p, -c - 0.03, -c - p);
	const plinth = `<path d="M${fx0} ${fy}H${fx1}L${bx1} ${by}H${r1(bx1 - (fx1 - fx0))}Z" fill="${colors.plinth}" stroke="${colors.ink}" stroke-width="4" stroke-linejoin="round"/><path d="M${fx0} ${fy}H${fx1}V${r1(fy + 26)}H${fx0}Z" fill="${colors.plinth}" stroke="${colors.ink}" stroke-width="4" stroke-linejoin="round"/><path d="M${fx1} ${fy}L${bx1} ${by}V${r1(by + 26)}L${fx1} ${r1(fy + 26)}Z" fill="${colors.plinth}" stroke="${colors.ink}" stroke-width="4" stroke-linejoin="round"/>`;

	const ticks = postAxisTicks(cloud)
		.map((v) => {
			const [x, y] = project(-c, DATA_HALF * postAxisPosition(cloud, v), c);
			return `M${r1(x - 9)} ${y}H${x}`;
		})
		.join("");

	return [
		`<defs>${marker(ids.a, colors.control)}${marker(ids.b, colors.treatment)}</defs>`,
		plinth,
		`<path d="${back}" fill="none" stroke="${colors.ink}" stroke-width="3" stroke-linecap="round"/>`,
		cloudGroup(cloud, 0, "raw", ids, colors),
		cloudGroup(cloud, 1, "adjusted", ids, colors),
		`<path d="${front}" fill="none" stroke="${colors.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
		`<path d="${ticks}" stroke="${colors.ink}" stroke-width="2.5"/>`,
	].join("");
}
