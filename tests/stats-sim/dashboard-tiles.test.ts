import { describe, expect, it } from "vitest";
import { CORRECTIONS, LAUNCH_SEEDS, runDashboard } from "../../src/lib/stats-sim/dashboard-runs";
import { TILE_CLASS, orderTiles, tableHtml, tileViews, tilesHtml } from "../../src/lib/stats-sim/dashboard-tiles";

const runs = LAUNCH_SEEDS.map((s) => runDashboard(s));
const run = runs[0];

describe("orderTiles", () => {
	it("puts the biggest observed lift first, like a top-movers dashboard", () => {
		for (const r of runs) {
			const lifts = orderTiles(r.metrics).map((m) => m.lift as number);
			expect(lifts).toEqual([...lifts].sort((a, b) => b - a));
			expect(orderTiles(r.metrics)).toHaveLength(20);
		}
	});

	it("keeps the same order whatever the rule, so switching rules never moves a tile", () => {
		const names = (mode: (typeof CORRECTIONS)[number]) => tileViews(run, mode, false).map((v) => v.metric.name);
		expect(names("bonferroni")).toEqual(names("none"));
		expect(names("bh")).toEqual(names("none"));
	});
});

describe("tileViews", () => {
	it("shows only what a dashboard would before the reveal", () => {
		for (const v of tileViews(run, "none", false)) {
			expect(v.truthText).toBeNull();
			expect(v.mark).toBeNull();
			expect(v.state).toBe(v.cleared ? "hidden-cleared" : "hidden-flat");
			expect(v.status).toBe(v.cleared ? "Significant" : "Not significant");
		}
	});

	it("marks a cleared tile with the direction it moved", () => {
		for (const v of tileViews(run, "none", false)) {
			expect(v.statusGlyph).toBe(!v.cleared ? "" : v.metric.z > 0 ? "▲" : "▼");
		}
	});

	it("reveals the truth on every tile, with a word mark on the ones that matter, for every seed and rule", () => {
		for (const r of runs) {
			for (const mode of CORRECTIONS) {
				for (const v of tileViews(r, mode, true)) {
					const m = v.metric;
					expect(v.cleared).toBe(m.flagged[mode]);
					expect(v.truthText).toBe(m.is_null ? "True lift 0%" : "True lift +60%");
					if (v.cleared) expect(v.state).toBe(m.is_null ? "false" : "real");
					else expect(v.state).toBe(m.is_null ? "unmoved" : "missed");
					expect(v.mark).toBe({ real: "Real lift", false: "False discovery", missed: "Real lift, missed", unmoved: null }[v.state as "real"]);
				}
			}
		}
	});

	it("colors only the revealed verdicts: accent blue for real, the page's coral for false", () => {
		expect(TILE_CLASS.real).toContain("bg-accent-blue");
		expect(TILE_CLASS.false).toContain("bg-coral-ring");
		for (const s of ["hidden-flat", "hidden-cleared", "missed", "unmoved"] as const) expect(TILE_CLASS[s]).toContain("bg-paper");
	});
});

describe("tilesHtml / tableHtml", () => {
	it("renders 20 tiles with their names, lifts and status words", () => {
		const html = tilesHtml(tileViews(run, "none", false));
		expect(html.match(/<li /g)).toHaveLength(20);
		for (const m of run.metrics) expect(html).toContain(m.name);
		expect(html).toContain("+82%");
		expect(html.match(/Not significant/g)).toHaveLength(14);
		expect(html).not.toContain("True lift");
	});

	it("puts the verdict in words on revealed tiles, not color alone", () => {
		const html = tilesHtml(tileViews(run, "none", true));
		expect(html.match(/False discovery/g)).toHaveLength(1);
		expect(html.match(/✓<\/span> Real lift</g)).toHaveLength(5);
		expect(html.match(/Real lift, missed/g)).toHaveLength(1);
	});

	it("keeps the table's truth column hidden until the reveal", () => {
		const views = tileViews(run, "none", false);
		expect(tableHtml(views, "none", false).match(/hidden until you reveal/g)).toHaveLength(20);
		const shown = tableHtml(tileViews(run, "none", true), "none", true);
		expect(shown).not.toContain("hidden until you reveal");
		expect(shown).toContain("false discovery");
		expect(shown).toContain("text-[#c6372a]");
		expect(shown).toContain("<th class=\"py-2 pr-4\">No correction</th>");
	});
});
