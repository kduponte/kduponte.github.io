/**
 * The 22R-E as a viewer subject. Each system's parts are tinted by how many forum failure threads
 * hit that system; hover or tap a part to read its count. Through the cut-away block the crank
 * turns at the factory idle speed, slowed 25 times, and each piston crown glows as its cylinder
 * fires, in the factory 1-3-4-2 order.
 */
import { build22REEngine } from "../../../lib/three/engine-22re-model";
import { crankAngleAt, type EngineSystem } from "../../../lib/three/engine-22re-data";
import { ENGINE_SHOW, hoverSystem, pinSystem, type EngineShowDetail } from "../engine-events";
import type { Camera } from "three";
import type { SubjectFactory } from "../viewer";

const HIGHLIGHT = 0.55;
/** Under reduced motion the crank holds here: just after cylinder 1 fires, so one crown glows. */
const STILL_ANGLE = 0.35;

const createEngine: SubjectFactory = ({ THREE, host, reducedMotion, requestRender }) => {
	const root = host.closest<HTMLElement>("[data-engine-root]") ?? host;
	const tints = JSON.parse(host.dataset.tints ?? "{}") as Partial<Record<EngineSystem, string>>;
	const engine = build22REEngine({ tints });
	engine.group.rotation.y = -0.5;
	engine.setCrank(STILL_ANGLE);

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const pick = (x: number, y: number, camera: Camera): EngineSystem | null => {
		pointer.set(x, y);
		raycaster.setFromCamera(pointer, camera);
		const hit = raycaster.intersectObjects(engine.parts, false)[0];
		return (hit?.object.userData.system as EngineSystem | undefined) ?? null;
	};

	let shown: EngineSystem | null = null;
	const highlight = (system: EngineSystem | null) => {
		if (system === shown) return;
		if (shown) engine.systemMaterials[shown].emissiveIntensity = 0;
		shown = system;
		if (shown) engine.systemMaterials[shown].emissiveIntensity = HIGHLIGHT;
		requestRender();
	};
	const onShow = (e: Event) => highlight((e as CustomEvent<EngineShowDetail>).detail.system);
	root.addEventListener(ENGINE_SHOW, onShow);

	return {
		root: engine.group,
		spin: engine.group,
		framing: { target: new THREE.Vector3(-0.07, 0.1, 0), turnRadius: 0.5, halfHeight: 0.3 },
		autoSpeed: 0.22,
		update({ t }) {
			if (!reducedMotion) engine.setCrank(crankAngleAt(t));
		},
		onPointerAt(x, y, camera) {
			hoverSystem(root, pick(x, y, camera));
		},
		onHover(h) {
			if (!h) hoverSystem(root, null);
		},
		onTapAt(x, y, camera) {
			pinSystem(root, pick(x, y, camera));
		},
		dispose() {
			root.removeEventListener(ENGINE_SHOW, onShow);
			engine.dispose();
		},
	};
};

export default createEngine;
