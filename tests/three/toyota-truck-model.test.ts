import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { buildToyotaTruck } from "../../src/lib/three/toyota-truck-model";

describe("buildToyotaTruck", () => {
	const truck = buildToyotaTruck();

	it("has four wheel pivots", () => {
		expect(truck.wheels).toHaveLength(4);
	});

	it("builds a plausible number of parts", () => {
		expect(truck.parts.length).toBeGreaterThan(15);
		expect(truck.parts.length).toBeLessThan(60);
	});

	it("is longest along X (front to back)", () => {
		const size = new Box3().setFromObject(truck.group).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(size.z);
		expect(size.x).toBeGreaterThan(size.y);
	});

	it("sits above the ground plane", () => {
		const box = new Box3().setFromObject(truck.group);
		expect(box.min.y).toBeGreaterThanOrEqual(-0.1);
		expect(box.min.y).toBeLessThanOrEqual(0.1);
	});

	it("disposes without throwing", () => {
		expect(() => truck.dispose()).not.toThrow();
	});
});
