// Sampling design — brief §11. Deliberately NOT a full Cartesian product across every
// possible input; a staged design so richer calculators (more supported inputs) don't
// dominate the dataset or blow up collection effort.
import { CONDITIONS, FITNESS_LEVELS, FREQUENCIES, WETSUITS } from "./taxonomy";
import type { Conditions, Fitness, Frequency, SampleProfile, Skill, Wetsuit } from "./types";

const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240] as const;
const CORE_SKILLS: Skill[] = ["beginner", "intermediate", "advanced"];

const CORE_REFERENCE = {
	age: 35,
	fitness: "average" as Fitness,
	frequency: "weekly" as Frequency,
	conditions: "average" as Conditions,
	wetsuit: "standard" as Wetsuit,
};

/**
 * Simple weight -> height band, brief §11: "define a simple height band by weight,
 * do not create a complicated anthropometric model." Six bands over the core weight
 * range, linear-ish by inspection, not fit to any dataset.
 */
const HEIGHT_BANDS_IN: { maxWeightLb: number; heightIn: number }[] = [
	{ maxWeightLb: 130, heightIn: 66 }, // 5'6"
	{ maxWeightLb: 150, heightIn: 68 }, // 5'8"
	{ maxWeightLb: 170, heightIn: 70 }, // 5'10"
	{ maxWeightLb: 190, heightIn: 71 }, // 5'11"
	{ maxWeightLb: 210, heightIn: 72 }, // 6'0"
	{ maxWeightLb: Infinity, heightIn: 74 }, // 6'2"
];

export function heightForWeight(weightLb: number): number {
	const band = HEIGHT_BANDS_IN.find((b) => weightLb <= b.maxWeightLb);
	return (band ?? HEIGHT_BANDS_IN[HEIGHT_BANDS_IN.length - 1]).heightIn;
}

/** Dataset A: the core comparison grid — 7 weights x 3 skills = 21 profiles. Brief §11. */
export function generateDatasetA(): SampleProfile[] {
	const profiles: SampleProfile[] = [];
	for (const weight_lb of CORE_WEIGHTS_LB) {
		for (const skill of CORE_SKILLS) {
			profiles.push({
				profile_id: `core_w${weight_lb}_${skill}`,
				dataset: "A",
				weight_lb,
				height_in: heightForWeight(weight_lb),
				skill,
				age: CORE_REFERENCE.age,
				fitness: CORE_REFERENCE.fitness,
				frequency: CORE_REFERENCE.frequency,
				conditions: CORE_REFERENCE.conditions,
				wetsuit: CORE_REFERENCE.wetsuit,
			});
		}
	}
	return profiles;
}

interface Archetype {
	slug: string;
	label: string;
	weight_lb: number;
	height_in: number;
	age: number;
	fitness: Fitness;
	frequency: Frequency;
	skill: Skill;
	conditions: Conditions;
	wetsuit: Wetsuit;
}

/** The 6 named archetypes from brief §11 Dataset B, verbatim. */
const ARCHETYPES: Archetype[] = [
	{
		slug: "new_learner",
		label: "New learner",
		weight_lb: 150,
		height_in: 68,
		age: 25,
		fitness: "average",
		frequency: "occasional",
		skill: "beginner",
		conditions: "weak_or_small",
		wetsuit: "standard",
	},
	{
		slug: "larger_new_learner",
		label: "Larger new learner",
		weight_lb: 200,
		height_in: 72,
		age: 37,
		fitness: "average",
		frequency: "occasional",
		skill: "beginner",
		conditions: "weak_or_small",
		wetsuit: "standard",
	},
	{
		slug: "weekend_intermediate",
		label: "Weekend intermediate",
		weight_lb: 175,
		height_in: 70,
		age: 35,
		fitness: "average",
		frequency: "weekly",
		skill: "intermediate",
		conditions: "average",
		wetsuit: "standard",
	},
	{
		slug: "fit_frequent_intermediate",
		label: "Fit frequent intermediate",
		weight_lb: 175,
		height_in: 70,
		age: 28,
		fitness: "high",
		frequency: "frequent",
		skill: "intermediate",
		conditions: "average",
		wetsuit: "none_or_light",
	},
	{
		slug: "older_experienced_surfer",
		label: "Older experienced surfer",
		weight_lb: 190,
		height_in: 72,
		age: 55,
		fitness: "average",
		frequency: "weekly",
		skill: "advanced",
		conditions: "average",
		wetsuit: "standard",
	},
	{
		slug: "fit_advanced_surfer",
		label: "Fit advanced surfer",
		weight_lb: 165,
		height_in: 69,
		age: 28,
		fitness: "high",
		frequency: "frequent",
		skill: "advanced",
		conditions: "powerful_or_large",
		wetsuit: "none_or_light",
	},
];

function archetypeToProfile(a: Archetype): SampleProfile {
	return {
		profile_id: a.slug,
		dataset: "B",
		archetype_label: a.label,
		weight_lb: a.weight_lb,
		height_in: a.height_in,
		age: a.age,
		fitness: a.fitness,
		frequency: a.frequency,
		skill: a.skill,
		conditions: a.conditions,
		wetsuit: a.wetsuit,
	};
}

/** Dataset B base: the 6 archetypes themselves, no variation. */
export function generateDatasetBArchetypes(): SampleProfile[] {
	return ARCHETYPES.map(archetypeToProfile);
}

/**
 * Dataset B sensitivity variants: for each archetype, vary ONE factor at a time to
 * the taxonomy's other values, holding everything else at the archetype's base.
 * Brief §11: "vary one factor at a time... keep this small and intentional." Only
 * collected for rich-input systems (Lost/JS/Rusty) — see brief §11 note.
 */
export function generateDatasetBSensitivityVariants(): SampleProfile[] {
	const variants: SampleProfile[] = [];
	for (const a of ARCHETYPES) {
		for (const age of [a.age - 15, a.age + 15]) {
			if (age > 0) {
				variants.push({
					...archetypeToProfile(a),
					profile_id: `sens_${a.slug}_age_${age}`,
					variant_factor: "age",
					age,
				});
			}
		}
		for (const fitness of FITNESS_LEVELS.filter((f) => f !== a.fitness)) {
			variants.push({
				...archetypeToProfile(a),
				profile_id: `sens_${a.slug}_fitness_${fitness}`,
				variant_factor: "fitness",
				fitness,
			});
		}
		for (const frequency of FREQUENCIES.filter((f) => f !== a.frequency)) {
			variants.push({
				...archetypeToProfile(a),
				profile_id: `sens_${a.slug}_frequency_${frequency}`,
				variant_factor: "frequency",
				frequency,
			});
		}
		for (const conditions of CONDITIONS.filter((c) => c !== a.conditions)) {
			variants.push({
				...archetypeToProfile(a),
				profile_id: `sens_${a.slug}_conditions_${conditions}`,
				variant_factor: "conditions",
				conditions,
			});
		}
		for (const wetsuit of WETSUITS.filter((w) => w !== a.wetsuit)) {
			variants.push({
				...archetypeToProfile(a),
				profile_id: `sens_${a.slug}_wetsuit_${wetsuit}`,
				variant_factor: "wetsuit",
				wetsuit,
			});
		}
	}
	return variants;
}

/**
 * Dataset C: the single editable personal default profile, brief §11. Deliberately a generic
 * placeholder profile (180 lb / 30 years old), not the site owner's actual stats.
 */
export function generateDatasetC(): SampleProfile {
	const weight_lb = 180;
	return {
		profile_id: "personal_default",
		dataset: "C",
		weight_lb,
		height_in: heightForWeight(weight_lb),
		age: 30,
		skill: "beginner",
		fitness: "average",
		frequency: "occasional",
		conditions: "average", // brief says "weak_to_average"; average is the closest taxonomy value
		wetsuit: "standard",
	};
}
