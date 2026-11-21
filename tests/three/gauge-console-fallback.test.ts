import { describe, expect, it } from "vitest";
import { FALLBACK_VIEWBOX, gaugeConsoleSvg } from "../../src/lib/three/gauge-console-fallback";
import { DEFAULT_CONSOLE_COLORS } from "../../src/lib/three/gauge-dial";
import { runGaugeDashboard } from "../../src/lib/stats-sim/dashboard-runs";

const run = runGaugeDashboard(1);
const count = (svg: string, needle: string) => svg.split(needle).length - 1;
const lamps = (svg: string) => [...svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="12" height="5" rx="2" fill="([^"]+)"/g)].map((m) => m[1]);

describe("gaugeConsoleSvg", () => {
	it("draws one numbered dial per metric", () => {
		const svg = gaugeConsoleSvg(run, "none");
		expect(count(svg, `fill="${DEFAULT_CONSOLE_COLORS.face}"`)).toBe(20);
		for (let n = 1; n <= 20; n++) expect(svg).toContain(`>${n}</text>`);
	});

	it("fits every box it draws inside its viewBox, strokes included", () => {
		const [vx, vy, vw, vh] = FALLBACK_VIEWBOX.split(" ").map(Number);
		for (const m of gaugeConsoleSvg(run, "none").matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)) {
			const [x, y, w, h] = m.slice(1).map(Number);
			expect(x - 3).toBeGreaterThanOrEqual(vx);
			expect(y - 3).toBeGreaterThanOrEqual(vy);
			expect(x + w + 3).toBeLessThanOrEqual(vx + vw);
			expect(y + h + 3).toBeLessThanOrEqual(vy + vh);
		}
	});

	it("draws two red zones per dial", () => {
		expect(count(gaugeConsoleSvg(run, "bonferroni"), `stroke="${DEFAULT_CONSOLE_COLORS.redline}"`)).toBe(40);
	});

	it("lights the same lamps the page's rules flag", () => {
		for (const mode of ["none", "bonferroni", "bh"] as const) {
			const expected = run.metrics.map((m) =>
				m.flagged[mode] ? (m.is_null ? DEFAULT_CONSOLE_COLORS.null : DEFAULT_CONSOLE_COLORS.lift) : DEFAULT_CONSOLE_COLORS.lampOff,
			);
			expect(lamps(gaugeConsoleSvg(run, mode))).toEqual(expected);
		}
	});

	it("shows seed 1's false discovery uncorrected and clears it under Bonferroni", () => {
		expect(lamps(gaugeConsoleSvg(run, "none"))[8]).toBe(DEFAULT_CONSOLE_COLORS.null);
		expect(lamps(gaugeConsoleSvg(run, "bonferroni"))).not.toContain(DEFAULT_CONSOLE_COLORS.null);
	});
});
