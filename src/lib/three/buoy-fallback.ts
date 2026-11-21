// The static stand-in for the 3D buoy diorama, shown until WebGL mounts and kept if it can't:
// the same scene cut side-on along the swell's direction of travel, drawn from the same numbers.
// Crest spacing is the true wavelength on the 400 m patch, heights carry the same exaggeration,
// the buoy is drawn at the same instrument scale, and the phase matches the 3D still frame (a
// crest under the buoy at t = 0). One group per station; the readout script shows the active one.
import {
	DISCUS_ANEMOMETER_HEIGHT_M,
	DISCUS_DECK_M,
	DISCUS_DIAMETER_M,
	DISCUS_TOWER_APEX_M,
	SEAL_CAGE_HEIGHT_M,
	SEAL_CAGE_INSET_M,
	WAVERIDER_DIAMETER_M,
} from "./buoy-model";
import { INSTRUMENT_UNITS_PER_M, type DioramaStation } from "./buoy-diorama";
import { temperatureDomain, waterColor } from "./water-color";
import {
	BASE_H,
	BASE_MARGIN,
	BLOCK_DEPTH,
	DEFAULT_OCEAN_COLORS,
	FORECAST_TRACE_WIDTH,
	OBSERVED_TRACE_WIDTH,
	TRACE_EDGE,
	TILE,
	forecastTraces,
	swellField,
} from "./ocean";

/** SVG pixels per scene unit. */
export const FALLBACK_PX_PER_UNIT = 84;
const P = FALLBACK_PX_PER_UNIT;
const W = 640;
/** The waterline sits low enough for the discus's mast to fit above it. */
const WATERLINE = 262;
const H = Math.ceil(WATERLINE + (BLOCK_DEPTH + BASE_H) * P + 10);
const CX = W / 2;
const SAMPLES = 160;
const INK = DEFAULT_OCEAN_COLORS.outline;

export const FALLBACK_VIEWBOX = `0 0 ${W} ${H}`;

const f1 = (n: number) => n.toFixed(1);

/** The drawn profile of one station's swell, in SVG coordinates. */
export function fallbackProfile(s: DioramaStation): { points: [number, number][]; amplitudePx: number; wavelengthPx: number } {
	const f = swellField(s.observed);
	const points: [number, number][] = [];
	for (let i = 0; i <= SAMPLES; i++) {
		const u = -TILE / 2 + (TILE * i) / SAMPLES; // scene units along the travel direction
		points.push([CX + u * P, WATERLINE - f.amplitude * Math.cos(f.k * u) * P]);
	}
	return { points, amplitudePx: f.amplitude * P, wavelengthPx: f.k > 0 ? ((2 * Math.PI) / f.k) * P : 0 };
}

const line = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}`;

/** A buoy side on, its axis at `cx` and still water at `y`, drawn at `m` px per metre. */
export function buoySilhouetteSvg(instrument: DioramaStation["instrument"], cx: number, y: number, m: number): string {
	const yellow = "#ffd400";
	if (instrument === "discus") {
		const r = (DISCUS_DIAMETER_M / 2) * m;
		const deck = y - DISCUS_DECK_M * m;
		const apex = y - DISCUS_TOWER_APEX_M * m;
		// Seal cage, side on: the bars at their projected positions, a mid rail and a top rail.
		const cageR = (DISCUS_DIAMETER_M / 2 - SEAL_CAGE_INSET_M) * m;
		const cageTop = deck - SEAL_CAGE_HEIGHT_M * m;
		const cageXs = Array.from({ length: 12 }, (_, i) => cx + Math.cos(((i + 0.5) / 12) * Math.PI) * cageR);
		const cage = `<path d="${cageXs.map((x) => `M${f1(x)} ${f1(deck)}V${f1(cageTop)}`).join("")}M${f1(cx - cageR)} ${f1(cageTop)}H${f1(cx + cageR)}M${f1(cx - cageR)} ${f1((deck + cageTop) / 2)}H${f1(cx + cageR)}" fill="none" stroke="#d6dadd" stroke-width="2.5"/>
<path d="M${f1(cx - cageR)} ${f1(deck)}V${f1(cageTop)}H${f1(cx + cageR)}V${f1(deck)}" fill="none" stroke-width="1.5"/>`;
		const arm = y - (DISCUS_ANEMOMETER_HEIGHT_M - 0.22) * m;
		const vane = y - DISCUS_ANEMOMETER_HEIGHT_M * m;
		return `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M${f1(cx - 0.78 * m)} ${f1(deck)}L${f1(cx - 0.12 * m)} ${f1(apex)}M${f1(cx + 0.78 * m)} ${f1(deck)}L${f1(cx + 0.12 * m)} ${f1(apex)}M${f1(cx)} ${f1(deck)}L${f1(cx)} ${f1(apex)}" stroke="#d6dadd" stroke-width="4"/>
<path d="M${f1(cx - 0.78 * m)} ${f1(deck)}L${f1(cx - 0.12 * m)} ${f1(apex)}L${f1(cx + 0.12 * m)} ${f1(apex)}L${f1(cx + 0.78 * m)} ${f1(deck)}" fill="none" stroke-width="2"/>
${cage}
<rect x="${f1(cx - 0.4 * m)}" y="${f1(y - 2.08 * m)}" width="${f1(0.8 * m)}" height="${f1(0.95 * m)}" fill="#1f2a44" stroke-width="2"/>
<path d="M${f1(cx)} ${f1(apex)}V${f1(arm)}M${f1(cx - 0.7 * m)} ${f1(arm)}H${f1(cx + 0.7 * m)}M${f1(cx - 0.7 * m)} ${f1(arm)}V${f1(vane)}M${f1(cx + 0.7 * m)} ${f1(arm)}V${f1(vane)}" fill="none" stroke-width="3"/>
<rect x="${f1(cx - 0.7 * m - 0.21 * m)}" y="${f1(vane - 0.035 * m)}" width="${f1(0.42 * m)}" height="${f1(0.07 * m)}" fill="${INK}"/>
<rect x="${f1(cx + 0.7 * m - 0.21 * m)}" y="${f1(vane - 0.035 * m)}" width="${f1(0.42 * m)}" height="${f1(0.07 * m)}" fill="${INK}"/>
<rect x="${f1(cx - 0.07 * m)}" y="${f1(arm - 0.2 * m)}" width="${f1(0.14 * m)}" height="${f1(0.15 * m)}" fill="#fff1a6" stroke-width="2"/>
<path d="M${f1(cx - r)} ${f1(deck + 0.08 * m)}Q${f1(cx - r)} ${f1(deck)} ${f1(cx - r + 0.07 * m)} ${f1(deck)}H${f1(cx + r - 0.07 * m)}Q${f1(cx + r)} ${f1(deck)} ${f1(cx + r)} ${f1(deck + 0.08 * m)}V${f1(y + 0.28 * m)}L${f1(cx + 1.15 * m)} ${f1(y + 0.55 * m)}H${f1(cx - 1.15 * m)}L${f1(cx - r)} ${f1(y + 0.28 * m)}Z" fill="${yellow}" stroke-width="4"/>
</g>`;
	}
	const r = (WAVERIDER_DIAMETER_M / 2) * m;
	const c = y - 0.03 * m;
	const hatch = c - r;
	return `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M${f1(cx)} ${f1(hatch)}V${f1(hatch - 0.9 * m)}" stroke-width="1.5"/>
<rect x="${f1(cx - 0.045 * m)}" y="${f1(hatch - 0.36 * m)}" width="${f1(0.09 * m)}" height="${f1(0.09 * m)}" fill="#fff1a6" stroke-width="1.5"/>
<path d="M${f1(cx)} ${f1(hatch)}V${f1(hatch - 0.27 * m)}" stroke="#d6dadd" stroke-width="2.5"/>
<circle cx="${f1(cx)}" cy="${f1(c)}" r="${f1(r)}" fill="${yellow}" stroke-width="3"/>
<rect x="${f1(cx - 0.2 * m)}" y="${f1(hatch - 0.04 * m)}" width="${f1(0.4 * m)}" height="${f1(0.07 * m)}" fill="#d6dadd" stroke-width="1.5"/>
<path d="M${f1(cx - r - 0.06 * m)} ${f1(c)}H${f1(cx + r + 0.06 * m)}" stroke-width="${f1(0.09 * m)}"/>
</g>`;
}

function buoySvg(s: DioramaStation, y: number): string {
	return buoySilhouetteSvg(s.instrument, CX, y, INSTRUMENT_UNITS_PER_M * P);
}

/** One station's group: plinth, water (in its temperature color), forecast traces, the real swell's line, and the buoy. */
export function fallbackStationSvg(s: DioramaStation, waterFill: string = DEFAULT_OCEAN_COLORS.water): string {
	const { points } = fallbackProfile(s);
	const f = swellField(s.observed);
	const left = CX - (TILE / 2) * P;
	const right = CX + (TILE / 2) * P;
	const floor = WATERLINE + BLOCK_DEPTH * P;
	const base = `<rect x="${f1(left - BASE_MARGIN * P)}" y="${f1(floor)}" width="${f1((TILE + 2 * BASE_MARGIN) * P)}" height="${f1(BASE_H * P)}" rx="6" fill="${DEFAULT_OCEAN_COLORS.base}" stroke="${INK}" stroke-width="4"/>`;
	const water = `<path d="${line(points)}L${f1(right)} ${f1(floor)}L${f1(left)} ${f1(floor)}Z" fill="${waterFill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
	const traces = forecastTraces(s.observed.wave_height_m, s.forecasts)
		.map((tr) => {
			const pts = points.map(([x], i): [number, number] => [x, WATERLINE - (WATERLINE - points[i][1]) * tr.heightScale]);
			const d = line(pts);
			return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f1((FORECAST_TRACE_WIDTH + 2 * TRACE_EDGE) * P)}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${tr.color}" stroke-width="${f1(FORECAST_TRACE_WIDTH * P)}" stroke-linejoin="round"/>`;
		})
		.join("");
	const observed = `<path d="${line(points)}" fill="none" stroke="${INK}" stroke-width="${f1(OBSERVED_TRACE_WIDTH * P)}" stroke-linejoin="round"/>`;
	return `${base}${water}${observed}${traces}${buoySvg(s, WATERLINE - f.amplitude * P)}`;
}

/** Every station's group, all hidden but `active`. */
export function fallbackSvgGroups(stations: DioramaStation[], active = 0): string {
	const domain = temperatureDomain(stations.map((s) => s.observed.water_temp_c));
	return stations
		.map(
			(s, i) =>
				`<g data-fallback-station="${i}"${i === active ? "" : ' display="none"'}>${fallbackStationSvg(s, waterColor(s.observed.water_temp_c, domain))}</g>`,
		)
		.join("");
}

/** One buoy in the fleet lineup fallback. */
export interface FleetFallbackItem {
	instrument: DioramaStation["instrument"];
	/** Horizontal reach from the buoy's axis, metres. */
	reach: number;
	region: string;
}

/**
 * The static stand-in for "The twelve buoys": every buoy side on, at one scale, in the 3D view's
 * order (region by region, west to east), hulls `gap` metres apart and a metre more between
 * regions, on a band of water cut `blockDepth` below still water, with a scale bar in 1 m steps.
 * Sized to the 3D view's box so the two swap without a jump.
 */
export function fleetFallbackSvg(items: FleetFallbackItem[], o: { tallest: number; blockDepth: number; gap: number; aspect: number }): { viewBox: string; svg: string } {
	const VW = 640;
	const VH = Math.round(VW / o.aspect);
	const margin = 0.5;
	const regionGap = o.gap + 1;
	let xm = margin;
	const centers = items.map((it, i) => {
		if (i > 0) xm += items[i - 1].reach + (items[i - 1].region === it.region ? o.gap : regionGap) + it.reach;
		else xm += it.reach;
		return xm;
	});
	const totalM = xm + items[items.length - 1].reach + margin;
	const m = VW / totalM;
	const contentH = (o.tallest + o.blockDepth) * m;
	const waterline = (VH - contentH) / 2 + o.tallest * m;
	const left = margin * m;
	const right = VW - margin * m;
	const floor = waterline + o.blockDepth * m;
	const water = `<rect x="${f1(left)}" y="${f1(waterline)}" width="${f1(right - left)}" height="${f1(floor - waterline)}" fill="${DEFAULT_OCEAN_COLORS.water}" stroke="${INK}" stroke-width="2"/>`;
	const steps = Math.floor((right - left) / m);
	const bar = Array.from({ length: steps }, (_, i) => `<rect x="${f1(left + i * m)}" y="${f1(floor + 4)}" width="${f1(m)}" height="4" fill="${i % 2 ? DEFAULT_OCEAN_COLORS.paper : INK}" stroke="${INK}" stroke-width="0.5"/>`).join("");
	const buoys = items.map((it, i) => buoySilhouetteSvg(it.instrument, centers[i] * m, waterline, m)).join("");
	return { viewBox: `0 0 ${VW} ${VH}`, svg: `${water}${bar}${buoys}` };
}
