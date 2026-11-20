// The board rack's logic: real size ranges per model, volume for custom dimensions, the nearest
// stock size, and the fit headline.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clampDims, estimateForDims, finsForDims, FIT_HEADLINES, nearestStockSize, shapeForDims, specRanges } from "../../src/lib/surf-volume/board-rack";
import { bottomPoint, calibrateBoard, INCH } from "../../src/lib/three/surfboard-morph";
import { parseLengthIn, placeAgainstRange, withVolumes, type IconicBoardData } from "../../src/lib/surf-volume/iconic-boards";
import type { ComparisonResult } from "../../src/lib/surf-volume/types";

const PUBLIC = path.resolve(import.meta.dirname, "../../public/data/surf-volume");
const data: IconicBoardData = JSON.parse(readFileSync(path.join(PUBLIC, "iconic_boards.json"), "utf-8"));
const summary: ComparisonResult = JSON.parse(readFileSync(path.join(PUBLIC, "profile_summary.json"), "utf-8"));
const board = (id: string) => data.boards.find((b) => b.id === id)!;

describe("spec ranges", () => {
	it("span each model's stock sizes", () => {
		for (const b of data.boards) {
			const r = specRanges(b);
			expect(r.nSizes, b.id).toBe(b.sizes.length);
			for (const s of b.sizes) {
				expect(parseLengthIn(s.length)).toBeGreaterThanOrEqual(r.length.min);
				expect(parseLengthIn(s.length)).toBeLessThanOrEqual(r.length.max);
				expect(s.width_in).toBeGreaterThanOrEqual(r.width.min);
				expect(s.thickness_in).toBeLessThanOrEqual(r.thickness.max);
			}
		}
	});

	it("collapse to a point for a one-size model", () => {
		const r = specRanges(board("wavestorm-8-classic"));
		expect(r.nSizes).toBe(1);
		expect(r.length.min).toBe(r.length.max);
	});

	it("clamp dimensions into the model's range", () => {
		const r = specRanges(board("tc-tanaka-glide"));
		const c = clampDims({ lengthIn: 100, widthIn: 10, thicknessIn: 3 }, r);
		expect(c.lengthIn).toBe(76);
		expect(c.widthIn).toBe(20.25);
		expect(c.thicknessIn).toBe(3);
	});
});

describe("volume for custom dimensions", () => {
	it("returns the listed liters at an exact stock size", () => {
		for (const b of data.boards) {
			for (const s of withVolumes(b, data.boards)) {
				const e = estimateForDims(b, data.boards, { lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in });
				expect(e.method, `${b.id} ${s.length}`).toBe("stock");
				expect(e.liters).toBeCloseTo(s.volume_l, 6);
				expect(e.basis).toBe(s.volume_status);
			}
		}
	});

	it("scales with L x W x T between stock sizes, from the model's own box fill", () => {
		const b = board("tc-tanaka-glide");
		const a = estimateForDims(b, data.boards, { lengthIn: 75, widthIn: 21.25, thicknessIn: 2.9375 });
		const twice = estimateForDims(b, data.boards, { lengthIn: 75, widthIn: 21.25, thicknessIn: 2.9375 * 2 });
		expect(a.method).toBe("box-fill");
		expect(a.basis).toBe("published");
		expect(a.nRefs).toBe(4);
		expect(twice.liters / a.liters).toBeCloseTo(2, 9);
		// Between the 6'2" (41.21 L) and 6'4" (45.11 L).
		expect(a.liters).toBeGreaterThan(41.21);
		expect(a.liters).toBeLessThan(45.11);
	});

	it("says when a model's own volumes are estimates (the Pipeliner)", () => {
		const b = board("lopez-pipeliner");
		const e = estimateForDims(b, data.boards, { lengthIn: 90, widthIn: 19, thicknessIn: 2.7 });
		expect(e.basis).toBe("estimated");
	});
});

describe("nearest stock size", () => {
	it("is the stock size itself at stock dimensions", () => {
		const b = board("ci-water-hog");
		for (const s of b.sizes) {
			expect(nearestStockSize(b, data.boards, { lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in }).length).toBe(s.length);
		}
	});
});

describe("fit headline", () => {
	it("covers every band, with too little and too much at the extremes", () => {
		const { consensus, rows } = summary;
		expect(FIT_HEADLINES[placeAgainstRange(consensus.min! - 5, consensus, rows).band]).toBe("Too little volume");
		expect(FIT_HEADLINES[placeAgainstRange(consensus.max! + 5, consensus, rows).band]).toBe("Too much volume");
		expect(FIT_HEADLINES[placeAgainstRange(consensus.median!, consensus, rows).band]).toBe("In the middle of the pack");
	});
});

describe("shape at custom dimensions", () => {
	it("calibrates every model at every corner of its size range to the estimated liters", () => {
		for (const b of data.boards) {
			const r = specRanges(b);
			const stock = b.sizes[0];
			for (const lengthIn of [r.length.min, r.length.max])
				for (const widthIn of [r.width.min, r.width.max])
					for (const thicknessIn of [r.thickness.min, r.thickness.max]) {
						const dims = { lengthIn, widthIn, thicknessIn };
						const liters = estimateForDims(b, data.boards, dims).liters;
						const cal = calibrateBoard(shapeForDims(b.shape, stock, dims), liters);
						expect(cal.liters, `${b.id} ${lengthIn}x${widthIn}x${thicknessIn}`).toBeCloseTo(liters, 1);
						// Fins still land on the bottom, inside the outline.
						for (const fin of finsForDims(b.shape.fin_layout, stock, dims)) {
							const [, , z] = bottomPoint(cal, -cal.prepared.halfL + fin.from_tail_in, fin.off_center_in);
							expect(Math.abs(z / INCH)).toBeLessThan(widthIn / 2);
						}
					}
		}
	});

	it("is the stock shape at the stock size", () => {
		const b = board("pyzel-white-tiger");
		const s = b.sizes[2];
		const dims = { lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in };
		const shape = shapeForDims(b.shape, s, dims);
		expect(shape.noseWidth12In).toBeCloseTo(b.shape.nose_width_12_in, 9);
		expect(shape.lengthIn).toBe(dims.lengthIn);
	});
});
