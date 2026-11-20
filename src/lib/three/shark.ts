// The shark shadow that sometimes crosses the diorama's water (data: src/lib/surf-forecast/sharks.ts).
//
//   - How often: in proportion to recorded shark incidents within 50 km of the buoy (the interval
//     comes with the station's data). Buoys with none never see it.
//   - How big: the median length stated in those incident records, drawn at the buoys' scale
//     (INSTRUMENT_UNITS_PER_M), so a 3 m tiger shark next to a 0.9 m Waverider is in proportion.
//   - How fast: the species' published cruising speed, at the same scale.
//   - Where: a straight pass across the block at a fixed depth, on a heading and offset that vary
//     from pass to pass (seeded, so it is repeatable) and always clear the buoy and its mooring.
// It is only ever seen through the water: drawn into the refraction buffer only, and clipped to the
// block, so it can't show outside the sea.
import { DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, type BufferGeometry } from "three";
import { inRefractionPass } from "./underwater";

/**
 * Cruising speeds, m/s: tiger sharks swam continuously at 0.5 to 0.9 m/s in an accelerometer study
 * at Ningaloo (Frontiers in Marine Science, 2019); foraging adult white sharks' modal speeds were
 * 0.80 to 1.35 m/s (Watanabe et al., 2019). Midpoints; other or unidentified species use the lower.
 */
export const CRUISE_SPEED_MS: Record<string, number> = { "tiger shark": 0.7, "white shark": 1.1 };
export const DEFAULT_CRUISE_SPEED_MS = 0.7;

/** Depth of the pass below still water, scene units: under the deepest drawn trough, above the floor. */
export const SHARK_DEPTH = 0.6;

export interface SharkPlan {
	/** Seconds from the start of one pass to the next. */
	interval_s: number;
	/** Body length, scene units. */
	length: number;
	/** Scene units per second. */
	speed: number;
	/** Varies the passes between stations. */
	seed: number;
}

export interface SharkPose {
	x: number;
	z: number;
	/** Radians, the direction of travel in the XZ plane: (cos, sin) is (x, z). */
	heading: number;
}

/** A small seeded generator (mulberry32), so a station's passes are the same every visit. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** How far a pass's line stays from the block's center, so the shark clears the buoy and mooring. */
export function passOffsetRange(length: number, half: number): [number, number] {
	const min = Math.min(0.3 * length + 0.5, half * 0.6);
	return [min, Math.max(min, half * 0.75)];
}

/**
 * Where the shark is at time t (seconds), or null between passes. Pass k starts at k * interval:
 * the shark enters fully outside one wall and leaves fully outside another, travelling a straight
 * line at its cruising speed.
 */
export function sharkPose(plan: SharkPlan, t: number, half: number): SharkPose | null {
	if (!(plan.interval_s > 0) || !(plan.speed > 0) || t < 0) return null;
	const k = Math.floor(t / plan.interval_s);
	const tau = t - k * plan.interval_s;
	const r = rng(plan.seed * 7919 + k * 104729);
	const heading = r() * Math.PI * 2;
	const [lo, hi] = passOffsetRange(plan.length, half);
	const offset = (lo + r() * (hi - lo)) * (r() < 0.5 ? -1 : 1);
	const ux = Math.cos(heading);
	const uz = Math.sin(heading);
	const cx = -uz * offset;
	const cz = ux * offset;
	// Where the line c + s u crosses the square |x|, |z| <= half (slab method).
	let sIn = -Infinity;
	let sOut = Infinity;
	for (const [c, u] of [
		[cx, ux],
		[cz, uz],
	]) {
		if (Math.abs(u) < 1e-9) continue;
		const a = (-half - c) / u;
		const b = (half - c) / u;
		sIn = Math.max(sIn, Math.min(a, b));
		sOut = Math.min(sOut, Math.max(a, b));
	}
	const start = sIn - plan.length / 2;
	const end = sOut + plan.length / 2;
	const s = start + plan.speed * tau;
	if (s > end) return null;
	return { x: cx + s * ux, z: cz + s * uz, heading };
}

/**
 * A shark seen from above, nose at +X, unit length, in the XZ plane: conical snout, pectoral fins
 * swept back, pelvic fins, a slim caudal peduncle and the tail's spread.
 */
function planform(): Shape {
	const right: [number, number][] = [
		[0.5, 0],
		[0.47, 0.03],
		[0.4, 0.062],
		[0.28, 0.092],
		[0.16, 0.1],
		[0.06, 0.27],
		[0.02, 0.27],
		[0.05, 0.095],
		[-0.1, 0.08],
		[-0.24, 0.055],
		[-0.27, 0.075],
		[-0.31, 0.045],
		[-0.38, 0.024],
		[-0.45, 0.05],
		[-0.5, 0.05],
		[-0.46, 0],
	];
	const pts = [...right, ...right.slice(1, -1).reverse().map(([x, z]) => [x, -z] as [number, number])];
	const s = new Shape();
	s.moveTo(pts[0][0], pts[0][1]);
	for (const [x, z] of pts.slice(1)) s.lineTo(x, z);
	s.closePath();
	return s;
}

export interface SharkShadow {
	mesh: Mesh;
	/** Pose the shark for time t, or hide it (plan null, or between passes). */
	update(plan: SharkPlan | null, t: number): SharkPose | null;
	dispose(): void;
}

/**
 * The shadow mesh. `block` is the group whose local frame is the sea block's (center at the origin,
 * walls at +-half): the shark is clipped to it in the shader, so the part of the body still outside
 * a wall as it enters or leaves is never drawn.
 */
export function buildSharkShadow(block: Group, half: number, color = "#0a1720"): SharkShadow {
	const geo: BufferGeometry = new ShapeGeometry(planform(), 6).rotateX(Math.PI / 2);
	const toBlock = { value: new Matrix4() };
	const halfU = { value: half };
	const mat = new MeshBasicMaterial({ color, side: DoubleSide });
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uToBlock = toBlock;
		shader.uniforms.uHalf = halfU;
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", "#include <common>\nuniform mat4 uToBlock;\nvarying vec2 vBlock;")
			.replace("#include <begin_vertex>", "#include <begin_vertex>\nvBlock = (uToBlock * modelMatrix * vec4(transformed, 1.0)).xz;");
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", "#include <common>\nuniform float uHalf;\nvarying vec2 vBlock;")
			.replace("void main() {", "void main() {\n\tif ( abs(vBlock.x) > uHalf || abs(vBlock.y) > uHalf ) discard;");
	};
	mat.customProgramCacheKey = () => "shark-shadow";
	const mesh = new Mesh(geo, mat);
	mesh.userData.kind = "shark";
	mesh.visible = false;
	mesh.position.y = -SHARK_DEPTH;
	// Refraction buffer only, with the block's frame refreshed for each draw. The material is the
	// shark's alone, so three.js re-uploads its uniforms every time it is drawn.
	mesh.onBeforeRender = (renderer, _s, _c, geometry: BufferGeometry) => {
		if (!inRefractionPass(renderer)) geometry.setDrawRange(0, 0);
		toBlock.value.copy(block.matrixWorld).invert();
	};
	mesh.onAfterRender = (_r, _s, _c, geometry: BufferGeometry) => {
		geometry.setDrawRange(0, Infinity);
	};

	return {
		mesh,
		update(plan, t) {
			const pose = plan ? sharkPose(plan, t, half) : null;
			mesh.visible = pose !== null;
			if (pose && plan) {
				mesh.position.set(pose.x, -SHARK_DEPTH, pose.z);
				mesh.rotation.set(0, -pose.heading, 0);
				mesh.scale.setScalar(plan.length);
			}
			return pose;
		},
		dispose() {
			geo.dispose();
			mat.dispose();
		},
	};
}
