import {
	BackSide,
	BoxGeometry,
	CylinderGeometry,
	DataTexture,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshToonMaterial,
	NearestFilter,
	RedFormat,
	type BufferGeometry,
	type Material,
} from "three";

/**
 * A stylized low-poly early-1990s Toyota pickup, built from primitives.
 * Front of the truck points toward +X, up is +Y, width runs along Z.
 */

export interface TruckColors {
	body: string;
	trim: string;
	glass: string;
	hub: string;
	light: string;
}

export const DEFAULT_TRUCK_COLORS: TruckColors = {
	body: "#f6f1e4",
	trim: "#111111",
	glass: "#8fd0ff",
	hub: "#c8ff3d",
	light: "#ffd400",
};

export interface TruckModel {
	group: Group;
	/** Wheel pivots, spin them about their local Z axis. */
	wheels: Group[];
	/** Every mesh that makes up the visible truck (excludes outline shells). */
	parts: Mesh[];
	dispose: () => void;
}

/** Three flat tonal bands, for a cel-shaded look. */
export function makeToonGradient(): DataTexture {
	const data = new Uint8Array([90, 170, 255]);
	const tex = new DataTexture(data, data.length, 1, RedFormat);
	tex.minFilter = NearestFilter;
	tex.magFilter = NearestFilter;
	tex.needsUpdate = true;
	return tex;
}

const OUTLINE_SCALE = 1.07;

export function buildToyotaTruck(colors: TruckColors = DEFAULT_TRUCK_COLORS): TruckModel {
	const gradient = makeToonGradient();
	const outlineMat = new MeshBasicMaterial({ color: colors.trim, side: BackSide });
	const materials: Material[] = [outlineMat];
	const geometries: BufferGeometry[] = [];

	const toon = (color: string) => {
		const m = new MeshToonMaterial({ color, gradientMap: gradient });
		materials.push(m);
		return m;
	};
	const bodyMat = toon(colors.body);
	const trimMat = toon(colors.trim);
	const glassMat = toon(colors.glass);
	const hubMat = toon(colors.hub);
	const lightMat = toon(colors.light);

	const group = new Group();
	const parts: Mesh[] = [];

	/** Add a mesh plus an inverted-hull outline shell. Geometries are centered, so scaling the shell works. */
	const add = (parent: Group, geo: BufferGeometry, mat: Material, x: number, y: number, z: number, outline = true) => {
		geometries.push(geo);
		const mesh = new Mesh(geo, mat);
		mesh.position.set(x, y, z);
		parent.add(mesh);
		parts.push(mesh);
		if (outline) {
			const shell = new Mesh(geo, outlineMat);
			shell.scale.setScalar(OUTLINE_SCALE);
			shell.position.copy(mesh.position);
			parent.add(shell);
		}
		return mesh;
	};
	const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);

	// Lower body / frame rail
	add(group, box(4.2, 0.5, 1.55), bodyMat, 0, 0.7, 0);
	// Hood and front fascia
	add(group, box(1.3, 0.3, 1.5), bodyMat, 1.5, 1.07, 0);
	// Cab body, greenhouse glass, roof
	add(group, box(1.5, 0.45, 1.55), bodyMat, 0.3, 1.15, 0);
	add(group, box(1.15, 0.5, 1.45), glassMat, 0.25, 1.6, 0, false);
	add(group, box(1.35, 0.1, 1.55), bodyMat, 0.22, 1.9, 0);
	// Bed floor, side walls, tailgate
	add(group, box(1.8, 0.1, 1.5), trimMat, -1.4, 0.98, 0, false);
	add(group, box(1.8, 0.38, 0.08), bodyMat, -1.4, 1.2, 0.74);
	add(group, box(1.8, 0.38, 0.08), bodyMat, -1.4, 1.2, -0.74);
	add(group, box(0.08, 0.38, 1.5), bodyMat, -2.28, 1.2, 0);
	// Bumpers, grille, headlights, taillights
	add(group, box(0.16, 0.18, 1.75), trimMat, 2.2, 0.5, 0, false);
	add(group, box(0.16, 0.18, 1.75), trimMat, -2.25, 0.5, 0, false);
	add(group, box(0.06, 0.2, 0.9), trimMat, 2.17, 0.95, 0, false);
	for (const z of [-0.55, 0.55]) {
		const head = new CylinderGeometry(0.13, 0.13, 0.08, 10);
		head.rotateZ(Math.PI / 2);
		add(group, head, lightMat, 2.18, 0.97, z, false);
		add(group, box(0.06, 0.1, 0.18), lightMat, -2.33, 1.0, z * 1.3, false);
	}

	// Wheels: tire, hub, each in a pivot so they can spin about Z.
	const wheels: Group[] = [];
	const wheelSpots: [number, number][] = [
		[1.45, 0.82],
		[1.45, -0.82],
		[-1.15, 0.82],
		[-1.15, -0.82],
	];
	for (const [x, z] of wheelSpots) {
		const pivot = new Group();
		pivot.position.set(x, 0.4, z);
		const tire = new CylinderGeometry(0.4, 0.4, 0.26, 12);
		tire.rotateX(Math.PI / 2);
		add(pivot, tire, trimMat, 0, 0, 0);
		const hub = new CylinderGeometry(0.17, 0.17, 0.3, 8);
		hub.rotateX(Math.PI / 2);
		add(pivot, hub, hubMat, 0, 0, 0, false);
		// A bar across the hub so rotation is visible.
		add(pivot, box(0.42, 0.06, 0.32), trimMat, 0, 0, 0, false);
		group.add(pivot);
		wheels.push(pivot);
	}

	return {
		group,
		wheels,
		parts,
		dispose: () => {
			geometries.forEach((g) => g.dispose());
			materials.forEach((m) => m.dispose());
			gradient.dispose();
		},
	};
}
