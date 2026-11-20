/**
 * Logic behind the Volume Gap's board rack: each model's real size range, the volume a custom
 * length x width x thickness would carry, the nearest stock size, and how that volume sits
 * against the calculators' picks for one surfer. Pure, so the page and the tests share it.
 *
 * The volume estimate is the same documented box-fill method the data file uses for unpublished
 * sizes (estimateVolumeL): L x W x T x the model's own median box fill. Exact stock sizes return
 * their listed liters instead.
 */
import type { BoardShape } from "../three/surfboard-morph";
import { estimateVolumeL, parseLengthIn, toBoardShape, withVolumes, type BoardSizeRow, type FinSpec, type IconicBoard, type RangeBand, type ShapeSpec } from "./iconic-boards";

export interface Dims {
	lengthIn: number;
	widthIn: number;
	thicknessIn: number;
}

export interface SpecRange {
	min: number;
	max: number;
}

/** The span of each dimension across a model's stock sizes. */
export interface ModelSpecRanges {
	length: SpecRange;
	width: SpecRange;
	thickness: SpecRange;
	/** Number of stock sizes the ranges come from; 1 means the model comes in one size. */
	nSizes: number;
}

const dimsOf = (s: BoardSizeRow): Dims => ({ lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in });

export function specRanges(board: IconicBoard): ModelSpecRanges {
	const d = board.sizes.map(dimsOf);
	const span = (k: keyof Dims): SpecRange => ({ min: Math.min(...d.map((x) => x[k])), max: Math.max(...d.map((x) => x[k])) });
	return { length: span("lengthIn"), width: span("widthIn"), thickness: span("thicknessIn"), nSizes: d.length };
}

/** Keep dimensions inside the model's real range. */
export function clampDims(dims: Dims, r: ModelSpecRanges): Dims {
	const c = (v: number, s: SpecRange) => Math.min(s.max, Math.max(s.min, v));
	return { lengthIn: c(dims.lengthIn, r.length), widthIn: c(dims.widthIn, r.width), thicknessIn: c(dims.thicknessIn, r.thickness) };
}

const sameDims = (a: Dims, b: Dims) =>
	Math.abs(a.lengthIn - b.lengthIn) < 1e-6 && Math.abs(a.widthIn - b.widthIn) < 1e-6 && Math.abs(a.thicknessIn - b.thicknessIn) < 1e-6;

export interface DimsEstimate {
	liters: number;
	/** "stock": an exact stock size (its listed liters); otherwise the box-fill estimate. */
	method: "stock" | "box-fill";
	/** Whether the liters, or the sizes behind the box fill, are the maker's published numbers. */
	basis: "published" | "estimated";
	/** Median liters / bounding-box liters the estimate uses. */
	boxFill: number;
	/** How many of the model's sizes the box fill comes from. */
	nRefs: number;
}

const CUBIC_INCH_L = 0.016387064;

/** Liters for a length x width x thickness of this model. */
export function estimateForDims(board: IconicBoard, catalog: IconicBoard[], dims: Dims): DimsEstimate {
	const sizes = withVolumes(board, catalog);
	const refs = sizes.map((s) => ({ ...dimsOf(s), liters: s.volume_l, status: s.volume_status }));
	const published = refs.filter((r) => r.status === "published");
	const basisRefs = published.length ? published : refs;
	const boxFill = estimateVolumeL({ lengthIn: 1, widthIn: 1, thicknessIn: 1 }, basisRefs) / CUBIC_INCH_L;
	const stock = refs.find((r) => sameDims(r, dims));
	if (stock) return { liters: stock.liters, method: "stock", basis: stock.status, boxFill, nRefs: basisRefs.length };
	return {
		liters: estimateVolumeL(dims, basisRefs),
		method: "box-fill",
		basis: published.length ? "published" : "estimated",
		boxFill,
		nRefs: basisRefs.length,
	};
}

/** The stock size closest in shape: smallest summed squared relative difference in L, W and T. */
export function nearestStockSize(board: IconicBoard, catalog: IconicBoard[], dims: Dims): BoardSizeRow & { volume_l: number } {
	const sizes = withVolumes(board, catalog);
	const score = (s: BoardSizeRow) => {
		const d = dimsOf(s);
		return ((d.lengthIn - dims.lengthIn) / dims.lengthIn) ** 2 + ((d.widthIn - dims.widthIn) / dims.widthIn) ** 2 + ((d.thicknessIn - dims.thicknessIn) / dims.thicknessIn) ** 2;
	};
	return sizes.reduce((best, s) => (score(s) < score(best) - 1e-12 ? s : best), sizes[0]);
}

/**
 * The model's outline stretched to new dimensions: widths across the board (at 12", at the tail
 * end) scale with the width, the wide point and the sting step with the length. Rocker, foil and
 * rail shape stay the model's own; the mesh is then calibrated to the estimated liters.
 */
export function shapeForDims(spec: ShapeSpec, stock: BoardSizeRow, dims: Dims): BoardShape {
	const base = toBoardShape(spec, stock);
	const kw = dims.widthIn / base.widthIn;
	const kl = dims.lengthIn / base.lengthIn;
	return {
		...base,
		lengthIn: dims.lengthIn,
		widthIn: dims.widthIn,
		thicknessIn: dims.thicknessIn,
		widePointFromCenterIn: base.widePointFromCenterIn * kl,
		noseWidth12In: base.noseWidth12In * kw,
		tailWidth12In: base.tailWidth12In * kw,
		tail: { ...base.tail, endWidthIn: base.tail.endWidthIn * kw, cornerIn: base.tail.cornerIn === undefined ? undefined : base.tail.cornerIn * kw },
		sting: base.sting && { ...base.sting, fromTailIn: base.sting.fromTailIn * kl },
	};
}

/** Fins follow the rails: side fins move out or in with the width. */
export function finsForDims(fins: FinSpec[], stock: BoardSizeRow, dims: Dims): FinSpec[] {
	const kw = dims.widthIn / stock.width_in;
	return fins.map((f) => ({ ...f, off_center_in: f.off_center_in * kw }));
}

/** A plain-words headline for where a board's liters land against one surfer's calculator picks. */
export const FIT_HEADLINES: Record<RangeBand, string> = {
	"below-all": "Too little volume",
	"below-middle": "On the low side",
	middle: "In the middle of the pack",
	"above-middle": "On the high side",
	"above-all": "Too much volume",
};
