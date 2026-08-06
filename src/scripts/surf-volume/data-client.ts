// Fetches the frozen public/data/surf-volume/*.json artifacts at runtime (no live API, no
// build-time bundling of the full dataset into every page's JS). Cached per page load.
import type { Observation, SampleProfile, SourceMetadata } from "../../lib/surf-volume/types";

let cached: Promise<{ observations: Observation[]; sources: SourceMetadata[]; defaultProfile: SampleProfile }> | null = null;

export function loadSurfVolumeData() {
	if (!cached) {
		cached = Promise.all([
			fetch("/data/surf-volume/calculator_observations.json").then((r) => r.json() as Promise<Observation[]>),
			fetch("/data/surf-volume/source_metadata.json").then((r) => r.json() as Promise<SourceMetadata[]>),
			fetch("/data/surf-volume/dataset-c-default.json").then((r) => r.json() as Promise<SampleProfile>),
		]).then(([observations, sources, defaultProfile]) => ({ observations, sources, defaultProfile }));
	}
	return cached;
}
