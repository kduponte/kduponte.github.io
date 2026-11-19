import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import data from "../../public/data/surf-forecast/buoy-snapshots.json";
import { INSTRUMENT_ENLARGEMENT, INSTRUMENT_UNITS_PER_M, MAX_TILT_RAD, buildBuoyDiorama, buoyTilt, type DioramaStation } from "../../src/lib/three/buoy-diorama";
import { UNITS_PER_M, surfaceHeight, surfaceSlope, swellField } from "../../src/lib/three/ocean";
import type { Instrument } from "../../src/lib/surf-forecast/buoy-snapshot";

const stations: DioramaStation[] = data.snapshots.map((s) => ({
	station: s.station,
	instrument: s.instrument as Instrument,
	observed: s.observed,
	forecasts: s.forecasts.map((f) => ({ system: f.system as DioramaStation["forecasts"][number]["system"], wave_height_m: f.wave_height_m, color: "#123456" })),
}));

describe("buoyTilt", () => {
	it("stands upright on a flat sea", () => {
		expect(buoyTilt({ dx: 0, dz: 0 }).angle).toBe(0);
	});

	it("follows a gentle slope at its true angle", () => {
		expect(buoyTilt({ dx: 0.02, dz: 0 }).angle).toBeCloseTo(Math.atan(0.02), 4);
	});

	it("never tips past the cap, however steep the drawn slope", () => {
		expect(buoyTilt({ dx: 50, dz: -50 }).angle).toBeLessThanOrEqual(MAX_TILT_RAD);
		expect(buoyTilt({ dx: 0.8, dz: 0 }).angle).toBeLessThan(MAX_TILT_RAD);
	});

	it("grows steadily with the slope", () => {
		const angles = [0.05, 0.2, 0.5, 1, 2].map((s) => buoyTilt({ dx: s, dz: 0 }).angle);
		for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThan(angles[i - 1]);
	});

	it("tips the buoy's axis toward the downslope side", () => {
		// The sea rises toward +X, so the surface normal leans toward -X, and so should the mast.
		const { axis, angle } = buoyTilt({ dx: 0.3, dz: 0 });
		const mast = new Vector3(0, 1, 0).applyAxisAngle(axis, angle);
		expect(mast.x).toBeLessThan(0);
		expect(mast.z).toBeCloseTo(0);
	});
});

describe("buildBuoyDiorama", () => {
	const d = buildBuoyDiorama(stations);

	it("starts on the first station, a Waverider", () => {
		expect(d.index).toBe(0);
		expect(d.active.instrument).toBe("waverider");
	});

	it("rides the drawn surface at the block's center", () => {
		const f = swellField(stations[0].observed);
		for (const t of [0, 1.3, 4.4]) {
			d.update(t);
			expect(d.buoyRig.position.y).toBeCloseTo(surfaceHeight(f, 0, 0, t), 6);
			const { angle } = buoyTilt(surfaceSlope(f, 0, 0, t), d.active.maxTilt_rad);
			expect(new Vector3(0, 1, 0).applyQuaternion(d.buoyRig.quaternion).angleTo(new Vector3(0, 1, 0))).toBeCloseTo(angle, 5);
		}
	});

	it("bobs once per wave period", () => {
		const T = stations[0].observed.dominant_period_s;
		d.update(2);
		const y = d.buoyRig.position.y;
		d.update(2 + T);
		expect(d.buoyRig.position.y).toBeCloseTo(y, 6);
	});

	it("switches to Monterey's discus and back, wrapping around the ends", () => {
		const monterey = stations.findIndex((s) => s.station === "46042");
		d.setStation(monterey);
		expect(d.active.instrument).toBe("discus");
		d.setStation(stations.length);
		expect(d.index).toBe(0);
		expect(d.active.instrument).toBe("waverider");
		d.setStation(-1);
		expect(d.index).toBe(stations.length - 1);
	});

	it("shows exactly one buoy at a time", () => {
		const visible = d.buoyRig.children.filter((c) => c.visible);
		expect(visible).toHaveLength(1);
	});

	it("keeps the lantern glow across a station switch", () => {
		d.setLantern(1.2);
		d.setStation(d.index + 1);
		expect(d.active.lantern.emissiveIntensity).toBe(1.2);
	});

	it("frames the Waverider stations at full size and draws Monterey smaller so its mast fits", () => {
		const monterey = stations.findIndex((s) => s.station === "46042");
		stations.forEach((s, i) => {
			if (i === monterey) return;
			expect(d.fitScale(i)).toBe(1);
		});
		const k = d.fitScale(monterey);
		expect(k).toBeLessThan(0.9);
		expect(k).toBeGreaterThan(0.4);
		// The discus mast top, scaled about the target, stays under the frame's top edge (flat
		// projection is enough here: the mast sits on the spin axis, at the target's depth).
		const { target, halfHeight, viewDir } = d.framing;
		const cosE = Math.cos(Math.asin(viewDir.clone().normalize().y));
		const half = halfHeight / Math.cos((14 * Math.PI) / 180);
		const mastTop = 0.25 + 5.5 * INSTRUMENT_UNITS_PER_M;
		expect((target.y + k * (mastTop - target.y) - target.y) * cosE).toBeLessThanOrEqual(half * 1.001);
		expect(d.framing.turnRadius).toBeGreaterThan(4);
	});

	it("draws the buoys the stated number of times larger than the sea's horizontal scale", () => {
		expect(INSTRUMENT_ENLARGEMENT).toBeCloseTo(INSTRUMENT_UNITS_PER_M / UNITS_PER_M);
	});

	it("tilts the wide discus less than the Waverider", () => {
		const monterey = stations.findIndex((s) => s.station === "46042");
		d.setStation(monterey);
		const discusCap = d.active.maxTilt_rad;
		d.setStation(0);
		expect(discusCap).toBeLessThan(d.active.maxTilt_rad);
		expect(discusCap).toBeGreaterThan(0.05);
	});

	it("disposes without throwing", () => {
		expect(() => d.dispose()).not.toThrow();
	});
});
