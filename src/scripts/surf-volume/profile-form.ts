// Mounts the personal-profile form (brief §17 Viz 1 hero interaction). Builds a LiveProfile on
// every change, recomputes the comparison via the shared src/lib/surf-volume core (the exact
// same function that produced the frozen profile_summary.json at build time), and broadcasts
// the result. No React — this is the entire client controller for the hero demo.
import { computeComparison } from "../../lib/surf-volume/compare";
import type { Conditions, Fitness, Frequency, LiveProfile, Skill, Wetsuit } from "../../lib/surf-volume/types";
import { loadSurfVolumeData } from "./data-client";
import { dispatchProfileChange } from "./state";

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return ((...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	}) as T;
}

export async function initProfileForm(formEl: HTMLFormElement) {
	const { observations, sources, defaultProfile } = await loadSurfVolumeData();

	const weightInput = formEl.querySelector<HTMLInputElement>("#vg-weight")!;
	const skillSelect = formEl.querySelector<HTMLSelectElement>("#vg-skill")!;
	const ageInput = formEl.querySelector<HTMLInputElement>("#vg-age")!;
	const fitnessSelect = formEl.querySelector<HTMLSelectElement>("#vg-fitness")!;
	const frequencySelect = formEl.querySelector<HTMLSelectElement>("#vg-frequency")!;

	weightInput.value = String(defaultProfile.weight_lb);
	skillSelect.value = defaultProfile.skill;
	ageInput.value = defaultProfile.age !== undefined ? String(defaultProfile.age) : "";
	fitnessSelect.value = defaultProfile.fitness ?? "";
	frequencySelect.value = defaultProfile.frequency ?? "";

	function readProfile(): LiveProfile {
		const weight_lb = Math.min(280, Math.max(100, Number(weightInput.value) || defaultProfile.weight_lb));
		const skill = skillSelect.value as Skill;
		const age = ageInput.value ? Number(ageInput.value) : undefined;
		const fitness = (fitnessSelect.value || undefined) as Fitness | undefined;
		const frequency = (frequencySelect.value || undefined) as Frequency | undefined;
		return { weight_lb, skill, age, fitness, frequency, conditions: undefined as Conditions | undefined, wetsuit: undefined as Wetsuit | undefined };
	}

	function recompute() {
		const profile = readProfile();
		const result = computeComparison(profile, observations, sources);
		dispatchProfileChange(result);
	}

	const debouncedRecompute = debounce(recompute, 150);
	weightInput.addEventListener("input", debouncedRecompute);
	ageInput.addEventListener("input", debouncedRecompute);
	skillSelect.addEventListener("change", recompute);
	fitnessSelect.addEventListener("change", recompute);
	frequencySelect.addEventListener("change", recompute);

	recompute();
}

document.addEventListener("DOMContentLoaded", () => {
	const formEl = document.querySelector<HTMLFormElement>("#vg-profile-form");
	if (formEl) initProfileForm(formEl);
});
