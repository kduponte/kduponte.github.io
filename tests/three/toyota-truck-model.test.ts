import { describe, expect, it } from "vitest";
import { Box3, MeshStandardMaterial, Vector3 } from "three";
import { buildToyotaTruck, type TruckModel } from "../../src/lib/three/toyota-truck-model";

/** Bounds of the vehicle itself, excluding the ground shadow. */
function vehicleBounds(truck: TruckModel): Box3 {
	truck.group.updateMatrixWorld(true);
	const box = new Box3();
	for (const part of truck.parts) box.expandByObject(part);
	return box;
}

describe("buildToyotaTruck", () => {
	const truck = buildToyotaTruck();

	it("has four wheel pivots", () => {
		expect(truck.wheels).toHaveLength(4);
	});

	it("builds a plausible number of parts", () => {
		expect(truck.parts.length).toBeGreaterThan(60);
		expect(truck.parts.length).toBeLessThan(500);
	});

	it("is longest along X (front to back)", () => {
		const size = vehicleBounds(truck).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(size.z);
		expect(size.x).toBeGreaterThan(size.y);
	});

	it("has a long-bed pickup length-to-width ratio", () => {
		const size = vehicleBounds(truck).getSize(new Vector3());
		expect(size.x / size.z).toBeGreaterThan(2.4);
		expect(size.x / size.z).toBeLessThan(3.4);
	});

	it("sits above the ground plane", () => {
		const box = vehicleBounds(truck);
		expect(box.min.y).toBeGreaterThanOrEqual(-0.1);
		expect(box.min.y).toBeLessThanOrEqual(0.1);
	});

	it("is about as tall as a real regular-cab pickup relative to its length", () => {
		const size = vehicleBounds(truck).getSize(new Vector3());
		expect(size.y / size.x).toBeGreaterThan(0.28);
		expect(size.y / size.x).toBeLessThan(0.36);
	});

	it("exposes emissive light materials for flashing", () => {
		expect(truck.lights.head.emissiveIntensity).toBe(0);
		expect(truck.lights.tail.emissiveIntensity).toBe(0);
	});

	it("has the US 1989-91 front: two 7x6-inch (200 x 142 mm) sealed-beam headlights", () => {
		truck.group.updateMatrixWorld(true);
		const heads = truck.parts.filter((p) => {
			if (p.material !== truck.lights.head) return false;
			const size = new Box3().setFromObject(p).getSize(new Vector3());
			return Math.abs(size.z - 0.2) < 0.005 && Math.abs(size.y - 0.142) < 0.005;
		});
		expect(heads).toHaveLength(2);
	});

	it("has a chrome front bumper, not the Hilux's plastic one", () => {
		truck.group.updateMatrixWorld(true);
		const box = vehicleBounds(truck);
		// The full-width part (wider than the 1.64 m body) that reaches farthest forward is the bumper.
		const BUMPER_MIN_WIDTH = 1.64;
		const wide = truck.parts
			.map((p) => ({ p, b: new Box3().setFromObject(p) }))
			.filter(({ b }) => b.max.z - b.min.z > BUMPER_MIN_WIDTH && b.max.x > box.max.x - 0.05)
			.sort((a, b) => b.b.max.x - a.b.max.x);
		expect(wide.length).toBeGreaterThan(0);
		expect((wide[0].p.material as MeshStandardMaterial).metalness).toBeGreaterThanOrEqual(0.8);
	});

	it("disposes without throwing", () => {
		expect(() => truck.dispose()).not.toThrow();
	});
});
