/**
 * The site's shared 3D viewer. Any element marked with a viewer selector mounts a "subject" (the
 * 22RE truck, the Forecast Gap buoy, ...) into one canvas, with the same behaviour everywhere:
 *
 * - three.js and the subject's model are imported lazily, only once the element nears the
 *   viewport, so pages without a viewer (or with it offscreen) never pay for it.
 * - If WebGL is unavailable or anything throws, the static SVG fallback inside the element stays.
 * - Soft studio reflections, a hemisphere and a key light, and a camera that backs off just far
 *   enough for the subject's turning radius at the canvas's aspect ratio, so nothing ever clips.
 * - Drag to spin with inertia; the subject decides what hover and tap do.
 * - The render loop pauses offscreen, and under prefers-reduced-motion it only runs while
 *   something the user did is still settling.
 */
import type * as ThreeNS from "three";
import type { Camera, Object3D, Vector3 } from "three";

export type Three = typeof ThreeNS;

export interface FrameContext {
	/** Seconds since the page loaded (performance.now based). */
	t: number;
	/** Seconds since the last frame, capped. */
	dt: number;
	/** Current spin rate, radians per second, including drag inertia. */
	spin: number;
	reducedMotion: boolean;
	hovering: boolean;
}

export interface Subject {
	/** Added to the scene. Use it to carry lean, bounce or anything that must not fight the spin. */
	root: Object3D;
	/** Rotated about Y by the auto-spin and by dragging. Usually `root` itself or a child of it. */
	spin: Object3D;
	framing: {
		target: Vector3;
		/** Distance from the spin axis to the farthest point, scene units. */
		turnRadius: number;
		/** Vertical half-extent the camera must fit, scene units. */
		halfHeight: number;
		/** Direction from target to camera; normalized by the viewer. */
		viewDir?: Vector3;
	};
	/** Radians per second; defaults to 0.45. Ignored under reduced motion. */
	autoSpeed?: number;
	/** Called every frame before rendering. */
	update?(ctx: FrameContext): void;
	/** True while something still needs frames under reduced motion (a bounce settling, a flash fading). */
	busy?(): boolean;
	onTap?(): void;
	onHover?(hovering: boolean): void;
	/** Mouse x across the canvas, -1 (left) to 1 (right). */
	onPointerX?(nx: number): void;
	/** A tap, in normalized device coordinates (-1 to 1, y up) with the camera, for picking. */
	onTapAt?(x: number, y: number, camera: Camera): void;
	/** The mouse moving over the canvas (not dragging), in normalized device coordinates, with the camera. */
	onPointerAt?(x: number, y: number, camera: Camera): void;
	dispose(): void;
}

export interface SubjectContext {
	THREE: Three;
	host: HTMLElement;
	reducedMotion: boolean;
	/** Ask for frames after a change the viewer cannot see (e.g. a station switched from a button). */
	requestRender(): void;
}

export type SubjectFactory = (ctx: SubjectContext) => Subject | Promise<Subject>;

const FRICTION = 2.2; // inertia decay per second
const DRAG_SENSITIVITY = 0.008;
const TAP_MAX_MOVE = 6; // px
const TAP_MAX_MS = 350;

async function mount(host: HTMLElement, loadFactory: () => Promise<SubjectFactory>) {
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const [THREE, { RoomEnvironment }, factory] = await Promise.all([
		import("three"),
		import("three/examples/jsm/environments/RoomEnvironment.js"),
		loadFactory(),
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
	// A soft studio environment gives paint and steel real reflections.
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.55;
	pmrem.dispose();
	scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3020, 0.9));
	const sun = new THREE.DirectionalLight(0xffffff, 2.0);
	sun.position.set(4, 7, 5);
	scene.add(sun);

	let raf = 0;
	let visible = false;
	const kick = () => {
		if (!raf && visible) {
			lastT = performance.now();
			raf = requestAnimationFrame(frame);
		}
	};

	const subject = await factory({ THREE, host, reducedMotion, requestRender: () => kick() });
	scene.add(subject.root);

	const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
	const { target, turnRadius, halfHeight } = subject.framing;
	const viewDir = (subject.framing.viewDir?.clone() ?? new THREE.Vector3(5.2, 1.6, 5.9)).normalize();
	/** Back off just far enough: the full turning radius horizontally, the half-height vertically. */
	const frameCamera = (aspect: number) => {
		const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
		const halfH = Math.atan(Math.tan(halfV) * aspect);
		const dist = Math.max(turnRadius / Math.sin(halfH), halfHeight / Math.sin(halfV)) * 1.12;
		camera.position.copy(target).addScaledVector(viewDir, dist);
		camera.lookAt(target);
	};
	frameCamera(1);

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

	const autoSpeed = subject.autoSpeed ?? 0.45;
	/** Pointer position in normalized device coordinates, for subjects that pick. */
	const ndc = (e: PointerEvent): [number, number] => {
		const r = canvas.getBoundingClientRect();
		return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
	};
	let dragging = false;
	let hovering = false;
	let velocity = 0; // radians per second added by dragging
	let lastX = 0;
	let downX = 0;
	let downT = 0;
	let lastT = 0;

	const settled = () => !dragging && Math.abs(velocity) < 0.02 && !(subject.busy?.() ?? false);

	function frame(now: number) {
		raf = 0;
		const dt = Math.min((now - lastT) / 1000, 0.05) || 0;
		lastT = now;

		const spin = (reducedMotion || dragging ? 0 : autoSpeed) + velocity;
		subject.spin.rotation.y += spin * dt;
		if (!dragging) velocity *= Math.exp(-FRICTION * dt);
		subject.update?.({ t: now / 1000, dt, spin, reducedMotion, hovering });

		render();
		if (visible && (!reducedMotion || !settled())) raf = requestAnimationFrame(frame);
	}

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
			subject.spin.rotation.y += dx * DRAG_SENSITIVITY;
			velocity = dx * DRAG_SENSITIVITY * 60;
		} else if (e.pointerType === "mouse") {
			const r = canvas.getBoundingClientRect();
			subject.onPointerX?.(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)));
			if (subject.onPointerAt) subject.onPointerAt(...ndc(e), camera);
		}
		kick();
	});
	canvas.addEventListener("pointerenter", () => {
		hovering = true;
		subject.onHover?.(true);
		kick();
	});
	canvas.addEventListener("pointerleave", () => {
		hovering = false;
		subject.onHover?.(false);
		kick();
	});
	const release = (e: PointerEvent) => {
		const wasTap = Math.abs(e.clientX - downX) < TAP_MAX_MOVE && performance.now() - downT < TAP_MAX_MS;
		dragging = false;
		canvas.classList.replace("cursor-grabbing", "cursor-grab");
		if (wasTap && e.type === "pointerup") {
			velocity = 0;
			subject.onTap?.();
			subject.onTapAt?.(...ndc(e), camera);
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

/**
 * Mount every element matching `selector` once it nears the viewport. `loadFactory` should be a
 * dynamic import of the subject module, so its model code is only fetched when needed.
 */
export function mountViewers(selector: string, loadFactory: () => Promise<SubjectFactory>) {
	const hosts = document.querySelectorAll<HTMLElement>(selector);
	if (!hosts.length) return;

	const io = new IntersectionObserver(
		(entries, observer) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				observer.unobserve(entry.target);
				mount(entry.target as HTMLElement, loadFactory).catch((err) => {
					// Keep the static fallback, but say why.
					console.warn("3D viewer failed to mount; showing the static fallback.", err);
				});
			}
		},
		{ rootMargin: "200px" },
	);
	hosts.forEach((h) => io.observe(h));
}
