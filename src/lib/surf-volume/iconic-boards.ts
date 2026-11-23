/**
 * The iconic boards behind The Volume Gap's 3D hero: which size of each model to show, where it
 * sits against the calculators' recommendations for the page's default surfer, and how its
 * volume is known (published, or estimated by a documented method).
 *
 * Data: public/data/surf-volume/iconic_boards.json (hand-curated, with source URLs).
 */
import type { BoardShape, TailKind } from "../three/surfboard-morph";
import type { ConsensusStats, SystemComparisonRow } from "./types";

export type VolumeStatus = "published" | "estimated";

export interface BoardSizeRow {
	length: string;
	width_in: number;
	thickness_in: number;
	/** Null when no volume is published; resolveBoards fills it with estimateVolumeL. */
	volume_l: number | null;
	volume_status: VolumeStatus;
	/** Index into the board's sources. */
	source: number;
}

export interface BoardSource {
	label: string;
	url: string;
	note?: string;
}

export interface FinSpec {
	from_tail_in: number;
	off_center_in: number;
	/** Height of the fin below the bottom, and its base length, inches (published where the setup says so). */
	depth_in: number;
	base_in: number;
	template: "longboard" | "single" | "keel" | "stabilizer" | "thruster" | "soft";
	/** Published fin area, square inches: the outline's fullness is solved to match it. */
	area_in2?: number;
	/** Published sweep, degrees (the lean from mid-base to the tip). */
	sweep_deg?: number;
	/** This fin's box when it differs from the setup's, e.g. a 2+1's single center box. */
	box?: FinSetup["system"];
}

/** The fin system and fins a board is shown with. */
export interface FinSetup {
	/** How the fins attach, which decides the boxes painted on the bottom. */
	system: "fcs2" | "futures" | "us-box" | "glass-on" | "soft" | "screw-through";
	/** The fins shown, e.g. "FCS II Performer Neo Glass, Medium". */
	model: string;
	/** "published": base, depth, area (and sweep, if given) come from the fin maker or a retailer's spec table. */
	status: "published" | "estimated";
	source?: string;
	note?: string;
	/** Surface of the fins: solid glass, a honeycomb core under clear, molded resin, or soft foam. */
	finish: "neo-glass" | "honeycomb" | "performance-core" | "resin" | "soft";
	/** Fin box color on the bottom. */
	box_color?: string;
	/**
	 * Through-bolted fins (soft and screw-through systems), measured from the maker's photo: the
	 * caps on the deck the bolts seat in (two per fin), and the plug on the bottom, if one shows.
	 */
	plugs?: {
		cap_diameter_in: number;
		/** Center to center, along the board. */
		bolt_spacing_in: number;
		/** Defaults to the fin color. */
		cap_color?: string;
		bottom_length_in?: number;
		bottom_width_in?: number;
	};
}

/**
 * A laminate on the board: either one of the maker's own brand or model logos (`logo`, a key
 * into the data file's `logos`) or text typeset in one of the site's fonts (`text` with `font`),
 * kept for shaper signatures and construction marks; model names are never typeset on a deck.
 */
export interface LabelSpec {
	text?: string;
	logo?: string;
	side: "deck" | "bottom";
	/** Center of the label, inches back from the nose tip (or the tail, see anchor), and across from the stringer. */
	at_in: number;
	/** "tail": at_in counts forward from the tail, so a decal near the fins stays there as the board stretches. */
	anchor?: "nose" | "tail";
	z_in: number;
	/** Cap height for text, overall height for a logo, inches. */
	height_in: number;
	font?: "display" | "script" | "sans" | "mono";
	/** One color, or several laid left to right in hard bands (a multicolor logo). */
	color: string | string[];
	/** "along" reads down the stringer; "across" reads rail to rail with the nose up. */
	orient: "along" | "across";
	/** Optional laminate patch behind the label. */
	patch?: string;
}

/** A maker's brand or model logo file, where it came from, and how to color it on a board. */
export interface LogoSpec {
	/** Site path of the file (under public/). */
	file: string;
	source: string;
	from: string;
	/**
	 * alpha: recolor the logo's shape (white-on-transparent files); luma: its bright parts are the
	 * shape (white-on-black files); ink: its dark parts are the shape (black-on-white files);
	 * none: draw as-is; knockout: draw as-is minus the light ground around it (full-color art
	 * on white); key: drop one ground color (a logo cropped from a board photo); glyph: a
	 * character in an icon font file. Empty margins are trimmed.
	 */
	mask: "alpha" | "luma" | "ink" | "none" | "knockout" | "key" | "glyph";
	glyph?: string;
	/** knockout: luminance (0-1) at or above which the surround counts as ground; default 0.885. */
	ground?: number;
	/** knockout: flatten light pixels left inside the artwork to white (photo crops). */
	whiten?: boolean;
	/**
	 * knockout: "all" also clears light pixels enclosed by the artwork's lines (a laminate printed as
	 * outlines, where the board shows through), except inside `keep`.
	 */
	clear?: "surround" | "all";
	/** knockout with clear "all": regions, in file pixels [x, y, width, height], whose light fill stays. */
	keep?: [number, number, number, number][];
	/** key: the ground color to drop. */
	key?: string;
	/** Part of the file to use, in its pixels: [x, y, width, height] (drops captions and the like). */
	crop?: [number, number, number, number];
}

export interface ShapeSpec {
	wide_point_from_center_in: number;
	nose_width_12_in: number;
	tail_width_12_in: number;
	nose_tip: number;
	tail: { kind: TailKind; end_width_in: number; depth_in?: number; corner_in?: number; pin_roundness?: number };
	sting?: { from_tail_in: number; width_drop_frac: number; ramp_in: number };
	rocker_in: { nose: number; tail: number };
	foil: { nose_frac_12: number; tail_frac_12: number; thickest_from_center_in: number };
	rail: { apex_frac: number; deck_exp: number; bottom_exp: number };
	fin_layout: FinSpec[];
}

export interface IconicBoard {
	id: string;
	name: string;
	maker: string;
	style: string;
	construction: string;
	fins: string;
	fin_setup: FinSetup;
	/** Which painter draws its deck and bottom (see the hero's graphics module). */
	graphic: string;
	/** Surface finish; soft-tops are matte. Defaults to gloss. */
	finish?: "gloss" | "matte";
	colors: Record<string, string | string[]>;
	labels?: LabelSpec[];
	/**
	 * Models whose published box fill estimates this one's unpublished volumes, when it has no
	 * published sizes of its own. Pick the closest design family; omit to use the whole catalog.
	 */
	volume_reference_models?: string[];
	/** Show this stock size instead of the one nearest the median, and say why. */
	size_override?: { length: string; reason: string };
	sizes: BoardSizeRow[];
	sources: BoardSource[];
	shape: ShapeSpec;
}

export interface IconicBoardData {
	accessed: string;
	size_rule: string;
	logos?: Record<string, LogoSpec>;
	boards: IconicBoard[];
}

/** Inches from a length like 9'6" or 6'0. */
export function parseLengthIn(length: string): number {
	const m = /^\s*(\d+)\s*'\s*(\d+(?:\.\d+)?)?/.exec(length);
	if (!m) throw new Error(`Unrecognized board length: ${length}`);
	return Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0);
}

/** 9'6" style length from inches. */
export function formatLengthIn(inches: number): string {
	const ft = Math.floor(inches / 12 + 1e-9);
	const rest = Math.round((inches - ft * 12) * 10) / 10;
	return `${ft}'${rest}"`;
}

/** 20 5/8 style width from decimal inches (eighths), the way shapers write them. */
export function formatInches(v: number): string {
	const whole = Math.floor(v + 1e-9);
	const eighths = Math.round((v - whole) * 8);
	if (eighths === 0) return `${whole}"`;
	if (eighths === 8) return `${whole + 1}"`;
	const g = eighths % 4 === 0 ? 4 : eighths % 2 === 0 ? 2 : 1;
	return `${whole} ${eighths / g}/${8 / g}"`;
}

const CUBIC_INCH_L = 0.016387064;

/**
 * Volume estimate for a size with no published liters:
 *
 *   liters = length x width x thickness (cubic inches -> liters) x k
 *
 * where k is the median "box fill" (published liters / bounding-box liters) over the reference
 * rows: the same model's published sizes when it has any, otherwise the published sizes of the
 * models it names in volume_reference_models (its closest design family), otherwise every
 * published size in the catalog. The tests report the error of each fallback.
 */
export function estimateVolumeL(dims: { lengthIn: number; widthIn: number; thicknessIn: number }, references: { lengthIn: number; widthIn: number; thicknessIn: number; liters: number }[]): number {
	if (references.length === 0) throw new Error("No published volumes to estimate from");
	const fills = references.map((r) => r.liters / (r.lengthIn * r.widthIn * r.thicknessIn * CUBIC_INCH_L)).sort((a, b) => a - b);
	const mid = fills.length / 2;
	const k = fills.length % 2 ? fills[Math.floor(mid)] : (fills[mid - 1] + fills[mid]) / 2;
	return dims.lengthIn * dims.widthIn * dims.thicknessIn * CUBIC_INCH_L * k;
}

/** The size whose liters sit closest to `targetL`; ties go to the shorter board. */
export function pickNearestSize<T extends { volume_l: number }>(sizes: T[], targetL: number): T {
	let best = sizes[0];
	for (const s of sizes) {
		const d = Math.abs(s.volume_l - targetL);
		const bd = Math.abs(best.volume_l - targetL);
		if (d < bd - 1e-9) best = s;
	}
	return best;
}

export type RangeBand = "below-all" | "below-middle" | "middle" | "above-middle" | "above-all";

export interface RangePlacement {
	liters: number;
	/** Liters above (+) or below (-) the calculators' median. */
	vsMedianL: number;
	band: RangeBand;
	/** Calculators recommending less than this board holds, and how many recommend at all. */
	nBelow: number;
	n: number;
	sentence: string;
}

/** Where a board's liters land against the calculators' recommendations for one surfer. */
export function placeAgainstRange(liters: number, consensus: ConsensusStats, rows: Pick<SystemComparisonRow, "recommended_volume_point_l">[]): RangePlacement {
	const points = rows.map((r) => r.recommended_volume_point_l).filter((v): v is number => v !== null);
	const n = points.length;
	const nBelow = points.filter((v) => v < liters).length;
	const { median, min, max, q25, q75 } = consensus;
	if (median === null || min === null || max === null || q25 === null || q75 === null) {
		throw new Error("Consensus is missing its quantiles");
	}
	const vsMedianL = liters - median;
	const band: RangeBand = liters > max ? "above-all" : liters < min ? "below-all" : liters > q75 ? "above-middle" : liters < q25 ? "below-middle" : "middle";
	const diff = `${Math.abs(vsMedianL).toFixed(1)} L ${vsMedianL >= 0 ? "over" : "under"} the median`;
	const tail: Record<RangeBand, string> = {
		"above-all": `more than all ${n} calculators recommend`,
		"below-all": `less than all ${n} calculators recommend`,
		"above-middle": `above the middle half of the ${n} picks`,
		"below-middle": `below the middle half of the ${n} picks`,
		middle: `inside the middle half of the ${n} picks`,
	};
	return { liters, vsMedianL, band, nBelow, n, sentence: `${diff}, ${tail[band]}` };
}

export interface ResolvedBoard {
	board: IconicBoard;
	size: BoardSizeRow & { volume_l: number };
	lengthIn: number;
	source: BoardSource;
	shape: BoardShape;
	placement: RangePlacement;
}

/** Fill unpublished volumes with the documented estimate. */
export function withVolumes(board: IconicBoard, catalog: IconicBoard[]): (BoardSizeRow & { volume_l: number })[] {
	const toRef = (s: BoardSizeRow) => ({ lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in, liters: s.volume_l as number });
	const published = (b: IconicBoard) => b.sizes.filter((s) => s.volume_status === "published" && s.volume_l !== null).map(toRef);
	const own = published(board);
	const family = catalog.filter((b) => board.volume_reference_models?.includes(b.id)).flatMap(published);
	const all = catalog.flatMap(published);
	const refs = own.length ? own : family.length ? family : all;
	return board.sizes.map((s) =>
		s.volume_l !== null && s.volume_status === "published"
			? { ...s, volume_l: s.volume_l }
			: {
					...s,
					volume_status: "estimated" as const,
					volume_l: estimateVolumeL({ lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in }, refs),
				},
	);
}

/** Convert a size row and the board's estimated shape into the geometry module's inputs. */
export function toBoardShape(shape: ShapeSpec, size: BoardSizeRow): BoardShape {
	return {
		lengthIn: parseLengthIn(size.length),
		widthIn: size.width_in,
		thicknessIn: size.thickness_in,
		widePointFromCenterIn: shape.wide_point_from_center_in,
		noseWidth12In: shape.nose_width_12_in,
		tailWidth12In: shape.tail_width_12_in,
		noseTip: shape.nose_tip,
		tail: {
			kind: shape.tail.kind,
			endWidthIn: shape.tail.end_width_in,
			depthIn: shape.tail.depth_in,
			cornerIn: shape.tail.corner_in,
			pinRoundness: shape.tail.pin_roundness,
		},
		sting: shape.sting && { fromTailIn: shape.sting.from_tail_in, widthDropFrac: shape.sting.width_drop_frac, rampIn: shape.sting.ramp_in },
		rocker: { noseIn: shape.rocker_in.nose, tailIn: shape.rocker_in.tail },
		foil: { noseFrac12: shape.foil.nose_frac_12, tailFrac12: shape.foil.tail_frac_12, thickestFromCenterIn: shape.foil.thickest_from_center_in },
		rail: { apexFrac: shape.rail.apex_frac, deckExp: shape.rail.deck_exp, bottomExp: shape.rail.bottom_exp },
	};
}

/** Pick each board's size by the data file's rule and place it against the calculators' range. */
export function resolveBoards(data: IconicBoardData, consensus: ConsensusStats, rows: Pick<SystemComparisonRow, "recommended_volume_point_l">[]): ResolvedBoard[] {
	if (consensus.median === null) throw new Error("Consensus median is missing");
	const median = consensus.median;
	return data.boards.map((board) => {
		const sizes = withVolumes(board, data.boards);
		const override = board.size_override && sizes.find((s) => s.length === board.size_override!.length);
		if (board.size_override && !override) throw new Error(`${board.id}: size_override ${board.size_override.length} is not one of its sizes`);
		const size = override || pickNearestSize(sizes, median);
		return {
			board,
			size,
			lengthIn: parseLengthIn(size.length),
			source: board.sources[size.source],
			shape: toBoardShape(board.shape, size),
			placement: placeAgainstRange(size.volume_l, consensus, rows),
		};
	});
}
