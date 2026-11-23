import { describe, expect, it } from "vitest";
import { dropPaths, formBlur, formPaths, type RippleForm } from "../../src/lib/patterns/ripples";
import { SEASON, contrast, projectTheme, seasonFor, themeFor, PAPER, DARK } from "../../src/lib/project-theme";

describe("organic ripples", () => {
	it("draws the same ripple for the same seed", () => {
		expect(dropPaths({ seed: 4 })).toEqual(dropPaths({ seed: 4 }));
		expect(dropPaths({ seed: 4 })).not.toEqual(dropPaths({ seed: 5 }));
	});

	it("varies stroke weight within a ring instead of one uniform width", () => {
		const widths = new Set(dropPaths({ seed: 12 }).flatMap((p) => (p.width ? [p.width] : [])));
		expect(widths.size).toBeGreaterThan(20);
	});

	it("starts with a filled center drop and can leave it out", () => {
		expect(dropPaths({ seed: 1 })[0].fill).toBe(true);
		expect(dropPaths({ seed: 1, center: 0 }).some((p) => p.fill)).toBe(false);
	});

	it("draws every form, with a blur scaled to its ring spacing", () => {
		const forms: RippleForm[] = ["drop", "rain", "echo", "pair", "drizzle"];
		for (const f of forms) {
			expect(formPaths(f, { seed: 9 }).length).toBeGreaterThan(20);
			expect(formBlur(f)).toBeGreaterThan(2);
		}
		expect(formBlur("drizzle")).toBeLessThan(formBlur("drop"));
		expect(formBlur("echo")).toBeGreaterThan(formBlur("drop"));
	});

	it("keeps every coordinate a finite number", () => {
		for (const p of formPaths("rain", { seed: 3 })) expect(p.d).not.toMatch(/NaN|Infinity/);
	});
});

describe("the season", () => {
	it("has twelve pairs and no duplicates", () => {
		expect(SEASON).toHaveLength(12);
		expect(new Set(SEASON.map((p) => p.id)).size).toBe(12);
	});

	it("flips a ring that would vanish on white to its own ground", () => {
		const espresso = projectTheme("the-22re-restoration");
		expect(espresso.pair.id).toBe("espresso");
		expect(espresso.ringOnPaper).toBe(espresso.pair.ground);
		expect(espresso.ringOnDark).toBe(espresso.pair.ring);
		for (const pair of SEASON) {
			const theme = themeFor(pair);
			expect(contrast(theme.ringOnPaper, PAPER)).toBeGreaterThanOrEqual(2);
			expect(contrast(theme.ringOnDark, DARK)).toBeGreaterThanOrEqual(2);
		}
	});

	it("gives home no pair, so its ripples stay grey", () => {
		expect(seasonFor("")).toBeNull();
		expect(seasonFor("the-peeking-problem")?.id).toBe("cobalt");
	});
});
