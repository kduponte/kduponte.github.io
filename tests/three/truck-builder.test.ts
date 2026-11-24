import { describe, expect, it } from "vitest";
import { BackSide, Box3, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Vector3, type Object3D } from "three";
import {
	AS_IT_SITS,
	CARGO,
	CATALOG,
	FRONT_TINTS,
	KYLE_BUILD,
	NOAH_BUILD,
	PICKER_GROUPS,
	REAR_TINTS,
	SHOCKS,
	TIRES,
	WHEELS,
	WINDSHIELD_TINTS,
	decodeBuild,
	describeBuild,
	encodeBuild,
	resolveBuild,
	tireDiameter,
	truckSetup,
	type Build,
} from "../../src/lib/three/truck-builder-options";
import { CARGO_FLOOR_Y, DEFAULT_TRUCK_COLORS, OPEN_ANGLES, buildToyotaTruck, type TruckModel } from "../../src/lib/three/toyota-truck-model";
import { FRAME_RADIUS, SPIN_CENTER_X } from "../../src/scripts/three/subjects/truck-builder";

const INCH = 0.0254;

function bounds(truck: TruckModel): Box3 {
	truck.group.updateMatrixWorld(true);
	const box = new Box3();
	for (const p of truck.parts) box.expandByObject(p);
	return box;
}

/** Bounds of the visible parts under a named node (outline shells left out). */
function boundsOf(truck: TruckModel, name: string): Box3 {
	truck.group.updateMatrixWorld(true);
	const node = truck.group.getObjectByName(name);
	const box = new Box3();
	if (!node) return box;
	for (const p of truck.parts) {
		let o: Object3D | null = p;
		while (o && o !== node) o = o.parent;
		if (o) box.expandByObject(p, true); // precise: from the vertices, not a rotated bounding box
	}
	return box;
}

const colorOf = (m: Mesh) => (m.material as MeshStandardMaterial).color?.getHexString();

describe("truck builder catalog", () => {
	it("works out tire diameters from the size code", () => {
		// 195/75R14: 14 in rim + 2 x 146.25 mm sidewalls = 648.1 mm, about 25.5 in.
		expect(tireDiameter(195, 75, 14) / INCH).toBeCloseTo(25.5, 1);
		expect(tireDiameter(215, 65, 15) / INCH).toBeCloseTo(26.0, 1);
		expect(tireDiameter(205, 60, 15) / INCH).toBeCloseTo(24.7, 1);
	});

	it("labels every film darker than Hawaii allows: under 35% on the front side windows, any film across the windshield", () => {
		for (const t of FRONT_TINTS) if (t.vlt < 0.35) expect(t.note, t.name).toMatch(/35% limit/);
		for (const t of WINDSHIELD_TINTS) if (t.id !== "none") expect(t.note, t.name).toMatch(/top edge of a windshield/);
		// A truck's rear window is exempt, so darker film there carries no warning.
		for (const t of REAR_TINTS) expect(t.note ?? "").not.toMatch(/limit|law allows/);
		expect(Math.min(...REAR_TINTS.map((t) => t.vlt))).toBeLessThan(0.35);
	});

	it("cites a source for every option that claims a number", () => {
		for (const list of Object.values(CATALOG)) {
			for (const o of list) if (/\d/.test(o.spec)) expect(o.source?.href, `${o.name}`).toBeTruthy();
		}
	});

	it("builds Kyle's truck in factory black on chrome BBS RG-R mesh wheels, lowered on a Belltech kit, with LED headlights", () => {
		const r = resolveBuild(KYLE_BUILD);
		expect(r.paint.name).toBe("Black");
		expect(r.wheel.style).toBe("mesh");
		expect(r.wheel.finish).toBe("chrome");
		expect(r.wheel.diameterIn).toBe(17);
		expect(r.ride.id).toBe("b444");
		expect(r.lights.kind).toBe("led");
		expect(r.tire.rimIn).toBe(r.wheel.diameterIn);
	});

	it("gives Kyle low-profile tires, 20% film on every window including the windshield, a plain tailgate and a longboard", () => {
		const r = resolveBuild(KYLE_BUILD);
		expect(r.tire.aspect).toBeLessThanOrEqual(50);
		expect([r.tintFront.vlt, r.tintRear.vlt, r.tintWindshield.vlt]).toEqual([0.2, 0.2, 0.2]);
		expect(r.tailgate.lettering).toBe(false);
		expect(r.exhaust.kind).toBe("tip");
		expect(r.cargo.kind).toBe("longboard");
		expect(r.bed.kind).toBe("none");
	});

	it("builds Noah's monster-truck version: 1991 navy, 6.5 in of lift, 35 in Boggers on 15 x 10s, shock hoops, steps, stacks, McFly roll bar", () => {
		const r = resolveBuild(NOAH_BUILD);
		expect(r.paint.id).toBe("8E3");
		expect(r.paint.spec).toContain("1991 factory");
		expect([r.ride.front, r.ride.rear].map((m) => m / INCH)).toEqual([6.5, 6.5]);
		expect(r.steps.kind).toBe("tube");
		expect(r.shocks.kind).toBe("hoops");
		expect(r.exhaust.kind).toBe("stacks");
		// Interco's B-150: 35.3 in tall, 13.2 in wide, 24/32 in lugs across a 10.9 in tread.
		expect(tireDiameter(r.tire.widthMm, r.tire.aspect, r.tire.rimIn) / INCH).toBeCloseTo(35.3, 6);
		expect(r.tire.widthMm / 25.4).toBeCloseTo(13.2, 6);
		expect(r.tire.lugs).toEqual({ depthIn: 24 / 32, treadWidthIn: 10.9 });
		expect(r.tire.spec).toBe('35.3" tall, 13.2" wide, 24/32" lugs');
		expect(r.wheel.widthIn).toBe(10);
		expect(r.rack.kind).toBe("rollbar");
	});

	it("drops the cargo when a shell or cover closes the bed, but not for a spray-in liner", () => {
		for (const bed of ["shell", "tonneau"]) expect(resolveBuild({ ...KYLE_BUILD, bed }).cargo.kind).toBe("none");
		expect(resolveBuild({ ...KYLE_BUILD, bed: "linex" }).cargo.kind).toBe("longboard");
	});

	it("offers at least four choices in every picker group, and at least four tires for every wheel size", () => {
		for (const g of PICKER_GROUPS) expect(CATALOG[g.key].length, g.label).toBeGreaterThanOrEqual(4);
		for (const d of new Set(WHEELS.map((w) => w.diameterIn))) expect(TIRES.filter((t) => t.rimIn === d).length, `${d} in wheels`).toBeGreaterThanOrEqual(4);
	});

	it("still opens links from before the bed held more than a surfboard", () => {
		expect(decodeBuild("#build=paint=202&board=longboard").cargo).toBe("longboard");
		expect(describeBuild({ ...AS_IT_SITS, cargo: "crf50f" }).find((l) => l.label === "Cargo")?.value).toMatch(/CRF50F/);
	});

	it("round-trips a build through the share link", () => {
		const build: Build = { ...AS_IT_SITS, paint: "8E3", ride: "b444", wheel: "hammer", tire: "215-45-17", tintRear: "5", tintWindshield: "35", lights: "led", bed: "tonneau", decal: "kalapana" };
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

	it("puts the longboard's tail out past the tailgate with the fin pointing up", () => {
		const plain = buildToyotaTruck(undefined, { bed: "none" });
		const withBoard = buildToyotaTruck(undefined, { bed: "none", board: true });
		const b0 = bounds(plain);
		withBoard.group.updateMatrixWorld(true);
		const box = new Box3().setFromObject(withBoard.group.children[0]);
		expect(box.min.x).toBeLessThan(b0.min.x - 0.5);
		plain.dispose();
		withBoard.dispose();
	});

	it("rests the rockered longboard on the bed floor without sinking through it", () => {
		const truck = buildToyotaTruck(undefined, { bed: "none", board: true });
		truck.group.updateMatrixWorld(true);
		const boardBox = new Box3();
		// The board is built by its own kit, so find its white body by walking the scene.
		truck.group.traverse((o) => {
			const hex = ((o as { material?: { color?: { getHexString(): string } } }).material?.color)?.getHexString();
			if (hex === "f6f5f0") boardBox.expandByObject(o);
		});
		// The bed floor's top sits at 0.665 m; the nose tip should touch it, not go under it.
		expect(boardBox.min.y).toBeGreaterThan(0.66);
		expect(boardBox.min.y).toBeLessThan(0.72);
		truck.dispose();
	});

	it("tints the windshield only when a windshield film is chosen", () => {
		const opacities = (t: TruckModel) => t.parts.map((m) => (m.material as MeshStandardMaterial).opacity);
		const clear = buildToyotaTruck(undefined, { glassVlt: { front: 0.74, rear: 0.74 } });
		const dark = buildToyotaTruck(undefined, { glassVlt: { front: 0.74, rear: 0.74, windshield: 0.2 } });
		expect(opacities(clear).some((o) => Math.abs(o - 0.8) < 1e-9)).toBe(false);
		expect(opacities(dark).filter((o) => Math.abs(o - 0.8) < 1e-9)).toHaveLength(1);
		clear.dispose();
		dark.dispose();
	});

	it("plates the mesh wheel's spokes in chrome or leaves them Diamond Black", () => {
		const colorsOf = (finish: "black" | "chrome") => {
			const t = buildToyotaTruck(undefined, truckSetup({ ...AS_IT_SITS, wheel: finish === "chrome" ? "bbs-rgr-chrome" : "bbs-rgr", tire: "215-45-17" }).options);
			const hexes = new Set(t.parts.map((m) => (m.material as MeshStandardMaterial).color.getHexString()));
			t.dispose();
			return hexes;
		};
		expect(colorsOf("black").has("2a2d31")).toBe(true);
		expect(colorsOf("chrome").has("2a2d31")).toBe(false);
	});

	it("stands Noah's twin stacks 36 in up from the bed floor, and puts Kyle's chrome tip out under the bumper", () => {
		const mirror = (t: TruckModel) => {
			t.group.updateMatrixWorld(true);
			const box = new Box3();
			for (const m of t.parts) {
				const mat = m.material as MeshStandardMaterial;
				if (mat.color.getHexString() === "ffffff" && mat.metalness === 1) box.expandByObject(m);
			}
			return box;
		};
		const stacks = buildToyotaTruck(undefined, { exhaust: "stacks" });
		stacks.group.updateMatrixWorld(true);
		// The two stacks are the open 36-inch tubes; each tops out at the 0.665 m bed floor plus 36 in, the
		// mitered front edge the tallest point.
		const tubes = stacks.parts.filter((m) => {
			const p = (m.geometry as { parameters?: { height?: number; openEnded?: boolean } }).parameters;
			return p?.openEnded && Math.abs((p.height ?? 0) - 36 * INCH) < 1e-9;
		});
		expect(tubes).toHaveLength(2);
		for (const t of tubes) expect(new Box3().setFromObject(t).max.y).toBeCloseTo(0.665 + 36 * INCH, 2);
		const tip = buildToyotaTruck(undefined, { exhaust: "tip" });
		const tipBox = mirror(tip);
		expect(tipBox.getSize(new Vector3()).x / INCH).toBeCloseTo(5.25, 1);
		expect(tipBox.max.z).toBeLessThan(0); // driver's side
		const factory = buildToyotaTruck(undefined, { exhaust: "factory" });
		expect(mirror(factory).isEmpty()).toBe(true);
		for (const t of [stacks, tip, factory]) t.dispose();
	});

	it("stands mud lugs proud of the carcass, reaching the tire's full 35.3 in", () => {
		const { options } = truckSetup(NOAH_BUILD);
		const t = buildToyotaTruck(undefined, options);
		const plain = buildToyotaTruck(undefined, { ...options, tire: { ...options.tire, lugs: undefined } });
		t.group.updateMatrixWorld(true);
		plain.group.updateMatrixWorld(true);
		// Measured over the visible parts only, not their outline shells.
		const wheelBox = (truck: TruckModel) => {
			const box = new Box3();
			for (const p of truck.parts) if (p.parent === truck.wheels[0]) box.expandByObject(p);
			return box.getSize(new Vector3());
		};
		expect(wheelBox(t).y / INCH).toBeCloseTo(35.3, 1);
		expect(t.parts.length).toBe(plain.parts.length + 4);
		// The lugs make up the height a plain tire of the same size gets from its carcass alone...
		expect(Math.abs(wheelBox(t).y - wheelBox(plain).y) / INCH).toBeLessThan(0.1);
		// ...so the mud tire's carcass sits a lug's depth (24/32 in) inside it.
		const carcass = t.wheels[0].children.find((c) => (c as Mesh).geometry?.type === "LatheGeometry") as Mesh;
		carcass.geometry.computeBoundingBox();
		const carcassR = carcass.geometry.boundingBox!.max.x;
		expect((t.wheels[0].position.y - carcassR) / INCH).toBeCloseTo(24 / 32, 2);
		for (const x of [t, plain]) x.dispose();
	});

	it("stands Noah's front shocks two to a wheel on hoops, inboard of the tires and showing over them, under the top of the arch", () => {
		const { body, options } = truckSetup(NOAH_BUILD);
		const t = buildToyotaTruck({ ...DEFAULT_TRUCK_COLORS, body }, { ...options, openable: true });
		t.group.updateMatrixWorld(true);
		const white = (m: Mesh) => (m.material as MeshStandardMaterial).color.getHexString() === "f2f1ec";
		const shockBodies = t.parts.filter(white);
		expect(shockBodies).toHaveLength(4);
		const front = t.wheels.filter((w) => w.position.x > 0);
		const tireR = front[0].position.y;
		const tireInner = Math.min(...front.map((w) => Math.abs(w.position.z))) - options.tire.widthMm / 2000;
		// The body rises by the lift plus the tire's extra radius over the 0.33 m reference; the arch tops out 0.74 up it.
		const archTop = 6.5 * INCH + tireR - 0.33 + 0.74;
		for (const s of shockBodies) {
			const shock = s.parent!;
			const box = new Box3().setFromObject(shock);
			expect(Math.abs((box.min.z + box.max.z) / 2)).toBeLessThan(tireInner);
			expect(box.max.y).toBeGreaterThan(2 * tireR);
			expect(box.max.y).toBeLessThan(archTop);
			expect(((s.geometry as CylinderGeometry).parameters.radiusTop * 2) / INCH).toBeCloseTo(2.25, 6);
		}
		const factory = buildToyotaTruck({ ...DEFAULT_TRUCK_COLORS, body }, { ...options, shocks: "factory", openable: true });
		expect(factory.parts.filter(white)).toHaveLength(0);
		for (const x of [t, factory]) x.dispose();
	});

	it("hangs step bars or running boards under both doors, between the front tire and the back of the cab", () => {
		const plain = buildToyotaTruck(undefined, {});
		for (const steps of ["tube", "board"] as const) {
			const t = buildToyotaTruck(undefined, { steps });
			expect(t.parts.length).toBeGreaterThan(plain.parts.length + 3);
			t.dispose();
		}
		plain.dispose();
	});

	it("frames every build at one scale about one spin point, every cargo included", () => {
		// The builder never rescales a build, so each must fit the framed radius (the camera adds a 12% margin).
		const v = new Vector3();
		for (const b of [AS_IT_SITS, KYLE_BUILD, NOAH_BUILD, ...CARGO.map((c) => ({ ...NOAH_BUILD, cargo: c.id, steps: "apex-sliders", exhaust: "turndown" }))]) {
			const { body, options } = truckSetup(b);
			const t = buildToyotaTruck({ ...DEFAULT_TRUCK_COLORS, body }, { ...options, openable: true });
			for (const k of ["hood", "doorLeft", "doorRight", "tailgate"] as const) t.setOpen?.(k, 1);
			t.group.updateMatrixWorld(true);
			let reach = 0;
			t.group.traverse((o) => {
				const m = o as Mesh;
				if (!m.isMesh || (m.material as MeshStandardMaterial).side === BackSide || m.material instanceof MeshBasicMaterial) return;
				const pos = m.geometry.attributes.position;
				for (let i = 0; i < pos.count; i++) {
					v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
					reach = Math.max(reach, Math.hypot(v.x - SPIN_CENTER_X, v.z));
				}
			});
			expect(reach).toBeLessThan(FRAME_RADIUS * 1.05);
			t.dispose();
		}
	});

	it("carries each cargo inside the open bed, behind the cab, on the floor", () => {
		for (const c of CARGO.filter((o) => o.kind !== "none" && o.kind !== "longboard")) {
			// No tire size given, so the body sits at its reference height and the floor is where the model says.
			const t = buildToyotaTruck(undefined, { cargo: c.kind });
			const box = boundsOf(t, "cargo");
			expect(box.isEmpty(), c.name).toBe(false);
			expect(box.min.y, c.name).toBeGreaterThan(CARGO_FLOOR_Y - 0.005);
			expect(Math.max(-box.min.z, box.max.z), c.name).toBeLessThan(0.74); // inside the bed walls
			expect(box.max.x, c.name).toBeLessThan(-0.7); // behind the bed's front wall
			// Only the ulua rods' tips reach past the tailgate.
			expect(box.min.x, c.name).toBeGreaterThan(c.kind === "ulua" ? -2.8 : -2.58);
			t.dispose();
		}
		const shell = buildToyotaTruck(undefined, { bed: "shell", cargo: "cooler" });
		expect(boundsOf(shell, "cargo").isEmpty()).toBe(true);
		shell.dispose();
	});

	it("draws the CRF50F to Honda's numbers: 30.5 in tall, 22.9 in across the bars, 51.3 in long", () => {
		const t = buildToyotaTruck(undefined, { cargo: "dirtbike" });
		const size = boundsOf(t, "crf50f").getSize(new Vector3());
		const box = boundsOf(t, "crf50f");
		expect((box.max.y - CARGO_FLOOR_Y) / INCH).toBeCloseTo(30.5, 0);
		expect(size.z / INCH).toBeCloseTo(22.9, 0);
		expect(size.x / INCH).toBeCloseTo(51.3, 0);
		// Honda's white HONDA and CRF on both sides of the bike.
		const node = t.group.getObjectByName("crf50f")!;
		const ink: Mesh[] = [];
		node.traverse((o) => {
			if ((o as Mesh).isMesh && t.parts.includes(o as Mesh) && colorOf(o as Mesh) === "f7f6f1") ink.push(o as Mesh);
		});
		const sides = new Set(ink.map((m) => Math.sign(m.getWorldPosition(new Vector3()).z)));
		expect(ink.length).toBeGreaterThan(20);
		expect(sides).toEqual(new Set([-1, 1]));
		t.dispose();
	});

	it("sizes the cooler as the YETI Tundra 110: 37.2 x 18 x 19.8 in outside, with its latches and nameplate", () => {
		const t = buildToyotaTruck(undefined, { cargo: "cooler" });
		const box = boundsOf(t, "cooler");
		expect((box.max.y - CARGO_FLOOR_Y) / INCH).toBeCloseTo(19.8, 0); // the T-latch handles ride just over the lid
		const size = box.getSize(new Vector3());
		expect(size.x / INCH).toBeGreaterThan(18);
		expect(size.x / INCH).toBeLessThan(18.8); // latches and nameplate stand off the front
		expect(size.z / INCH).toBeGreaterThan(37.2);
		expect(size.z / INCH).toBeLessThan(41); // the rope handles hang off the ends
		const latches = t.parts.filter((p) => colorOf(p) === "18191b");
		expect(latches.length).toBeGreaterThanOrEqual(4 + 4 + 1); // feet, two-part latches, nameplate
		t.dispose();
	});

	it("lays the ulua rods in 6 ft 6 in halves, half of PENN's 13 ft, with PENN's sleeve, grips and accent bands", () => {
		const t = buildToyotaTruck(undefined, { cargo: "ulua" });
		const blanks = t.parts.filter((p) => colorOf(p) === "131416");
		expect(blanks).toHaveLength(6);
		for (const b of blanks) expect((b.geometry as CylinderGeometry).parameters.height / INCH).toBeCloseTo(78, 6);
		for (const hex of ["b02a6b", "b8913a"]) expect(t.parts.filter((p) => colorOf(p) === hex), hex).toHaveLength(3);
		t.dispose();
	});

	it("loads rubbish bags that differ: different fill, height and lean, one on its side", () => {
		const t = buildToyotaTruck(undefined, { cargo: "rubbish" });
		t.group.updateMatrixWorld(true);
		const bags = t.parts.filter((p) => colorOf(p) === "121315" && p.geometry.type === "LatheGeometry");
		expect(bags).toHaveLength(4);
		const heights = bags.map((b) => Math.round(new Box3().setFromObject(b, true).getSize(new Vector3()).y * 1000));
		expect(new Set(heights).size).toBe(4);
		t.dispose();
	});

	it("fits each shock setup to its hoops: one or two per wheel, at the shock's own diameter", () => {
		for (const s of SHOCKS.filter((o) => o.setup)) {
			const t = buildToyotaTruck(undefined, { shocks: "hoops", shockSetup: s.setup, openable: true });
			const bodies = t.parts.filter((p) => colorOf(p) === s.setup!.body.slice(1) && p.geometry instanceof CylinderGeometry);
			expect(bodies, s.name).toHaveLength(2 * s.setup!.perWheel);
			for (const b of bodies) expect(((b.geometry as CylinderGeometry).parameters.radiusTop * 2) / INCH).toBeCloseTo(s.setup!.diameterIn, 6);
			t.dispose();
		}
	});

	it("draws every new part choice without error, each adding parts to the plain truck", () => {
		const plain = buildToyotaTruck(undefined, {});
		const n = plain.parts.length;
		const variants = [
			{ headlights: "h4" },
			{ headlights: "retro" },
			{ steps: "slider" },
			{ exhaust: "turndown" },
			{ bed: "liner" },
			{ stickers: ["tc"] },
			{ stickers: ["lemon"] },
			{ stickers: ["kanaka"] },
			{ stickers: ["dahui"] },
		] as const;
		for (const v of variants) {
			const t = buildToyotaTruck(undefined, v as never);
			expect(t.parts.length, JSON.stringify(v)).toBeGreaterThan(n);
			t.dispose();
		}
		plain.dispose();
	});

	it("sizes each sticker: Kanaka Maoli flag 3.75 x 2.5 in, T&C 6 in, Lemon and Da Hui about 4 in", () => {
		/** A sticker's size in its own frame on the glass: across (z) and up the glass (y). */
		const sizeOf = (kind: "tc" | "lemon" | "kanaka" | "dahui") => {
			const t = buildToyotaTruck(undefined, { stickers: [kind] });
			t.group.updateMatrixWorld(true);
			const node = t.group.getObjectByName(`sticker-${kind}`)!;
			const toLocal = node.matrixWorld.clone().invert();
			const box = new Box3();
			const v = new Vector3();
			node.traverse((o) => {
				const m = o as Mesh;
				if (!m.isMesh || !t.parts.includes(m)) return;
				const pos = m.geometry.attributes.position;
				for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toLocal));
			});
			t.dispose();
			return box.getSize(new Vector3());
		};
		const flag = sizeOf("kanaka");
		expect(flag.z / INCH).toBeCloseTo(3.75, 2);
		expect(flag.y / INCH).toBeCloseTo(2.5, 2);
		expect(sizeOf("tc").z / INCH).toBeCloseTo(6, 2);
		for (const k of ["lemon", "dahui"] as const) {
			const s = sizeOf(k);
			expect(s.z / INCH, k).toBeCloseTo(4, 1);
			expect(s.y / INCH, k).toBeCloseTo(4, 1);
		}
	});

	it("puts every sticker in the same spot: the bottom passenger-side corner of the rear glass", () => {
		const kinds = ["kalapana", "tc", "lemon", "kanaka", "dahui"] as const;
		const boxes = kinds.map((kind) => {
			const t = buildToyotaTruck(undefined, { stickers: [kind] });
			const box = boundsOf(t, `sticker-${kind}`);
			t.dispose();
			return box;
		});
		for (const [i, box] of boxes.entries()) {
			// Outboard edges and bottoms all line up, a little in from the C pillar's inner face (0.735 m).
			expect(box.max.z, kinds[i]).toBeCloseTo(boxes[0].max.z, 3);
			expect(box.min.y, kinds[i]).toBeCloseTo(boxes[0].min.y, 2);
			expect(0.735 - box.max.z, kinds[i]).toBeGreaterThan(0);
			expect(0.735 - box.max.z, kinds[i]).toBeLessThan(0.02);
			// All on the passenger side's fixed pane, outboard of the slider's frame at 0.26 m.
			expect(box.min.z, kinds[i]).toBeGreaterThan(0.26);
		}
		// Asked for together, they line up inboard of the corner instead of piling up.
		const both = buildToyotaTruck(undefined, { stickers: ["kanaka", "lemon"] });
		const lemon = boundsOf(both, "sticker-lemon");
		const flag = boundsOf(both, "sticker-kanaka");
		expect(lemon.max.z).toBeCloseTo(boxes[0].max.z, 3);
		expect(flag.max.z).toBeLessThan(lemon.min.z);
		both.dispose();
	});

	it("carries the KC lights in yellow or black covers, or leaves the bar bare", () => {
		const count = (lights: "none" | "yellow" | "black", hex: string) => {
			const t = buildToyotaTruck(undefined, { rack: "rollbar", rackLights: lights });
			const c = t.parts.filter((p) => colorOf(p) === hex).length;
			t.dispose();
			return c;
		};
		expect(count("yellow", "ffd400")).toBe(4);
		expect(count("black", "121315")).toBe(4);
		expect(count("none", "ffd400") + count("none", "121315")).toBe(0);
	});

	it("paints the tailgate letters in the chosen color", () => {
		const t = buildToyotaTruck(undefined, { tailgateLetterColor: "#b9bdc1" });
		expect(t.parts.filter((p) => colorOf(p) === "b9bdc1").length).toBeGreaterThan(6);
		t.dispose();
	});

	it("stands the McFly roll bar and its KC lights above the cab roof", () => {
		const plain = buildToyotaTruck(undefined, {});
		const rack = buildToyotaTruck(undefined, { rack: "rollbar" });
		expect(bounds(rack).max.y).toBeGreaterThan(bounds(plain).max.y + 0.1);
		plain.dispose();
		rack.dispose();
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
