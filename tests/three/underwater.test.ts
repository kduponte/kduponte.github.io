import { describe, expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { buildDiscus, buildWaverider, partsOfKind } from "../../src/lib/three/buoy-model";
import { inRefractionPass, restrictToPass, splitAtWaterline } from "../../src/lib/three/underwater";

const canvas = { getRenderTarget: () => null };
const buffer = { getRenderTarget: () => ({}) };
/** Run a mesh's render hooks as three.js would in a given pass; returns the draw count it ends up with. */
function drawCountIn(mesh: Mesh, renderer: typeof canvas | typeof buffer): number {
	const g = mesh.geometry;
	// The hooks only read the renderer's render target and the geometry; the rest can be null here.
	(mesh.onBeforeRender as any)(renderer, null, null, g, mesh.material, null);
	const count = g.drawRange.count;
	(mesh.onAfterRender as any)(renderer, null, null, g, mesh.material, null);
	return count;
}

describe("restrictToPass", () => {
	it("tells the refraction buffer from the canvas by the render target", () => {
		expect(inRefractionPass(canvas)).toBe(false);
		expect(inRefractionPass(buffer)).toBe(true);
	});

	it("skips a canvas-only mesh in the refraction pass and restores it after", () => {
		const m = buildWaverider().parts[0];
		restrictToPass(m, "main");
		expect(drawCountIn(m, buffer)).toBe(0);
		expect(m.geometry.drawRange.count).toBe(Infinity);
		expect(drawCountIn(m, canvas)).toBe(Infinity);
	});

	it("skips a refraction-only mesh on the canvas", () => {
		const m = buildWaverider().parts[0];
		restrictToPass(m, "refraction");
		expect(drawCountIn(m, canvas)).toBe(0);
		expect(drawCountIn(m, buffer)).toBe(Infinity);
	});
});

describe.each([
	["Waverider", buildWaverider()],
	["discus", buildDiscus()],
])("splitAtWaterline (%s)", (_, model) => {
	model.group.scale.setScalar(0.8); // as in the diorama: the split must not depend on the drawing scale
	const { underwater } = splitAtWaterline(model.group, model.parts);
	const copies = underwater.children as Mesh[];

	it("keeps every original mesh off the refraction buffer", () => {
		model.group.traverse((o) => {
			if (o instanceof Mesh && o.parent !== underwater) expect(o.userData.pass).toBe("main");
		});
	});

	it("copies only parts that reach below the waterline, for the refraction buffer only", () => {
		expect(copies.length).toBeGreaterThan(0);
		expect(copies.length).toBeLessThan(model.parts.length);
		for (const c of copies) {
			expect(c.userData.pass).toBe("refraction");
			c.geometry.computeBoundingBox();
			expect(c.geometry.boundingBox!.min.y).toBeLessThan(0);
		}
		const kinds = copies.map((c) => c.userData.kind);
		expect(kinds).toContain("hull");
		expect(kinds).toContain("mooring-eye");
		expect(kinds).not.toContain("lantern");
		expect(kinds).not.toContain("antenna");
	});

	it("bakes each copy into the buoy's own frame, in place over its original", () => {
		model.group.updateMatrixWorld(true);
		const hull = partsOfKind(model, "hull").find((m) => m.parent !== underwater)!;
		const copy = copies.find((c) => c.userData.kind === "hull")!;
		const a = new Box3().setFromObject(hull);
		const b = new Box3().setFromObject(copy);
		expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6);
		expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6);
		expect(copy.position.equals(new Vector3())).toBe(true);
	});

	it("cuts the copies at the waterline in the shader", () => {
		const mat = copies[0].material as unknown as { onBeforeCompile: (s: { vertexShader: string; fragmentShader: string }) => void };
		const shader = {
			vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}",
			fragmentShader: "#include <common>\nvoid main() {\n}",
		};
		mat.onBeforeCompile(shader);
		expect(shader.vertexShader).toContain("vBuoyY = transformed.y;");
		expect(shader.fragmentShader).toContain("if ( vBuoyY > 0.0 ) discard;");
	});
});
