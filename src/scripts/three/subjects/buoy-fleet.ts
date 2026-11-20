/**
 * "The twelve buoys" as a viewer subject: every station's buoy at true size on one block of still
 * water (see lib/three/buoy-fleet.ts), turning slowly as one.
 *
 * - The selected station's lantern glows and a ring marks it. Selection arrives as events on the
 *   section's root (a card pointed at, focused or clicked); a tap on the view steps to the next.
 * - Reduced motion: no turning, and the lantern switches without easing.
 *
 * Station data comes from the JSON the section embeds at build time.
 */
import { buildBuoyFleet, type FleetStation } from "../../../lib/three/buoy-fleet";
import { BUOY_SELECT, currentStation, selectStation, type BuoySelectDetail } from "../buoy-events";
import type { SubjectFactory } from "../viewer";

const createFleet: SubjectFactory = ({ THREE, host, reducedMotion, requestRender }) => {
	const root = host.closest<HTMLElement>("[data-fleet-root]") ?? host;
	const json = root.querySelector("script[data-fleet-data]")?.textContent;
	if (!json) throw new Error("Buoy fleet: no station data embedded");
	const { stations } = JSON.parse(json) as { stations: FleetStation[] };

	const fleet = buildBuoyFleet(stations, currentStation(root));
	fleet.group.rotation.y = -0.35;
	const rig = new THREE.Group();
	rig.add(fleet.group);

	const onSelect = (e: Event) => {
		fleet.setStation((e as CustomEvent<BuoySelectDetail>).detail.index);
		requestRender();
	};
	root.addEventListener(BUOY_SELECT, onSelect);

	return {
		root: rig,
		spin: fleet.group,
		framing: fleet.framing,
		autoSpeed: 0.12,
		update({ dt }) {
			fleet.update(dt, reducedMotion);
		},
		busy: () => fleet.busy(),
		onTap() {
			selectStation(root, fleet.index + 1);
		},
		dispose() {
			root.removeEventListener(BUOY_SELECT, onSelect);
			fleet.dispose();
		},
	};
};

export default createFleet;
