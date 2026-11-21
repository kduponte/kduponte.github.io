/**
 * Projects whose card shows a live 3D preview. Each slug here needs a matching branch in
 * components/three/TilePreview.astro.
 */
export const TILE_PREVIEW_SLUGS: ReadonlySet<string> = new Set([
	"the-22re-restoration",
	"the-volume-gap",
	"the-forecast-gap",
]);

export const hasTilePreview = (slug: string) => TILE_PREVIEW_SLUGS.has(slug);

/** CSS grid-column and grid-row values for one card on the 12-column projects grid. */
export interface TilePlacement {
	column: string;
	row: string;
}

/**
 * Lays the projects grid out in reading order with no holes. A card with a 3D preview is a
 * feature: seven columns wide and two rows tall, with the plain cards around it stacked in the
 * five columns beside it (the card just before it, if plain, joins it, then the cards after).
 * Other cards share rows in pairs. Wide and narrow sides swap each row group, so features
 * alternate left and right and the grid reads as a collage instead of a uniform list.
 */
export function layoutTiles(features: readonly boolean[]): TilePlacement[] {
	const n = features.length;
	const out: TilePlacement[] = new Array(n);
	let row = 1;
	let wideLeft = true;
	let i = 0;
	while (i < n) {
		const f = features[i] ? i : i + 1 < n && features[i + 1] ? i + 1 : -1;
		if (f >= 0) {
			const partners = f > i ? [i] : [];
			let j = f + 1;
			while (partners.length < 2 && j < n && !features[j]) partners.push(j++);
			if (partners.length === 0) {
				// Nothing to stack beside it: give it the whole row.
				out[f] = { column: "1 / span 12", row: `${row}` };
				row += 1;
			} else {
				out[f] = { column: wideLeft ? "1 / span 7" : "6 / span 7", row: `${row} / span 2` };
				partners.forEach((p, k) => {
					out[p] = {
						column: wideLeft ? "8 / span 5" : "1 / span 5",
						row: partners.length === 1 ? `${row} / span 2` : `${row + k}`,
					};
				});
				row += 2;
			}
			i = j;
		} else if (i + 1 < n) {
			// Two plain cards (neither is a feature, or f would be set).
			out[i] = { column: wideLeft ? "1 / span 7" : "1 / span 5", row: `${row}` };
			out[i + 1] = { column: wideLeft ? "8 / span 5" : "6 / span 7", row: `${row}` };
			row += 1;
			i += 2;
		} else {
			out[i] = { column: "1 / span 12", row: `${row}` };
			row += 1;
			i += 1;
		}
		wideLeft = !wideLeft;
	}
	return out;
}
