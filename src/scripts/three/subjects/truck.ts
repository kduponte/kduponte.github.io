/**
 * The 22RE truck as a viewer subject. Hover makes it lean toward the cursor and warms its
 * headlights; a tap bounces it on its suspension and flashes the lights.
 */
import { buildToyotaTruck, DEFAULT_TRUCK_COLORS } from "../../../lib/three/toyota-truck-model";
import type { SubjectFactory } from "../viewer";

const LEAN_MAX = 0.07; // radians
const SPRING_K = 140; // suspension stiffness
const SPRING_C = 9; // suspension damping

const createTruck: SubjectFactory = ({ THREE, host, reducedMotion }) => {
	const colors = host.dataset.body ? { ...DEFAULT_TRUCK_COLORS, body: host.dataset.body } : undefined;
	const truck = buildToyotaTruck(colors);
	truck.group.rotation.y = -0.6;
	// The rig carries lean and bounce, so they never fight the spin on truck.group.
	const rig = new THREE.Group();
	rig.add(truck.group);

	const viewDir = new THREE.Vector3(5.2, 1.6, 5.9).normalize();
	// Screen-right in world space, flattened to the ground. Leaning about the axis perpendicular to
	// it tips the roof toward whichever side of the viewer the cursor is on.
	const right = viewDir.clone().negate().cross(new THREE.Vector3(0, 1, 0)).setY(0).normalize();
	const leanAxis = new THREE.Vector3(right.z, 0, -right.x);

	let leanTarget = 0;
	let lean = 0;
	let bounceY = 0;
	let bounceV = 0;
	let flash = 0;

	return {
		root: rig,
		spin: truck.group,
		framing: { target: new THREE.Vector3(-0.22, 0.72, 0), turnRadius: 2.8, halfHeight: 1.15, viewDir },
		update({ t, dt, spin, hovering }) {
			for (const wheel of truck.wheels) wheel.rotation.z -= spin * dt * 3;
			// Lean eases toward the cursor; suspension bounce is a damped spring.
			lean += (leanTarget - lean) * Math.min(1, dt * 8);
			bounceV += (-SPRING_K * bounceY - SPRING_C * bounceV) * dt;
			bounceY += bounceV * dt;
			const idle = reducedMotion ? 0 : Math.sin(t / 0.38) * 0.01;
			rig.position.y = bounceY + idle;
			rig.setRotationFromAxisAngle(leanAxis, lean);

			flash *= Math.exp(-3.5 * dt);
			truck.lights.head.emissiveIntensity = (hovering ? 0.5 : 0) + flash * 2.4;
			truck.lights.tail.emissiveIntensity = flash * 1.6;
		},
		busy: () =>
			Math.abs(lean - leanTarget) >= 1e-3 || Math.abs(bounceY) >= 1e-4 || Math.abs(bounceV) >= 1e-3 || flash >= 0.01,
		onTap() {
			// Hop on the springs (skipped for reduced motion) and flash the lights.
			if (!reducedMotion) bounceV = 1.5;
			flash = 1;
		},
		onHover(h) {
			if (!h) leanTarget = 0;
		},
		onPointerX(nx) {
			leanTarget = nx * LEAN_MAX;
		},
		dispose: truck.dispose,
	};
};

export default createTruck;
