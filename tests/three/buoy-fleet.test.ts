import { describe, expect, it } from "vitest";
import { Box3, Mesh, type Object3D } from "three";
import pages from "../../public/data/surf-forecast/buoy-stations.json";
import coverage from "../../public/data/surf-forecast/coverage.json";
import stationRows from "../../public/data/surf-forecast/stations.json";
import { buoyProfiles, type ErrorRow } from "../../src/lib/surf-forecast/buoy-profiles";
import { FLEET_FLOOR_CLEARANCE_M, FLEET_GAP_M, FLEET_MARGIN_M, FLEET_SCALE_STEP_M, buildBuoyFleet, fleetLayout, type FleetStation } from "../../src/lib/three/buoy-fleet";
import { frameAspect } from "../../src/lib/three/buoy-diorama";

const stations: FleetStation[] = buoyProfiles({
	pages: pages.stations,
	coverage: coverage.rows,
	errors: stationRows.rows as ErrorRow[],
	representative: { ecmwf: "ecmwf_wam", noaa: "ncep_gfswave016", dwd: "gwam" },
	systems: ["ecmwf", "noaa", "dwd"],
}).map(({ station, name, region, instrument, longitude }) => ({ station, name, region, instrument, longitude }));

describe("fleetLayout", () => {
	const r = (i: number) => (stations[i].instrument === "discus" ? 1.6 : 0.5);
	const layout = fleetLayout(stations, r);

	it("puts each region in its own row, Hawaii at the back, west to east", () => {
		expect(layout.rows.map((row) => row.region)).toEqual(["hawaii", "norcal", "socal"]);
		expect(layout.rows[0].z).toBeLessThan(layout.rows[1].z);
		expect(layout.rows[1].z).toBeLessThan(layout.rows[2].z);
		for (const row of layout.rows) {
			const xs = row.indices.map((i) => layout.slots[i].x);
			const lons = row.indices.map((i) => stations[i].longitude);
			expect([...xs].sort((a, b) => a - b)).toEqual(xs);
			expect([...lons].sort((a, b) => a - b)).toEqual(lons);
		}
	});

	it("spaces hulls the gap apart edge to edge, and rows the gap apart", () => {
		for (const row of layout.rows) {
			for (let k = 1; k < row.indices.length; k++) {
				const [a, b] = [row.indices[k - 1], row.indices[k]];
				expect(layout.slots[b].x - layout.slots[a].x - r(a) - r(b)).toBeCloseTo(FLEET_GAP_M, 9);
			}
		}
		const half = (k: number) => Math.max(...layout.rows[k].indices.map(r));
		expect(layout.rows[1].z - layout.rows[0].z - half(0) - half(1)).toBeCloseTo(FLEET_GAP_M, 9);
	});

	it("leaves room in every gap for the selection ring (the hull's reach + 0.275 m)", () => {
		expect(0.275).toBeLessThan(FLEET_GAP_M);
	});

	it("keeps every hull on the water with the margin to spare", () => {
		stations.forEach((_, i) => {
			const { x, z } = layout.slots[i];
			expect(Math.abs(x) + r(i)).toBeLessThanOrEqual(layout.width / 2 - FLEET_MARGIN_M + 1e-9);
			expect(Math.abs(z) + r(i)).toBeLessThanOrEqual(layout.depth / 2 - FLEET_MARGIN_M + 1e-9);
		});
	});
});

describe("buildBuoyFleet", () => {
	const fleet = buildBuoyFleet(stations);
	fleet.group.updateMatrixWorld(true);

	it("floats every station's buoy at still water, the discus among them", () => {
		expect(fleet.models).toHaveLength(stations.length);
		fleet.models.forEach((m, i) => {
			expect(m.group.position.y).toBe(0);
			expect(m.instrument).toBe(stations[i].instrument);
		});
	});

	it(`cuts the water ${FLEET_FLOOR_CLEARANCE_M} m below the deepest hull`, () => {
		const deepest = Math.min(...fleet.models.map((m) => new Box3().setFromObject(m.group).min.y));
		expect(fleet.blockDepth).toBeCloseTo(-deepest + FLEET_FLOOR_CLEARANCE_M, 9);
	});

	it(`carries a scale bar in ${FLEET_SCALE_STEP_M} m steps across the water`, () => {
		const steps: Mesh[] = [];
		fleet.group.traverse((o) => o instanceof Mesh && o.userData.kind === "scale-step" && steps.push(o));
		expect(steps.length).toBe(Math.floor(fleet.layout.width / FLEET_SCALE_STEP_M));
		const gap = steps[1].position.x - steps[0].position.x;
		expect(gap).toBeCloseTo(FLEET_SCALE_STEP_M, 9);
	});

	it("lights only the selected buoy's lantern and rings it", () => {
		const rings = () => {
			const out: Object3D[] = [];
			fleet.group.traverse((o) => o.userData.kind === "selection" && out.push(o));
			return out;
		};
		expect(rings()).toHaveLength(stations.length);
		fleet.update(0, true);
		expect(fleet.models.map((m) => m.lantern.emissiveIntensity > 0)).toEqual(stations.map((_, i) => i === 0));
		const monterey = stations.findIndex((s) => s.station === "46042");
		fleet.setStation(monterey);
		expect(fleet.busy()).toBe(true);
		fleet.update(0, true);
		expect(fleet.busy()).toBe(false);
		expect(fleet.models[monterey].lantern.emissiveIntensity).toBeGreaterThan(0);
		expect(fleet.models[0].lantern.emissiveIntensity).toBe(0);
		expect(rings().filter((r) => r.visible)).toHaveLength(1);
		fleet.setStation(stations.length);
		expect(fleet.index).toBe(0);
	});

	it("frames the whole turning fleet in a box wider than tall", () => {
		const { turnRadius, halfHeight } = fleet.framing;
		const box = new Box3().setFromObject(fleet.group);
		const reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
		expect(turnRadius).toBeGreaterThanOrEqual(reach * Math.SQRT1_2);
		expect(halfHeight).toBeGreaterThan(0);
		const aspect = frameAspect(fleet.framing);
		expect(aspect).toBeGreaterThan(1);
		expect(aspect).toBeLessThan(3);
	});
});
