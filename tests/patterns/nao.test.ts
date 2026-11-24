import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { clothDistance, makeNao, naoSvg, NAO_DEFAULTS, NAO_SEED, repeatSize, type Nao, type Region } from "../../src/lib/patterns/nao";
import { NAO_COLORWAYS } from "../../src/lib/patterns/nao-colorways";
import { dropPaths } from "../../src/lib/patterns/ripples";

// Render a region of cloth to grey pixels. The renderer cuts the blur off at the edge of its canvas,
// so draw a margin around the region and crop it away, the same way the print script does.
const PX = 0.25; // pixels per site unit
const MARGIN = 200; // site units
async function pixels(nao: Nao, [x0, y0, x1, y1]: Region): Promise<Buffer> {
	const svg = naoSvg(nao, { ground: "#000000", ink: "#ffffff", region: [x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN], scale: PX });
	return sharp(Buffer.from(svg))
		.extract({ left: Math.round(MARGIN * PX), top: Math.round(MARGIN * PX), width: Math.round((x1 - x0) * PX), height: Math.round((y1 - y0) * PX) })
		.greyscale()
		.raw()
		.toBuffer();
}
// Share of pixels that differ by more than a rounding step.
const mismatch = (a: Buffer, b: Buffer) => {
	expect(a.length).toBe(b.length);
	let n = 0;
	for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 8) n++;
	return n / a.length;
};

describe("Nao", () => {
	const nao = makeNao();
	const { W, H } = nao;

	it("prints the same cloth for the same seed and settings", () => {
		const ink = { ground: "#1a191c", ink: "#56b2c7" };
		expect(naoSvg(makeNao(NAO_SEED), ink)).toBe(naoSvg(makeNao(NAO_SEED), ink));
		expect(naoSvg(makeNao(NAO_SEED + 1), ink)).not.toBe(naoSvg(makeNao(NAO_SEED), ink));
	});

	it("is a 27 x 36 in repeat at the locked-in print size", () => {
		expect(repeatSize(15)).toEqual({ W: 1800, H: 2400 });
		expect([W, H]).toEqual([1800, 2400]);
	});

	it("draws every drop with the site's own ripple", () => {
		// Same call the site makes, around the origin: the print adds no marks of its own.
		const d = nao.drops[0];
		expect(d.paths.length).toBeGreaterThan(10);
		expect(dropPaths({ seed: NAO_SEED * 7919, cx: 0, cy: 0, rings: d.rings, gap: d.gap, solid: d.paths[0].fill ? 2 : 1 }).length).toBeGreaterThan(0);
		for (const p of nao.drops.flatMap((x) => x.paths)) expect(p.d).not.toMatch(/NaN|Infinity/);
	});

	it("places the locked-in number of drops, spaced apart, inside one repeat", () => {
		const rain = nao.drops.filter((d) => d.layer === "main");
		expect(rain).toHaveLength(NAO_DEFAULTS.drops);
		const floor = NAO_DEFAULTS.minDist * (1 - NAO_DEFAULTS.spread);
		for (let i = 0; i < rain.length; i++)
			for (let j = i + 1; j < rain.length; j++) expect(clothDistance(W, H, [rain[i].x, rain[i].y], [rain[j].x, rain[j].y])).toBeGreaterThan(floor);
		for (const d of nao.drops) {
			expect(d.x).toBeGreaterThanOrEqual(0);
			expect(d.x).toBeLessThan(W);
			expect(d.y).toBeGreaterThanOrEqual(0);
			expect(d.y).toBeLessThan(H);
		}
		// A few drizzle drops, kept apart so they don't melt into a blotch.
		const fine = nao.drops.filter((d) => d.layer === "fine");
		expect(fine.length).toBeGreaterThanOrEqual(3);
		for (let i = 0; i < fine.length; i++)
			for (let j = i + 1; j < fine.length; j++) expect(clothDistance(W, H, [fine[i].x, fine[i].y], [fine[j].x, fine[j].y])).toBeGreaterThanOrEqual(110);
	});

	describe("has no seam", () => {
		it("continues across the right edge of the full width", async () => {
			// The strip just past the right edge is the strip at the left edge.
			const past = await pixels(nao, [2 * W, 0, 2 * W + 400, H]);
			const start = await pixels(nao, [0, 0, 400, H]);
			expect(mismatch(past, start)).toBeLessThan(0.002);
		});

		it("continues across the bottom edge", async () => {
			const past = await pixels(nao, [0, H, 2 * W, H + 400]);
			const start = await pixels(nao, [0, 0, 2 * W, 400]);
			expect(mismatch(past, start)).toBeLessThan(0.002);
		});

		it("drops the second column half a repeat", async () => {
			const second = await pixels(nao, [W, H / 2, 2 * W, H / 2 + H]);
			const first = await pixels(nao, [0, 0, W, H]);
			expect(mismatch(second, first)).toBeLessThan(0.002);
		});

		it("actually prints something at the edges it compares", async () => {
			const edge = await pixels(nao, [0, 0, 400, H]);
			expect(edge.filter((v) => v > 128).length / edge.length).toBeGreaterThan(0.01);
		});

		it("would notice a seam: two different strips don't match", async () => {
			const a = await pixels(nao, [0, 0, 400, H]);
			const b = await pixels(nao, [800, 0, 1200, H]);
			expect(mismatch(a, b)).toBeGreaterThan(0.02);
		});
	});
});

describe("Nao colorways", () => {
	it("are the season pairs without Signal's clickable orange", () => {
		expect(NAO_COLORWAYS).toHaveLength(11);
		expect(NAO_COLORWAYS.some((c) => c.id === "signal")).toBe(false);
		expect(NAO_COLORWAYS.some((c) => c.ink.toLowerCase() === "#ff5b1f")).toBe(false);
		expect(NAO_COLORWAYS.filter((c) => c.group === "dark").map((c) => c.id)).toEqual(["night", "rose", "shell", "espresso", "moss", "drill", "ash"]);
		expect(NAO_COLORWAYS.filter((c) => c.group === "light").map((c) => c.id)).toEqual(["coral", "cobalt", "sage", "concrete"]);
	});
});
