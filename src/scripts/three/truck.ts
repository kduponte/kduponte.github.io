/**
 * Mounts every `[data-truck-viewer]` on the page. three.js is imported lazily, only once a
 * viewer scrolls into view, so pages without a viewer (or with it offscreen) never pay for it.
 * If WebGL is unavailable or anything throws, the static SVG fallback inside the element stays.
 *
 * Interactions: drag to spin (with inertia), hover to make the truck lean toward the cursor
 * and warm up its headlights, tap to bounce it on its suspension and flash the lights.
 */

const AUTO_SPEED = 0.45; // radians per second
const FRICTION = 2.2; // inertia decay per second
const DRAG_SENSITIVITY = 0.008;
const TAP_MAX_MOVE = 6; // px
const TAP_MAX_MS = 350;
const LEAN_MAX = 0.07; // radians
const SPRING_K = 140; // suspension stiffness
const SPRING_C = 9; // suspension damping
const TURN_RADIUS = 2.8; // m, bumper tip to the spin axis
const HALF_HEIGHT = 1.15; // m, roof to ground plus room for the bounce

async function mount(host: HTMLElement) {
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const [THREE, model, { RoomEnvironment }] = await Promise.all([
		import("three"),
		import("../../lib/three/toyota-truck-model"),
		import("three/examples/jsm/environments/RoomEnvironment.js"),
	]);

	const canvas = document.createElement("canvas");
	canvas.className = "absolute inset-0 h-full w-full cursor-grab touch-pan-y";
	let renderer: InstanceType<typeof THREE.WebGLRenderer>;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	} catch {
		return; // No WebGL: keep the fallback.
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

	const scene = new THREE.Scene();
	// A soft studio environment gives the paint and steel real reflections.
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.55;
	pmrem.dispose();

	const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
	const target = new THREE.Vector3(-0.22, 0.72, 0);
	const viewDir = new THREE.Vector3(5.2, 1.6, 5.9).normalize();
	/**
	 * Back the camera off just far enough that the spinning truck never clips: it needs its full
	 * turning radius horizontally but only about half its height vertically.
	 */
	const frameCamera = (aspect: number) => {
		const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
		const halfH = Math.atan(Math.tan(halfV) * aspect);
		const dist = Math.max(TURN_RADIUS / Math.sin(halfH), HALF_HEIGHT / Math.sin(halfV)) * 1.12;
		camera.position.copy(target).addScaledVector(viewDir, dist);
		camera.lookAt(target);
	};
	frameCamera(1);

	scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3020, 0.9));
	const sun = new THREE.DirectionalLight(0xffffff, 2.0);
	sun.position.set(4, 7, 5);
	scene.add(sun);

	const colors = host.dataset.body ? { ...model.DEFAULT_TRUCK_COLORS, body: host.dataset.body } : undefined;
	const truck = model.buildToyotaTruck(colors);
	truck.group.rotation.y = -0.6;
	// The rig carries lean and bounce, so they never fight the spin on truck.group.
	const rig = new THREE.Group();
	rig.add(truck.group);
	scene.add(rig);

	host.appendChild(canvas);
	host.querySelector<HTMLElement>("[data-fallback]")?.setAttribute("hidden", "");

	const render = () => renderer.render(scene, camera);
	const resize = () => {
		const { clientWidth: w, clientHeight: h } = host;
		if (!w || !h) return;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		frameCamera(w / h);
		render();
	};

	// Screen-right in world space, flattened to the ground. Leaning about the axis perpendicular
	// to it tips the roof toward whichever side of the viewer the cursor is on.
	const screenRight = new THREE.Vector3();
	camera.getWorldDirection(screenRight);
	screenRight.cross(new THREE.Vector3(0, 1, 0)).setY(0).normalize();
	const leanAxis = new THREE.Vector3(screenRight.z, 0, -screenRight.x);

	let visible = false;
	let dragging = false;
	let hovering = false;
	let velocity = 0; // radians per second added by dragging
	let lastX = 0;
	let downX = 0;
	let downT = 0;
	let leanTarget = 0;
	let lean = 0;
	let bounceY = 0;
	let bounceV = 0;
	let flash = 0;
	let lastT = 0;
	let raf = 0;

	const settled = () =>
		!dragging &&
		Math.abs(velocity) < 0.02 &&
		Math.abs(lean - leanTarget) < 1e-3 &&
		Math.abs(bounceY) < 1e-4 &&
		Math.abs(bounceV) < 1e-3 &&
		flash < 0.01;

	const frame = (t: number) => {
		raf = 0;
		const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
		lastT = t;

		const spin = (reducedMotion || dragging ? 0 : AUTO_SPEED) + velocity;
		truck.group.rotation.y += spin * dt;
		for (const wheel of truck.wheels) wheel.rotation.z -= spin * dt * 3;
		if (!dragging) velocity *= Math.exp(-FRICTION * dt);

		// Lean eases toward the cursor; suspension bounce is a damped spring.
		lean += (leanTarget - lean) * Math.min(1, dt * 8);
		bounceV += (-SPRING_K * bounceY - SPRING_C * bounceV) * dt;
		bounceY += bounceV * dt;
		const idle = reducedMotion ? 0 : Math.sin(t / 380) * 0.01;
		rig.position.y = bounceY + idle;
		rig.setRotationFromAxisAngle(leanAxis, lean);

		flash *= Math.exp(-3.5 * dt);
		const glow = hovering ? 0.5 : 0;
		truck.lights.head.emissiveIntensity = glow + flash * 2.4;
		truck.lights.tail.emissiveIntensity = flash * 1.6;

		render();
		if (visible && (!reducedMotion || !settled())) raf = requestAnimationFrame(frame);
	};
	const kick = () => {
		if (!raf && visible) {
			lastT = performance.now();
			raf = requestAnimationFrame(frame);
		}
	};

	canvas.addEventListener("pointerdown", (e) => {
		dragging = true;
		lastX = downX = e.clientX;
		downT = performance.now();
		canvas.setPointerCapture(e.pointerId);
		canvas.classList.replace("cursor-grab", "cursor-grabbing");
		kick();
	});
	canvas.addEventListener("pointermove", (e) => {
		if (dragging) {
			const dx = e.clientX - lastX;
			lastX = e.clientX;
			truck.group.rotation.y += dx * DRAG_SENSITIVITY;
			velocity = dx * DRAG_SENSITIVITY * 60;
		} else if (e.pointerType === "mouse") {
			const r = canvas.getBoundingClientRect();
			const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
			leanTarget = Math.max(-1, Math.min(1, nx)) * LEAN_MAX;
		}
		kick();
	});
	canvas.addEventListener("pointerenter", () => {
		hovering = true;
		kick();
	});
	canvas.addEventListener("pointerleave", () => {
		hovering = false;
		leanTarget = 0;
		kick();
	});
	const release = (e: PointerEvent) => {
		const wasTap = Math.abs(e.clientX - downX) < TAP_MAX_MOVE && performance.now() - downT < TAP_MAX_MS;
		dragging = false;
		canvas.classList.replace("cursor-grabbing", "cursor-grab");
		if (wasTap && e.type === "pointerup") {
			// A tap: hop on the springs (skipped for reduced motion) and flash the lights.
			if (!reducedMotion) bounceV = 1.5;
			velocity = 0;
			flash = 1;
		}
		kick();
	};
	canvas.addEventListener("pointerup", release);
	canvas.addEventListener("pointercancel", release);

	// Pause the render loop whenever the viewer is offscreen.
	new IntersectionObserver(
		(entries) => {
			visible = entries.some((e) => e.isIntersecting);
			if (visible) kick();
		},
		{ threshold: 0.05 },
	).observe(host);

	new ResizeObserver(resize).observe(host);
	resize();
	visible = true;
	kick();
}

export function mountTruckViewers() {
	const hosts = document.querySelectorAll<HTMLElement>("[data-truck-viewer]");
	if (!hosts.length) return;

	const io = new IntersectionObserver(
		(entries, observer) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				observer.unobserve(entry.target);
				mount(entry.target as HTMLElement).catch(() => {
					/* Keep the static fallback. */
				});
			}
		},
		{ rootMargin: "200px" },
	);
	hosts.forEach((h) => io.observe(h));
}
