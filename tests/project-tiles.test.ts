import { describe, expect, it } from "vitest";
import { layoutTiles, type TilePlacement } from "../src/lib/project-tiles";

/** Paint every card's cells onto a 12-column grid; throws on overlap. */
function paint(placements: TilePlacement[]): (number | null)[][] {
	const grid: (number | null)[][] = [];
	placements.forEach((p, idx) => {
		const [cs, cspan = "span 1"] = p.column.split(" / ");
		const [rs, rspan = "span 1"] = p.row.split(" / ");
		const c0 = Number(cs);
		const r0 = Number(rs);
		const cw = Number(cspan.replace("span ", ""));
		const rh = Number(rspan.replace("span ", ""));
		for (let r = r0; r < r0 + rh; r++) {
			grid[r - 1] ??= Array(12).fill(null);
			for (let c = c0; c < c0 + cw; c++) {
				if (c > 12) throw new Error(`card ${idx} runs past column 12`);
				if (grid[r - 1][c - 1] !== null) throw new Error(`card ${idx} overlaps card ${grid[r - 1][c - 1]}`);
				grid[r - 1][c - 1] = idx;
			}
		}
	});
	return grid;
}

const holes = (grid: (number | null)[][]) => grid.flat().filter((c) => c === null).length;

describe("layoutTiles", () => {
	it("fills the projects grid with no holes or overlaps with two previews", () => {
		// 22RE, Dashboard, Noise, Peeking, Volume, Toolkit, Forecast, Causal.
		const grid = paint(layoutTiles([true, false, false, false, false, false, true, false]));
		expect(holes(grid)).toBe(0);
		expect(grid).toHaveLength(5);
	});

	it("stays hole-free with the Volume Gap preview too (today's mix)", () => {
		const grid = paint(layoutTiles([true, false, false, false, true, false, true, false]));
		expect(holes(grid)).toBe(0);
		expect(grid).toHaveLength(6);
	});

	it("makes features seven columns by two rows and alternates their side", () => {
		const out = layoutTiles([true, false, false, true, false, false]);
		expect(out[0]).toEqual({ column: "1 / span 7", row: "1 / span 2" });
		expect(out[3]).toEqual({ column: "6 / span 7", row: "3 / span 2" });
	});

	it("pulls a plain card just before a feature into its block", () => {
		const out = layoutTiles([false, true, false]);
		expect(out[1].row).toBe("1 / span 2");
		expect(out[0].row).toBe("1");
		expect(out[2].row).toBe("2");
	});

	it("handles edge cases without holes", () => {
		for (const mix of [[], [true], [false], [true, true], [false, false, false], [true, false], [true, true, false, false, true]]) {
			expect(holes(paint(layoutTiles(mix)))).toBe(0);
		}
	});

	it("keeps every card in reading order down the rows", () => {
		const out = layoutTiles([true, false, false, false, false, false, true, false]);
		const starts = out.map((p) => Number(p.row.split(" / ")[0]));
		for (let k = 1; k < starts.length; k++) expect(starts[k]).toBeGreaterThanOrEqual(starts[k - 1]);
	});
});
