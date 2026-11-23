// The blob's drops between boards: together they carry exactly the change in liters, and every
// one has left or sunk in before the bounce ends and the next board forms.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLOB_S, BUD_S, FLOAT_S, LANDINGS, MAX_DROP_L, MERGE_S, planGooTransfer } from "../../src/lib/three/goo-drops";
import { resolveBoards, type IconicBoardData } from "../../src/lib/surf-volume/iconic-boards";
import type { ComparisonResult } from "../../src/lib/surf-volume/types";

const PUBLIC = path.resolve(import.meta.dirname, "../../public/data/surf-volume");
const data: IconicBoardData = JSON.parse(readFileSync(path.join(PUBLIC, "iconic_boards.json"), "utf-8"));
const summary: ComparisonResult = JSON.parse(readFileSync(path.join(PUBLIC, "profile_summary.json"), "utf-8"));
const liters = resolveBoards(data, summary.consensus, summary.rows).map((r) => r.size.volume_l);
// Every change the loop makes, including the wrap from the last board back to the first.
const changes = liters.map((to, i) => ({ from: liters[(i + liters.length - 1) % liters.length], to, seed: i + 1 }));

describe("goo transfers between boards", () => {
	it("carry exactly the change in liters, in drops no bigger than the cap", () => {
		for (const { from, to, seed } of changes) {
			const { kind, drops } = planGooTransfer(from, to, seed);
			const sum = drops.reduce((a, d) => a + d.liters, 0);
			expect(kind, `${from} -> ${to}`).toBe(to < from ? "out" : "in");
			expect(sum, `${from} -> ${to}`).toBeCloseTo(Math.abs(to - from), 9);
			for (const d of drops) expect(d.liters).toBeLessThanOrEqual(MAX_DROP_L + 1e-9);
		}
	});

	it("finish before the bounce ends, so the next board forms at its exact liters", () => {
		for (const { from, to, seed } of changes) {
			const { kind, drops } = planGooTransfer(from, to, seed);
			for (const d of drops) {
				expect(d.start).toBeGreaterThanOrEqual(0);
				expect(d.start + (kind === "out" ? BUD_S : FLOAT_S + MERGE_S), `${from} -> ${to}`).toBeLessThan(BLOB_S);
			}
		}
	});

	it("squeeze drops out on the landings and alternate sides", () => {
		const { drops } = planGooTransfer(86, 61.6, 1);
		expect(drops.length).toBeGreaterThan(2);
		for (const d of drops) expect(LANDINGS).toContain(d.start);
		const sides = drops.map((d) => Math.sign(Math.cos(d.azimuth)));
		for (let k = 1; k < sides.length; k++) expect(sides[k]).toBe(-sides[k - 1]);
	});

	it("does nothing when the liters already match, and plans the same drops every time", () => {
		expect(planGooTransfer(43.3, 43.3, 3).drops).toEqual([]);
		expect(planGooTransfer(45.11, 81, 9)).toEqual(planGooTransfer(45.11, 81, 9));
	});
});
