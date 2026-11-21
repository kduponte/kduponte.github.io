/**
 * The Forecast Gap buoy as a viewer subject: one buoy riding its own archived swell on a cut-away
 * block of sea, with each forecast traced on the block's sides (see lib/three/buoy-diorama.ts).
 *
 * - The block and the buoy spin as one. The swell runs in real time: crests advance one
 *   wavelength per wave period, and the buoy bobs and tilts with them.
 * - Hover warms the lantern. A tap steps to the next station.
 * - Where sharks have been recorded near the buoy, a shark's shadow sometimes crosses under the
 *   surface, as often as the record says (lib/three/shark.ts).
 * - The camera is framed once for every station (room for Monterey's 4.1 m anemometer mast included), so the
 *   block never changes size when the station does.
 * - Reduced motion: a still frame at t = 0 (a crest under the buoy), redrawn only when the
 *   station changes or the lantern glow settles.
 *
 * Station data comes from the JSON the component embeds at build time; station changes arrive
 * as events on the shared root, so the HTML readout and this chunk never import each other.
 */
import { buildBuoyDiorama, type DioramaStation } from "../../../lib/three/buoy-diorama";
import { BUOY_SELECT, currentStation, selectStation, type BuoySelectDetail } from "../buoy-events";
import type { SubjectFactory } from "../viewer";

/** Lantern glow at full hover. */
const LANTERN_WARM = 1.8;
/** How fast the glow eases in and out, per second. */
const LANTERN_EASE = 6;

const createBuoy: SubjectFactory = ({ THREE, host, reducedMotion, requestRender }) => {
	const root = host.closest<HTMLElement>("[data-buoy-root]") ?? host;
	const json = root.querySelector("script[data-buoy-data]")?.textContent;
	if (!json) throw new Error("Buoy viewer: no station data embedded");
	const { stations } = JSON.parse(json) as { stations: DioramaStation[] };

	const diorama = buildBuoyDiorama(stations, currentStation(root));
	diorama.group.rotation.y = -0.5;
	const rig = new THREE.Group();
	rig.add(diorama.group);

	let warm = 0;
	let warmTarget = 0;

	const onSelect = (e: Event) => {
		diorama.setStation((e as CustomEvent<BuoySelectDetail>).detail.index);
		requestRender();
	};
	root.addEventListener(BUOY_SELECT, onSelect);

	return {
		root: rig,
		spin: diorama.group,
		framing: diorama.framing,
		autoSpeed: 0.16,
		update({ t, dt }) {
			// Under reduced motion the frame is still, so the shark (pure motion) stays away.
			diorama.update(reducedMotion ? 0 : t, { sharks: !reducedMotion });
			warm = reducedMotion ? warmTarget : warm + (warmTarget - warm) * Math.min(1, dt * LANTERN_EASE);
			diorama.setLantern(warm * LANTERN_WARM);
		},
		busy: () => Math.abs(warm - warmTarget) >= 0.01,
		onTap() {
			selectStation(root, diorama.index + 1);
		},
		onHover(h) {
			warmTarget = h ? 1 : 0;
		},
		dispose() {
			root.removeEventListener(BUOY_SELECT, onSelect);
			diorama.dispose();
		},
	};
};

export default createBuoy;
