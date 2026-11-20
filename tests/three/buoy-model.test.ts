import { describe, expect, it } from "vitest";
import { Box3, Vector3, type Mesh } from "three";
import {
	DISCUS_ANEMOMETER_HEIGHT_M,
	DISCUS_DIAMETER_M,
	WAVERIDER_DIAMETER_M,
	buildBuoy,
	buildDiscus,
	buildWaverider,
	partsOfKind,
	type BuoyModel,
} from "../../src/lib/three/buoy-model";

function bounds(meshes: Mesh[]): Box3 {
	const box = new Box3();
	for (const m of meshes) {
		m.updateWorldMatrix(true, false);
		box.expandByObject(m);
	}
	return box;
}
const size = (b: Box3) => b.getSize(new Vector3());

describe.each([
	["Waverider", buildWaverider()],
	["discus", buildDiscus("46042")],
] as [string, BuoyModel][])("%s", (_, buoy) => {
	buoy.group.updateMatrixWorld(true);

	it("floats across the waterline, mostly above it", () => {
		const box = bounds(buoy.parts);
		expect(box.min.y).toBeLessThan(0);
		expect(box.max.y).toBeGreaterThan(-box.min.y);
	});

	it("reports its highest point", () => {
		expect(bounds(buoy.parts).max.y).toBeCloseTo(buoy.height_m, 2);
	});

	it("has a lantern lit by an emissive material that starts dark", () => {
		const lantern = partsOfKind(buoy, "lantern");
		expect(lantern).toHaveLength(1);
		expect(lantern[0].material).toBe(buoy.lantern);
		expect(buoy.lantern.emissiveIntensity).toBe(0);
		expect(buoy.lantern.emissive.getHex()).not.toBe(0);
	});

	it("carries solar panels and an antenna", () => {
		expect(partsOfKind(buoy, "solar").length).toBeGreaterThanOrEqual(3);
		expect(partsOfKind(buoy, "antenna").length).toBeGreaterThanOrEqual(1);
	});

	it("hangs its mooring from an eye under the hull", () => {
		const eye = bounds(partsOfKind(buoy, "mooring-eye"));
		const hull = bounds(partsOfKind(buoy, "hull"));
		expect(eye.max.y).toBeLessThanOrEqual(hull.min.y + 0.01);
		expect(buoy.mooring_m).toBeLessThan(eye.max.y);
		expect(buoy.mooring_m).toBeGreaterThan(eye.min.y - 0.05);
	});

	it("is round in plan", () => {
		const s = size(bounds(partsOfKind(buoy, "hull")));
		expect(s.x).toBeCloseTo(s.z, 2);
	});

	it("disposes without throwing", () => {
		expect(() => buoy.dispose()).not.toThrow();
	});
});

describe("buildWaverider", () => {
	const w = buildWaverider();
	w.group.updateMatrixWorld(true);

	it("is a 0.9 m sphere riding at its equator", () => {
		const hull = size(bounds(partsOfKind(w, "hull")));
		expect(hull.x).toBeCloseTo(WAVERIDER_DIAMETER_M, 2);
		expect(hull.y).toBeCloseTo(WAVERIDER_DIAMETER_M, 2);
		const c = bounds(partsOfKind(w, "hull")).getCenter(new Vector3());
		expect(Math.abs(c.y)).toBeLessThan(0.05);
	});

	it("wears its fender at the equator, just outside the hull", () => {
		const fender = bounds(partsOfKind(w, "fender"));
		const hull = bounds(partsOfKind(w, "hull"));
		expect(fender.getCenter(new Vector3()).y).toBeCloseTo(hull.getCenter(new Vector3()).y, 3);
		expect(size(fender).x).toBeGreaterThan(size(hull).x);
		expect(size(fender).x).toBeLessThan(WAVERIDER_DIAMETER_M + 0.2);
	});

	it("puts the hatch on top and the lantern above it", () => {
		const hatch = bounds(partsOfKind(w, "hatch"));
		const lantern = bounds(partsOfKind(w, "lantern"));
		expect(hatch.min.y).toBeGreaterThan(0.35);
		expect(lantern.min.y).toBeGreaterThan(hatch.max.y);
	});
});

describe("buildDiscus", () => {
	const d = buildDiscus("46042");
	d.group.updateMatrixWorld(true);

	it("is a 3 m hull", () => {
		const hull = size(bounds(partsOfKind(d, "hull")));
		expect(hull.x).toBeCloseTo(DISCUS_DIAMETER_M, 2);
		expect(hull.y).toBeLessThan(1.2);
	});

	it("carries its anemometers at NDBC's nominal 5 m", () => {
		const vanes = partsOfKind(d, "anemometer");
		expect(vanes.length).toBeGreaterThan(0);
		const c = bounds(vanes).getCenter(new Vector3());
		expect(c.y).toBeCloseTo(DISCUS_ANEMOMETER_HEIGHT_M, 1);
	});

	it("stands a lattice tower between the deck and the anemometers", () => {
		const tower = bounds(partsOfKind(d, "tower"));
		expect(partsOfKind(d, "tower").length).toBeGreaterThan(12);
		expect(tower.min.y).toBeLessThan(0.6);
		expect(tower.max.y).toBeGreaterThan(4);
		expect(size(tower).x).toBeLessThan(DISCUS_DIAMETER_M);
	});

	it("letters its station number and NOAA on the hull", () => {
		expect(partsOfKind(d, "letter").length).toBeGreaterThan(20);
	});
});

describe("one shared scale", () => {
	it("makes the discus visibly dwarf a Waverider", () => {
		const w = buildWaverider();
		const d = buildDiscus();
		const ws = size(bounds(w.parts));
		const ds = size(bounds(d.parts));
		expect(ds.x / ws.x).toBeGreaterThan(2.5);
		expect(d.height_m / w.height_m).toBeGreaterThan(3);
		expect(DISCUS_DIAMETER_M / WAVERIDER_DIAMETER_M).toBeCloseTo(3.33, 2);
	});

	it("picks the builder from the instrument", () => {
		expect(buildBuoy("discus", "46042").instrument).toBe("discus");
		expect(buildBuoy("waverider", "51201").instrument).toBe("waverider");
	});
});
