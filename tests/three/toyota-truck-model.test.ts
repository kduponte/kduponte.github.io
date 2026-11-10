import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
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
		expect(truck.parts.length).toBeLessThan(400);
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

	it("disposes without throwing", () => {
		expect(() => truck.dispose()).not.toThrow();
	});
});
