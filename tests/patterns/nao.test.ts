import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { busiestCrop, clothDistance, copiesIn, makeNao, naoPanel, naoSvg, NAO_DEFAULTS, NAO_SEED, repeatSize, type Nao, type Region } from "../../src/lib/patterns/nao";
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

describe("placed prints", () => {
	it("crops the tee's back panel at its size, over the busiest part of the print", () => {
		const nao = makeNao();
		const per = 1000 / nao.settings.printIn;
		const [x0, y0, x1, y1] = busiestCrop(nao, 14, 10.5);
		expect(x1 - x0).toBeCloseTo(14 * per);
		expect(y1 - y0).toBeCloseTo(10.5 * per);
		expect(busiestCrop(nao, 14, 10.5)).toEqual([x0, y0, x1, y1]);
		// The chosen panel holds at least one rain drop, counting every repeat of each drop.
		const inside = nao.drops.filter((d) => d.layer === "main" && copiesIn(nao, { ...d, reach: 0 }, [x0, y0, x1, y1]).length > 0);
		expect(inside.length).toBeGreaterThan(0);
	});
});

describe("print files", () => {
	it("keep the ink's exact color through the blur-and-cut (the renderer used to turn it white)", async () => {
		const nao = makeNao();
		const svg = naoSvg(nao, { ground: "#1a191c", ink: "#56b2c7", region: [0, 0, 900, 900], scale: 0.5 });
		const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
		let ink = 0, white = 0;
		for (let i = 0; i < data.length; i += info.channels) {
			if (data[i] === 0x56 && data[i + 1] === 0xb2 && data[i + 2] === 0xc7) ink++;
			if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) white++;
		}
		expect(ink).toBeGreaterThan(1000);
		expect(white).toBe(0);
	});
});

describe("the tee's back panel", () => {
	it("is composed for its rectangle, the same way every time", () => {
		const a = naoPanel(14, 10.5);
		const per = 1000 / NAO_DEFAULTS.printIn;
		expect(a.region).toEqual([0, 0, 14 * per, 10.5 * per]);
		expect(naoSvg(a.nao, { ground: "#000", ink: "#fff", region: a.region })).toBe(naoSvg(naoPanel(14, 10.5).nao, { ground: "#000", ink: "#fff", region: a.region }));
		// One big ripple, a few more, and some drizzle; every drop centered inside the rectangle.
		expect(a.nao.drops.filter((d) => d.layer === "main").map((d) => d.rings)).toEqual([10, 7, 4]);
		for (const d of a.nao.drops) {
			expect(d.x).toBeGreaterThan(0);
			expect(d.x).toBeLessThan(a.region[2]);
			expect(d.y).toBeGreaterThan(0);
			expect(d.y).toBeLessThan(a.region[3]);
		}
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
