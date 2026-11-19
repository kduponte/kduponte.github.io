// Shared building blocks for the site's 3D objects (the 22RE truck, the Forecast Gap buoy, ...).
//
// Every object is built the same way, which is what keeps them reading as one family: softened
// primitives, physically based materials, and a heavy black inverted-hull outline on the larger
// parts. Builders stay pure (no renderer, no DOM) so they can be unit tested in Node.
import {
	BackSide,
	BufferGeometry,
	Color,
	ExtrudeGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Shape,
	Vector3,
	type Material,
	type Object3D,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Outline thickness for big panels, and for trim and small parts. */
export const OUTLINE = 0.05;
export const OUTLINE_SMALL = 0.03;

/** Inverted-hull outline: a copy pushed out along smooth normals, rendered back-faces only. */
export function outlineGeometry(geo: BufferGeometry, thickness: number): BufferGeometry {
	const g = geo.clone();
	g.deleteAttribute("normal");
	g.deleteAttribute("uv");
	g.clearGroups();
	const merged = mergeVertices(g, 1e-4);
	merged.computeVertexNormals();
	const pos = merged.getAttribute("position");
	const nor = merged.getAttribute("normal");
	const v = new Vector3();
	const n = new Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		n.fromBufferAttribute(nor, i);
		v.addScaledVector(n, thickness);
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	pos.needsUpdate = true;
	return merged;
}

/** Rounded-rectangle outline in the XY plane, centered on the origin. */
export function roundedRect(w: number, h: number, r: number): Shape {
	const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3);
	const x = -w / 2;
	const y = -h / 2;
	const s = new Shape();
	s.moveTo(x + rr, y);
	s.lineTo(x + w - rr, y);
	s.quadraticCurveTo(x + w, y, x + w, y + rr);
	s.lineTo(x + w, y + h - rr);
	s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
	s.lineTo(x + rr, y + h);
	s.quadraticCurveTo(x, y + h, x, y + h - rr);
	s.lineTo(x, y + rr);
	s.quadraticCurveTo(x, y, x + rr, y);
	return s;
}

/**
 * Extrude a shape along Z with softened edges. By default the result is centered on the origin;
 * pass `center: false` for profiles drawn in model coordinates (only Z is centered then).
 */
export function extrude(shape: Shape, depth: number, bevel: number, center = true): BufferGeometry {
	const b = Math.min(bevel, depth / 2 - 1e-3);
	const geo = new ExtrudeGeometry(shape, {
		depth: Math.max(depth - 2 * b, 1e-3),
		bevelEnabled: b > 0,
		bevelThickness: b,
		bevelSize: b,
		bevelOffset: -b,
		bevelSegments: 3,
		curveSegments: 12,
	});
	if (center) {
		geo.center();
	} else {
		geo.computeBoundingBox();
		const box = geo.boundingBox!;
		geo.translate(0, 0, -(box.min.z + box.max.z) / 2);
	}
	return geo;
}

/** A softened box: sx along X, sy along Y, sz along Z. */
export function slab(sx: number, sy: number, sz: number, radius = 0.04, bevel = 0.02): BufferGeometry {
	return extrude(roundedRect(sx, sy, radius), sz, bevel);
}

/** Darken a hex color by mixing toward black. */
export function shade(hex: string, amount: number): string {
	return `#${new Color(hex).multiplyScalar(1 - amount).getHexString()}`;
}

/** Lighten a hex color by mixing toward white. */
export function tint(hex: string, amount: number): string {
	return `#${new Color(hex).lerp(new Color("#ffffff"), amount).getHexString()}`;
}

export interface PartOptions {
	/** Outline thickness; 0 skips the shell. Defaults to OUTLINE_SMALL. */
	outline?: number;
	rot?: [number, number, number];
}

/**
 * Tracks every geometry and material a builder creates so the model can be disposed in one call,
 * and adds parts with their outline shells.
 */
export interface PartKit {
	/** Every visible mesh added through `add`, excluding outline shells. */
	parts: Mesh[];
	add(parent: Object3D, geo: BufferGeometry, mat: Material, pos: [number, number, number], opts?: PartOptions): Mesh;
	/** A physically based material, tracked for disposal. */
	std(color: string, roughness: number, metalness?: number): MeshStandardMaterial;
	material<T extends Material>(m: T): T;
	geometry<T extends BufferGeometry>(g: T): T;
	dispose(): void;
}

export function createPartKit(outlineColor: string): PartKit {
	const outlineMat = new MeshBasicMaterial({ color: outlineColor, side: BackSide });
	const materials: Material[] = [outlineMat];
	const geometries: BufferGeometry[] = [];
	const parts: Mesh[] = [];

	return {
		parts,
		add(parent, geo, mat, pos, opts = {}) {
			const { outline = OUTLINE_SMALL, rot } = opts;
			geometries.push(geo);
			const mesh = new Mesh(geo, mat);
			mesh.position.set(...pos);
			if (rot) mesh.rotation.set(...rot);
			parent.add(mesh);
			parts.push(mesh);
			if (outline > 0) {
				const shellGeo = outlineGeometry(geo, outline);
				geometries.push(shellGeo);
				const shell = new Mesh(shellGeo, outlineMat);
				shell.position.copy(mesh.position);
				shell.rotation.copy(mesh.rotation);
				parent.add(shell);
			}
			return mesh;
		},
		std(color, roughness, metalness = 0.05) {
			const m = new MeshStandardMaterial({ color, roughness, metalness });
			materials.push(m);
			return m;
		},
		material(m) {
			materials.push(m);
			return m;
		},
		geometry(g) {
			geometries.push(g);
			return g;
		},
		dispose() {
			geometries.forEach((g) => g.dispose());
			materials.forEach((m) => m.dispose());
		},
	};
}
