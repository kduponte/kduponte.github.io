/**
 * Mounts every `[data-truck-viewer]` on the page. three.js is imported lazily, only once a
 * viewer scrolls into view, so pages without a viewer (or with it offscreen) never pay for it.
 * If WebGL is unavailable or anything throws, the static SVG fallback inside the element stays.
 */

const AUTO_SPEED = 0.55; // radians per second
const FRICTION = 2.2; // inertia decay per second
const DRAG_SENSITIVITY = 0.008;

async function mount(host: HTMLElement) {
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const [THREE, model] = await Promise.all([import("three"), import("../../lib/three/toyota-truck-model")]);

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
	const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
	camera.position.set(6.2, 3.4, 6.2);
	camera.lookAt(0, 0.95, 0);

	scene.add(new THREE.AmbientLight(0xffffff, 1.1));
	const sun = new THREE.DirectionalLight(0xffffff, 2.2);
	sun.position.set(3, 6, 4);
	scene.add(sun);

	const truck = model.buildToyotaTruck(
		host.dataset.body ? { ...model.DEFAULT_TRUCK_COLORS, body: host.dataset.body } : undefined,
	);
	truck.group.rotation.y = -0.6;
	scene.add(truck.group);

	host.appendChild(canvas);
	host.querySelector<HTMLElement>("[data-fallback]")?.setAttribute("hidden", "");

	const resize = () => {
		const { clientWidth: w, clientHeight: h } = host;
		if (!w || !h) return;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		render();
	};

	const render = () => renderer.render(scene, camera);

	let visible = false;
	let dragging = false;
	let velocity = 0; // radians per second added by dragging
	let lastX = 0;
	let lastT = 0;
	let raf = 0;

	const frame = (t: number) => {
		raf = 0;
		const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
		lastT = t;

		const auto = reducedMotion || dragging ? 0 : AUTO_SPEED;
		const spin = auto + velocity;
		truck.group.rotation.y += spin * dt;
		for (const wheel of truck.wheels) wheel.rotation.z -= spin * dt * 3;
		if (!dragging) velocity *= Math.exp(-FRICTION * dt);
		render();

		if (visible && (!reducedMotion || dragging || Math.abs(velocity) > 0.02)) {
			raf = requestAnimationFrame(frame);
		}
	};
	const kick = () => {
		if (!raf && visible) {
			lastT = performance.now();
			raf = requestAnimationFrame(frame);
		}
	};

	canvas.addEventListener("pointerdown", (e) => {
		dragging = true;
		lastX = e.clientX;
		canvas.setPointerCapture(e.pointerId);
		canvas.classList.replace("cursor-grab", "cursor-grabbing");
		kick();
	});
	canvas.addEventListener("pointermove", (e) => {
		if (!dragging) return;
		const dx = e.clientX - lastX;
		lastX = e.clientX;
		truck.group.rotation.y += dx * DRAG_SENSITIVITY;
		velocity = dx * DRAG_SENSITIVITY * 60;
	});
	const release = () => {
		dragging = false;
		canvas.classList.replace("cursor-grabbing", "cursor-grab");
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
