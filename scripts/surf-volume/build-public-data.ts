// Final pipeline step: reads the real normalized dataset and writes the frozen JSON the
// frontend actually consumes at public/data/surf-volume/*.json. No live network calls happen
// at request time — everything here runs at build/collection time only.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeComparison } from "../../src/lib/surf-volume/compare.ts";
import { computeConsensus } from "../../src/lib/surf-volume/consensus.ts";
import { generateDatasetBArchetypes, generateDatasetBSensitivityVariants, generateDatasetC } from "../../src/lib/surf-volume/profiles.ts";
import { fitRegression } from "../../src/lib/surf-volume/regression.ts";
import { computeAllScores } from "../../src/lib/surf-volume/scores.ts";
import type { Observation, SourceMetadata } from "../../src/lib/surf-volume/types.ts";

const PROCESSED_DIR = path.resolve(import.meta.dirname, "../../data/surf-volume/processed");
const OUT_DIR = path.resolve(import.meta.dirname, "../../public/data/surf-volume");

async function main() {
	const observations: Observation[] = JSON.parse(await readFile(path.join(PROCESSED_DIR, "calculator_observations.json"), "utf-8"));
	const sources: SourceMetadata[] = JSON.parse(await readFile(path.join(PROCESSED_DIR, "source_metadata.json"), "utf-8"));

	const { scores, consistencyFlags } = computeAllScores(sources, observations);

	// Firewire is the reference: simplest, most transparent, weight+skill-only system —
	// a natural baseline for interpreting the other sources' fixed effects.
	const modelOutputs = fitRegression(observations, "firewire");

	const datasetC = generateDatasetC();
	const profileSummary = computeComparison(datasetC, observations, sources);

	const datasetADistinctProfiles = [...new Set(observations.filter((o) => o.profile_id.startsWith("core_")).map((o) => o.profile_id))];
	const agreementByProfile = datasetADistinctProfiles
		.map((profileId) => {
			const profileObs = observations.filter((o) => o.profile_id === profileId && o.is_directly_comparable && o.recommended_volume_point_l !== null);
			const sample = observations.find((o) => o.profile_id === profileId);
			return {
				profile_id: profileId,
				weight_lb: sample?.weight_lb,
				skill: sample?.skill_normalized,
				...computeConsensus(profileObs.map((o) => o.recommended_volume_point_l as number)),
			};
		})
		.sort((a, b) => (a.weight_lb ?? 0) - (b.weight_lb ?? 0));

	await mkdir(OUT_DIR, { recursive: true });
	await Promise.all([
		writeFile(path.join(OUT_DIR, "source_metadata.json"), JSON.stringify(sources, null, 2)),
		writeFile(path.join(OUT_DIR, "calculator_observations.json"), JSON.stringify(observations, null, 2)),
		writeFile(path.join(OUT_DIR, "profile_summary.json"), JSON.stringify(profileSummary, null, 2)),
		writeFile(path.join(OUT_DIR, "source_scores.json"), JSON.stringify({ scores, consistencyFlags }, null, 2)),
		writeFile(path.join(OUT_DIR, "model_outputs.json"), JSON.stringify(modelOutputs, null, 2)),
		writeFile(
			path.join(OUT_DIR, "dataset-b-profiles.json"),
			JSON.stringify([...generateDatasetBArchetypes(), ...generateDatasetBSensitivityVariants()], null, 2),
		),
		writeFile(path.join(OUT_DIR, "dataset-c-default.json"), JSON.stringify(datasetC, null, 2)),
		writeFile(path.join(OUT_DIR, "agreement-by-profile.json"), JSON.stringify(agreementByProfile, null, 2)),
	]);

	console.log(`Built public data: ${sources.length} sources, ${observations.length} observations -> ${OUT_DIR}`);
	console.log(`Consensus for personal default profile: ${profileSummary.consensus.median} L (n=${profileSummary.consensus.n_contributing_systems}, agreement=${profileSummary.consensus.agreement_label})`);
	console.log(`Regression: R²=${modelOutputs.r_squared.toFixed(3)}, CV RMSE=${modelOutputs.cv_rmse.toFixed(2)} L, n=${modelOutputs.n_observations}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
