/**
 * The truck builder as a viewer subject: the 22RE truck rebuilt for whatever build the controls
 * show, with the hood, doors and tailgate on hinges and the 22R-E in the bay. Tap a hinged part to
 * open or close it; the HTML buttons do the same.
 */
import { buildToyotaTruck, DEFAULT_TRUCK_COLORS, type OpenerKey, type TruckModel } from "../../../lib/three/toyota-truck-model";
import { build22REEngine } from "../../../lib/three/engine-22re-model";
import { AS_IT_SITS, truckSetup, type Build } from "../../../lib/three/truck-builder-options";
import { BUILD_SHOW, OPEN_SET, currentBuild, openParts, partToggled, type BuildShowDetail, type OpenDetail } from "../truck-builder-events";
import type { Camera } from "three";
import type { SubjectFactory } from "../viewer";

/** Seconds for a part to swing fully open. */
const SWING_S = 0.7;
/** The turntable radius the camera frames, meters. */
export const FRAME_RADIUS = 3.0;
/**
 * Where along the truck it spins, meters from the model's origin (rearward is negative). Every build
 * turns about the same point at the same scale, so switching builds never resizes or slides the truck.
 * Here the longest build (a 9'4" longboard hanging out the back) and the stock truck with its doors
 * open both reach about 3.0 m from the axis, which the camera frames.
 */
export const SPIN_CENTER_X = -0.6;
const KEYS: OpenerKey[] = ["hood", "doorLeft", "doorRight", "tailgate"];

const createTruckBuilder: SubjectFactory = ({ THREE, host, reducedMotion, requestRender }) => {
	const root = host.closest<HTMLElement>("[data-truck-builder-root]") ?? host;
	const engine = build22REEngine({ cutaway: false });
	const rig = new THREE.Group();
	const spinner = new THREE.Group();
	spinner.rotation.y = -0.6;
	rig.add(spinner);

	const amount: Record<OpenerKey, number> = { hood: 0, doorLeft: 0, doorRight: 0, tailgate: 0 };
	const target: Record<OpenerKey, number> = { hood: 0, doorLeft: 0, doorRight: 0, tailgate: 0 };
	for (const k of openParts(root)) amount[k] = target[k] = 1;

	let truck: TruckModel | null = null;
	const build = (b: Build) => {
		const setup = truckSetup(b);
		if (truck) {
			spinner.remove(truck.group);
			truck.dispose();
		}
		truck = buildToyotaTruck({ ...DEFAULT_TRUCK_COLORS, body: setup.body }, { ...setup.options, openable: true, engine: engine.group });
		for (const k of KEYS) truck.setOpen?.(k, amount[k]);
		truck.group.position.x = -SPIN_CENTER_X;
		spinner.add(truck.group);
		requestRender();
	};
	build(currentBuild(root) ?? AS_IT_SITS);

	const onBuild = (e: Event) => build((e as CustomEvent<BuildShowDetail>).detail.build);
	const onOpen = (e: Event) => {
		const { key, open } = (e as CustomEvent<OpenDetail>).detail;
		target[key] = open ? 1 : 0;
		if (reducedMotion) {
			amount[key] = target[key];
			truck?.setOpen?.(key, amount[key]);
		}
		requestRender();
	};
	root.addEventListener(BUILD_SHOW, onBuild);
	root.addEventListener(OPEN_SET, onOpen);

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const pickOpener = (x: number, y: number, camera: Camera): OpenerKey | null => {
		if (!truck) return null;
		pointer.set(x, y);
		raycaster.setFromCamera(pointer, camera);
		const hit = raycaster.intersectObjects(truck.parts, false)[0];
		return (hit?.object.userData.opener as OpenerKey | undefined) ?? null;
	};

	const moving = () => KEYS.some((k) => Math.abs(amount[k] - target[k]) > 1e-3);

	return {
		root: rig,
		spin: spinner,
		framing: { target: new THREE.Vector3(0, 0.75, 0), turnRadius: FRAME_RADIUS, halfHeight: 1.1, viewDir: new THREE.Vector3(5.2, 1.9, 5.9) },
		autoSpeed: 0.3,
		update({ dt, spin }) {
			if (!truck) return;
			for (const wheel of truck.wheels) wheel.rotation.z -= spin * dt * 3;
			for (const k of KEYS) {
				if (amount[k] === target[k]) continue;
				const step = dt / SWING_S;
				amount[k] = amount[k] < target[k] ? Math.min(target[k], amount[k] + step) : Math.max(target[k], amount[k] - step);
				// Ease in and out over the swing.
				const t = amount[k];
				truck.setOpen?.(k, t * t * (3 - 2 * t));
			}
		},
		busy: moving,
		onTapAt(x, y, camera) {
			const key = pickOpener(x, y, camera);
			if (key) partToggled(root, key);
		},
		dispose() {
			root.removeEventListener(BUILD_SHOW, onBuild);
			root.removeEventListener(OPEN_SET, onOpen);
			truck?.dispose();
			engine.dispose();
		},
	};
};

export default createTruckBuilder;
