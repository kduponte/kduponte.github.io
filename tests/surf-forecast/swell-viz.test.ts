import { describe, expect, it } from "vitest";
import {
	VIEW,
	WINDOW_M,
	bearingToPoint,
	deepWaterSpeedMs,
	deepWaterWavelengthM,
	swellFillPath,
	swellGeometry,
	swellPath,
	HORIZONTAL_PX_PER_M,
	VERTICAL_EXAGGERATION,
	type SwellGeometryInput,
} from "../../src/lib/surf-forecast/swell-viz";

const clean: SwellGeometryInput = {
	wave_height_m: 1.5,
	wave_period_s: 12,
	wind_speed_ms: 1,
	wind_relation: "calm",
};

describe("deepWaterWavelengthM", () => {
	it("matches the textbook 1.56 T^2 approximation", () => {
		// L = gT^2/2pi, so the coefficient is 9.81/6.2832 = 1.5613.
		expect(deepWaterWavelengthM(10)).toBeCloseTo(156.13, 1);
		expect(deepWaterWavelengthM(1)).toBeCloseTo(1.5613, 3);
	});

	it("grows with the square of period", () => {
		expect(deepWaterWavelengthM(20) / deepWaterWavelengthM(10)).toBeCloseTo(4, 6);
	});

	it("returns zero for degenerate periods rather than NaN or Infinity", () => {
		expect(deepWaterWavelengthM(0)).toBe(0);
		expect(deepWaterWavelengthM(-5)).toBe(0);
		expect(deepWaterWavelengthM(Number.NaN)).toBe(0);
	});
});

describe("deepWaterSpeedMs", () => {
	it("equals wavelength over period", () => {
		for (const t of [6, 11, 17]) {
			expect(deepWaterSpeedMs(t)).toBeCloseTo(deepWaterWavelengthM(t) / t, 6);
		}
	});

	it("puts a 17 second groundswell at roughly 26 m/s", () => {
		expect(deepWaterSpeedMs(17)).toBeCloseTo(26.55, 1);
	});
});

describe("swellGeometry", () => {
	it("packs more crests into the frame at short period than at long", () => {
		const windswell = swellGeometry({ ...clean, wave_period_s: 6 });
		const groundswell = swellGeometry({ ...clean, wave_period_s: 17 });
		expect(windswell.crests_in_view).toBeGreaterThan(groundswell.crests_in_view);
		expect(windswell.crest_spacing_px).toBeLessThan(groundswell.crest_spacing_px);
	});

	it("derives crest count from the real wavelength and the fixed window", () => {
		const g = swellGeometry({ ...clean, wave_period_s: 10 });
		expect(g.crests_in_view).toBeCloseTo(WINDOW_M / deepWaterWavelengthM(10), 6);
	});

	it("scales amplitude linearly in wave height", () => {
		const small = swellGeometry({ ...clean, wave_height_m: 1 });
		const double = swellGeometry({ ...clean, wave_height_m: 2 });
		expect(double.amplitude_px / small.amplitude_px).toBeCloseTo(2, 6);
	});

	it("clamps amplitude instead of overflowing the frame on an enormous day", () => {
		const huge = swellGeometry({ ...clean, wave_height_m: 25 });
		expect(huge.amplitude_px).toBeLessThan(VIEW.waterline);
		expect(huge.amplitude_px).toBe(swellGeometry({ ...clean, wave_height_m: 12 }).amplitude_px);
	});

	it("keeps a drawable crest even at absurd periods", () => {
		const forever = swellGeometry({ ...clean, wave_period_s: 40 });
		expect(forever.crest_spacing_px).toBeGreaterThan(0);
		expect(Number.isFinite(forever.crest_spacing_px)).toBe(true);
		const chatter = swellGeometry({ ...clean, wave_period_s: 2 });
		expect(Number.isFinite(chatter.crest_spacing_px)).toBe(true);
		expect(chatter.crest_spacing_px).toBeGreaterThan(0);
	});

	it("roughens the surface only when wind has an onshore component", () => {
		const onshore = swellGeometry({ ...clean, wind_speed_ms: 10, wind_relation: "onshore" });
		const cross = swellGeometry({ ...clean, wind_speed_ms: 10, wind_relation: "cross" });
		const offshore = swellGeometry({ ...clean, wind_speed_ms: 10, wind_relation: "offshore" });
		expect(onshore.chop_amplitude_px).toBeGreaterThan(cross.chop_amplitude_px);
		expect(cross.chop_amplitude_px).toBeGreaterThan(0);
		expect(offshore.chop_amplitude_px).toBe(0);
	});

	it("gives spray to offshore wind and never to onshore", () => {
		expect(swellGeometry({ ...clean, wind_speed_ms: 8, wind_relation: "offshore" }).spray).toBe(true);
		expect(swellGeometry({ ...clean, wind_speed_ms: 8, wind_relation: "onshore" }).spray).toBe(false);
		// A whisper of offshore is not spray.
		expect(swellGeometry({ ...clean, wind_speed_ms: 1, wind_relation: "offshore" }).spray).toBe(false);
	});

	it("ties drift duration to the wave period, since a crest covers one wavelength per period", () => {
		expect(swellGeometry({ ...clean, wave_period_s: 14 }).drift_seconds).toBe(14);
		// Never zero, which would be an invalid CSS animation duration.
		expect(swellGeometry({ ...clean, wave_period_s: 0 }).drift_seconds).toBeGreaterThan(0);
	});

	it("survives a flat, windless reading without producing NaN", () => {
		const g = swellGeometry({ wave_height_m: 0, wave_period_s: 0, wind_speed_ms: 0, wind_relation: "calm" });
		for (const v of [g.amplitude_px, g.crest_spacing_px, g.chop_amplitude_px, g.drift_seconds]) {
			expect(Number.isFinite(v)).toBe(true);
		}
	});
});

describe("swellPath", () => {
	it("starts one crest spacing before the frame so it can drift without revealing an end", () => {
		const g = swellGeometry(clean);
		const path = swellPath(g);
		expect(path.startsWith("M ")).toBe(true);
		const firstX = Number(path.slice(2).split(" ")[0]);
		expect(firstX).toBeCloseTo(-g.crest_spacing_px, 1);
	});

	it("extends far enough past the right edge to cover a full drift", () => {
		const g = swellGeometry(clean);
		const xs = swellPath(g)
			.replace("M ", "")
			.split(" L ")
			.map((p) => Number(p.split(" ")[0]));
		expect(Math.max(...xs)).toBeGreaterThanOrEqual(VIEW.width + g.crest_spacing_px);
	});

	it("produces only finite coordinates", () => {
		const g = swellGeometry({ wave_height_m: 3, wave_period_s: 15, wind_speed_ms: 12, wind_relation: "onshore" });
		const nums = swellPath(g)
			.replace("M ", "")
			.split(/[ L]+/)
			.filter(Boolean)
			.map(Number);
		expect(nums.length).toBeGreaterThan(0);
		for (const n of nums) expect(Number.isFinite(n)).toBe(true);
	});

	it("draws peakier crests than troughs, matching real swell asymmetry", () => {
		const g = swellGeometry({ ...clean, wave_height_m: 3 });
		const ys = swellPath(g)
			.replace("M ", "")
			.split(" L ")
			.map((p) => Number(p.split(" ")[1]));
		// Smaller y is higher on screen, so the crest should sit further from the waterline than
		// the trough does.
		const above = VIEW.waterline - Math.min(...ys);
		const below = Math.max(...ys) - VIEW.waterline;
		expect(above).toBeGreaterThan(below);
	});

	it("shifts the whole profile when given a y offset", () => {
		const g = swellGeometry(clean);
		const yAt = (path: string) => Number(path.replace("M ", "").split(" L ")[0].split(" ")[1]);
		expect(yAt(swellPath(g, { yOffset: 20 })) - yAt(swellPath(g))).toBeCloseTo(20, 6);
	});

	it("adds visible ripple when the wind is tearing at the surface", () => {
		const g = swellGeometry({ ...clean, wind_speed_ms: 12, wind_relation: "onshore" });
		const clean2 = swellGeometry(clean);
		const spread = (path: string) => {
			const ys = path
				.replace("M ", "")
				.split(" L ")
				.map((p) => Number(p.split(" ")[1]));
			return Math.max(...ys) - Math.min(...ys);
		};
		expect(spread(swellPath(g))).toBeGreaterThan(spread(swellPath(clean2)));
	});
});

describe("swellFillPath", () => {
	it("closes the profile down to the bottom of the frame", () => {
		const path = swellFillPath(swellGeometry(clean));
		expect(path.endsWith("Z")).toBe(true);
		expect(path).toContain(`${VIEW.height}`);
	});
});

describe("bearingToPoint", () => {
	it("puts north at the top and east at the right", () => {
		const north = bearingToPoint(0, 10);
		expect(north.x).toBeCloseTo(0, 6);
		expect(north.y).toBeCloseTo(-10, 6);

		const east = bearingToPoint(90, 10);
		expect(east.x).toBeCloseTo(10, 6);
		expect(east.y).toBeCloseTo(0, 6);
	});

	it("runs clockwise, unlike raw trigonometry", () => {
		expect(bearingToPoint(45, 10).x).toBeGreaterThan(0);
		expect(bearingToPoint(45, 10).y).toBeLessThan(0);
		expect(bearingToPoint(225, 10).x).toBeLessThan(0);
		expect(bearingToPoint(225, 10).y).toBeGreaterThan(0);
	});

	it("honours the centre offset", () => {
		const p = bearingToPoint(0, 10, 50, 60);
		expect(p.x).toBeCloseTo(50, 6);
		expect(p.y).toBeCloseTo(50, 6);
	});
});

describe("drawing scales", () => {
	it("reports a true horizontal scale derived from the frame and the window", () => {
		expect(HORIZONTAL_PX_PER_M).toBeCloseTo(VIEW.width / WINDOW_M, 9);
	});

	it("exaggerates the vertical, since swell at true aspect would draw as a flat line", () => {
		expect(VERTICAL_EXAGGERATION).toBeGreaterThan(1);
	});

	it("keeps the exaggeration modest enough to stay honest when stated", () => {
		// A 400 m window against a 5 m full-scale height. Pinned deliberately: the caption quotes
		// this number to the reader, so a change to the drawing scale has to be a conscious one.
		expect(VERTICAL_EXAGGERATION).toBeLessThan(8);
		expect(VERTICAL_EXAGGERATION).toBeCloseTo(5.75, 2);
	});
});
