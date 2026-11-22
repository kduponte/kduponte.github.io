import { describe, expect, it } from "vitest";
import { Box3, Group, Vector3 } from "three";
import {
	AS_IT_SITS,
	CATALOG,
	FRONT_TINTS,
	KYLE_BUILD,
	REAR_TINTS,
	decodeBuild,
	describeBuild,
	encodeBuild,
	resolveBuild,
	tireDiameter,
	truckSetup,
	type Build,
} from "../../src/lib/three/truck-builder-options";
import { OPEN_ANGLES, buildToyotaTruck, type TruckModel } from "../../src/lib/three/toyota-truck-model";

const INCH = 0.0254;

function bounds(truck: TruckModel): Box3 {
	truck.group.updateMatrixWorld(true);
	const box = new Box3();
	for (const p of truck.parts) box.expandByObject(p);
	return box;
}

describe("truck builder catalog", () => {
	it("works out tire diameters from the size code", () => {
		// 195/75R14: 14 in rim + 2 x 146.25 mm sidewalls = 648.1 mm, about 25.5 in.
		expect(tireDiameter(195, 75, 14) / INCH).toBeCloseTo(25.5, 1);
		expect(tireDiameter(215, 65, 15) / INCH).toBeCloseTo(26.0, 1);
		expect(tireDiameter(205, 60, 15) / INCH).toBeCloseTo(24.7, 1);
	});

	it("keeps Hawaii's 35% limit on the front side windows and allows darker film only on the rear window", () => {
		expect(Math.min(...FRONT_TINTS.map((t) => t.vlt))).toBe(0.35);
		expect(Math.min(...REAR_TINTS.map((t) => t.vlt))).toBeLessThan(0.35);
	});

	it("cites a source for every option that claims a number", () => {
		for (const list of Object.values(CATALOG)) {
			for (const o of list) if (/\d/.test(o.spec)) expect(o.source?.href, `${o.name}`).toBeTruthy();
		}
	});

	it("builds Kyle's truck in factory black on Ultra Hammers, lowered on a Belltech kit, with LED headlights", () => {
		const r = resolveBuild(KYLE_BUILD);
		expect(r.paint.name).toBe("Black");
		expect(r.wheel.style).toBe("hammer");
		expect(r.ride.id).toBe("b444");
		expect(r.lights.kind).toBe("led");
		expect(r.tire.rimIn).toBe(r.wheel.diameterIn);
	});

	it("round-trips a build through the share link", () => {
		const build: Build = { ...AS_IT_SITS, paint: "8E3", ride: "b444", wheel: "hammer", tire: "205-60-15", tintRear: "5", lights: "led", bed: "tonneau", decal: "kalapana" };
		expect(decodeBuild(`#build=${encodeBuild(build)}`)).toEqual(build);
	});

	it("falls back to the truck as it sits for anything unknown in a link", () => {
		expect(decodeBuild("#build=paint=nope&wheel=???")).toEqual(AS_IT_SITS);
	});

	it("only puts a tire on a wheel of its own rim size", () => {
		const r = resolveBuild({ ...AS_IT_SITS, wheel: "alloy15", tire: "195-75-14" });
		expect(r.tire.rimIn).toBe(15);
		expect(describeBuild({ ...AS_IT_SITS, wheel: "alloy15" }).find((l) => l.label === "Tires")?.value).toMatch(/R15/);
	});
});

describe("buildToyotaTruck with builder options", () => {
	it("still builds the hero truck exactly as before when given no options", () => {
		const hero = buildToyotaTruck();
		expect(hero.openers).toBeUndefined();
		expect(hero.wheels[0].position.y).toBeCloseTo(0.33, 9);
		hero.dispose();
	});

	it("stands the wheels on the ground at the tire's real radius", () => {
		const { body, options } = truckSetup({ ...AS_IT_SITS, wheel: "alloy15", tire: "215-65-15" });
		const truck = buildToyotaTruck(undefined, { ...options, metallicPaint: false });
		expect(body).toMatch(/^#/);
		for (const w of truck.wheels) expect(w.position.y).toBeCloseTo(tireDiameter(215, 65, 15) / 2, 9);
		truck.dispose();
	});

	it("lowers the body by the kit's drop at each axle", () => {
		const stock = buildToyotaTruck(undefined, truckSetup(AS_IT_SITS).options);
		const low = buildToyotaTruck(undefined, truckSetup({ ...AS_IT_SITS, ride: "b444" }).options);
		// Belltech 444: 2 in at the front axle, 3 in at the rear.
		const atX = (t: TruckModel, x: number) => {
			t.group.updateMatrixWorld(true);
			return new Vector3(x, 0.33, 0).applyMatrix4(t.group.children[0].matrixWorld).y;
		};
		expect(atX(stock, 1.35) - atX(low, 1.35)).toBeCloseTo(2 * INCH, 3);
		expect(atX(stock, -1.6) - atX(low, -1.6)).toBeCloseTo(3 * INCH, 3);
		stock.dispose();
		low.dispose();
	});

	it("hinges the hood, both doors and the tailgate, and swings them by the set angles", () => {
		const engine = new Group();
		const truck = buildToyotaTruck(undefined, { openable: true, engine });
		expect(Object.keys(truck.openers ?? {}).sort()).toEqual(["doorLeft", "doorRight", "hood", "tailgate"]);
		expect(engine.parent).toBeTruthy();
		truck.setOpen?.("hood", 1);
		truck.setOpen?.("doorRight", 1);
		truck.setOpen?.("doorLeft", 1);
		truck.setOpen?.("tailgate", 0.5);
		expect(truck.openers!.hood.rotation.z).toBeCloseTo(OPEN_ANGLES.hood, 9);
		expect(truck.openers!.doorRight.rotation.y).toBeCloseTo(OPEN_ANGLES.door, 9);
		expect(truck.openers!.doorLeft.rotation.y).toBeCloseTo(-OPEN_ANGLES.door, 9);
		expect(truck.openers!.tailgate.rotation.z).toBeCloseTo(OPEN_ANGLES.tailgate / 2, 9);
		// The doors swing outboard, widening the truck.
		const shut = buildToyotaTruck(undefined, { openable: true });
		expect(bounds(truck).getSize(new Vector3()).z).toBeGreaterThan(bounds(shut).getSize(new Vector3()).z + 1);
		for (const m of truck.parts) if (m.userData.opener) expect(Object.keys(truck.openers!)).toContain(m.userData.opener);
		truck.dispose();
		shut.dispose();
	});

	it("adds a cab-high shell whose roof sits level with the cab's", () => {
		const open = buildToyotaTruck(undefined, { bed: "none" });
		const shell = buildToyotaTruck(undefined, { bed: "shell" });
		expect(bounds(shell).max.y).toBeCloseTo(bounds(open).max.y, 1);
		expect(shell.parts.length).toBeGreaterThan(open.parts.length);
		open.dispose();
		shell.dispose();
	});
});
