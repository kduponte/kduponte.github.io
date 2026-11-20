// What the translucent sea refracts.
//
// three.js draws transmissive materials (the water) by first rendering every opaque object into a
// separate buffer, then sampling that buffer, offset by the refraction, wherever the water is.
// Left alone, the whole buoy goes into that buffer, mast and lantern included, so the water shows a
// displaced ghost of the buoy beside the real one, like a reflection in the wrong place. Through
// real water you only see what is under it.
//
// So each buoy is split by render pass: the model as built draws only to the canvas, and a copy of
// just its submerged parts, cut at the waterline, draws only into the refraction buffer. The copy
// is baked into the buoy's own frame (metres, still water at y = 0, riding and tilting with the
// buoy), so the cut is a fixed plane and needs no per-frame uniforms.
import { Box3, Group, Matrix4, Mesh, type BufferGeometry, type Material, type Object3D } from "three";

type Pass = "main" | "refraction";

/** True while three.js renders the refraction (transmission) buffer rather than the canvas. */
export function inRefractionPass(renderer: { getRenderTarget(): unknown }): boolean {
	return renderer.getRenderTarget() !== null;
}

/**
 * Draw a mesh in one pass only. Skipping is done by emptying the geometry's draw range for that
 * draw and restoring it right after, since the list of objects is fixed before the passes run.
 */
export function restrictToPass(mesh: Mesh, pass: Pass): void {
	mesh.userData.pass = pass;
	mesh.onBeforeRender = (renderer, _scene, _camera, geometry: BufferGeometry) => {
		if ((pass === "refraction") !== inRefractionPass(renderer)) geometry.setDrawRange(0, 0);
	};
	mesh.onAfterRender = (_renderer, _scene, _camera, geometry: BufferGeometry) => {
		geometry.setDrawRange(0, Infinity);
	};
}

/** A copy of a material that discards everything above the buoy's waterline (model-space y > 0). */
function belowWaterline(source: Material): Material {
	const m = source.clone();
	m.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", "#include <common>\nvarying float vBuoyY;")
			.replace("#include <begin_vertex>", "#include <begin_vertex>\nvBuoyY = transformed.y;");
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", "#include <common>\nvarying float vBuoyY;")
			.replace("void main() {", "void main() {\n\tif ( vBuoyY > 0.0 ) discard;");
	};
	m.customProgramCacheKey = () => "buoy-below-waterline";
	return m;
}

export interface WaterSplit {
	/** The submerged copy, a child of the model's root. */
	underwater: Group;
	dispose(): void;
}

/**
 * Split a model (whose root's local frame has the waterline at y = 0) for the translucent sea: every
 * mesh it has draws to the canvas only, and a waterline-clipped copy of the parts that reach below
 * the waterline draws into the refraction buffer only. `parts` are the visible meshes (no outline
 * shells): the outline is a canvas-only effect.
 */
export function splitAtWaterline(root: Object3D, parts: Mesh[]): WaterSplit {
	root.updateMatrixWorld(true);
	const toRoot = new Matrix4().copy(root.matrixWorld).invert();
	const underwater = new Group();
	underwater.userData.kind = "underwater";
	const materials = new Map<Material, Material>();
	const geometries: BufferGeometry[] = [];

	// Everything already in the model: canvas only.
	root.traverse((o) => {
		if (o instanceof Mesh) restrictToPass(o, "main");
	});

	const box = new Box3();
	for (const part of parts) {
		const local = new Matrix4().multiplyMatrices(toRoot, part.matrixWorld);
		const geo = part.geometry.clone().applyMatrix4(local);
		geo.computeBoundingBox();
		box.copy(geo.boundingBox!);
		if (box.min.y >= 0) {
			geo.dispose();
			continue;
		}
		const src = part.material as Material;
		let mat = materials.get(src);
		if (!mat) materials.set(src, (mat = belowWaterline(src)));
		const copy = new Mesh(geo, mat);
		copy.userData.kind = part.userData.kind;
		restrictToPass(copy, "refraction");
		underwater.add(copy);
		geometries.push(geo);
	}
	root.add(underwater);

	return {
		underwater,
		dispose() {
			geometries.forEach((g) => g.dispose());
			materials.forEach((m) => m.dispose());
		},
	};
}
