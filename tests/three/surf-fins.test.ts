// Fin outlines for the Volume Gap hero: each fin keeps its published base and depth, and where a
// fin maker publishes an area, the fitted outline's area matches it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { IconicBoardData } from "../../src/lib/surf-volume/iconic-boards";
import { finOutlineIn, finRakeIn, fitFinOutline, outlineArea } from "../../src/lib/three/surf-fins";

const data: IconicBoardData = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../public/data/surf-volume/iconic_boards.json"), "utf-8"));
const fins = data.boards.flatMap((b) => b.shape.fin_layout.map((fin, i) => ({ id: `${b.id}#${i}`, fin, setup: b.fin_setup })));

describe("fin outlines", () => {
	it("match each published fin area", () => {
		for (const { id, fin } of fins) {
			if (!fin.area_in2) continue;
			expect(fitFinOutline(fin).area, id).toBeCloseTo(fin.area_in2, 2);
		}
	});

	it("keep the published base and depth", () => {
		for (const { id, fin } of fins) {
			const { points } = fitFinOutline(fin);
			const ys = points.map(([, y]) => y);
			expect(Math.max(...ys), id).toBeCloseTo(0, 6);
			expect(-Math.min(...ys), id).toBeCloseTo(fin.depth_in, 2);
			expect(points[0][0] - points[points.length - 1][0], id).toBeCloseTo(fin.base_in, 6);
			// The tip trails the leading edge by half a base plus depth x tan(sweep).
			expect(points.reduce((a, p) => (p[1] < a[1] ? p : a))[0], id).toBeCloseTo(fin.base_in / 2 - finRakeIn(fin), 2);
		}
	});

	it("grow monotonically with fullness, so the area fit is unique", () => {
		for (const { id, fin } of fins) {
			let last = 0;
			for (let k = -0.5; k <= 3; k += 0.25) {
				const a = outlineArea(finOutlineIn(fin, k));
				expect(a, `${id} k=${k}`).toBeGreaterThan(last);
				last = a;
			}
		}
	});

	it("land at a plausible fullness for real fin templates", () => {
		for (const { id, fin } of fins) {
			const { fullness } = fitFinOutline(fin);
			expect(fullness, id).toBeGreaterThan(0.3);
			expect(fullness, id).toBeLessThan(1.6);
		}
	});
});

describe("fin setups", () => {
	it("name a system, a sourced fin, and published numbers when they say so", () => {
		for (const board of data.boards) {
			const s = board.fin_setup;
			expect(s, board.id).toBeDefined();
			expect(s.model.length, board.id).toBeGreaterThan(3);
			expect(s.source ?? "", board.id).toMatch(/^https:\/\//);
			if (s.status === "published") for (const fin of board.shape.fin_layout) expect(fin.area_in2, board.id).toBeGreaterThan(0);
			if (s.system === "glass-on") expect(s.box_color, board.id).toBeUndefined();
		}
	});
});
