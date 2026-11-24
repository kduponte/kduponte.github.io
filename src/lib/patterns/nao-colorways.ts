/**
 * Nao's colorways are the site's season pairs (lib/project-theme.ts): the ground is the cloth and
 * the ring is the ink, so each prints as a single color. Nine pairs come from Cav Empt's lookbook
 * and two from Signal. Signal's own pair is left out, because its safety orange means "you can
 * click this" on the site.
 *
 * Dark grounds go inside the workwear (lining and pocket bags); light grounds go on the surf wax
 * side (tees, boardshorts, wrappers).
 */
import { SEASON, isLight, type SeasonId } from "../project-theme";

export interface NaoColorway {
	id: SeasonId;
	name: string;
	ground: string;
	ink: string;
	/** Where the pair came from, e.g. "Cav Empt look 23". */
	source: string;
	group: "dark" | "light";
}

export const NAO_COLORWAYS: readonly NaoColorway[] = SEASON.filter((p) => p.id !== "signal").map((p) => ({
	id: p.id,
	name: p.name,
	ground: p.ground,
	ink: p.ring,
	source: p.source,
	group: isLight(p.ground) ? "light" : "dark",
}));

export const colorway = (id: SeasonId): NaoColorway => {
	const c = NAO_COLORWAYS.find((x) => x.id === id);
	if (!c) throw new Error(`No Nao colorway "${id}"`);
	return c;
};

/** The colorways the write-up shows on the garments and in its main figures. */
export const NAO_SHOWN = { print: "night", lining: "moss", tee: "cobalt" } as const satisfies Record<string, SeasonId>;
