import { describe, expect, it } from "vitest";
import { chronological, costBySystem, entryCost, totalCost, totalHours, type TruckLogEntry } from "../../src/lib/truck-log/aggregate";

const ENTRIES: TruckLogEntry[] = [
	{
		date: new Date("2026-06-01"),
		title: "The story",
		system: "story",
		parts: [],
		hours: 0,
		people: ["Kyle"],
	},
	{
		date: new Date("2026-08-15"),
		title: "New gas tank",
		system: "fuel",
		parts: [
			{ name: "Gas tank", cost: 180 },
			{ name: "Fuel lines", cost: 45 },
		],
		hours: 4,
		people: ["Kyle", "Noah"],
	},
	{
		date: new Date("2026-08-01"),
		title: "Diagnose the leak",
		system: "fuel",
		parts: [{ name: "Shop rags", cost: 10 }],
		hours: 1,
		people: ["Kyle"],
	},
];

describe("entryCost / totalCost", () => {
	it("sums a single entry's parts cost", () => {
		expect(entryCost(ENTRIES[1])).toBe(225);
	});

	it("sums cost across all entries", () => {
		expect(totalCost(ENTRIES)).toBe(235);
	});

	it("returns 0 for an entry with no parts", () => {
		expect(entryCost(ENTRIES[0])).toBe(0);
	});
});

describe("totalHours", () => {
	it("sums hours across all entries", () => {
		expect(totalHours(ENTRIES)).toBe(5);
	});
});

describe("costBySystem", () => {
	it("groups and sums cost by system, omitting zero-cost systems", () => {
		const result = costBySystem(ENTRIES);
		expect(result).toEqual([{ system: "fuel", cost: 235 }]);
	});
});

describe("chronological", () => {
	it("sorts entries by date ascending", () => {
		const result = chronological(ENTRIES);
		expect(result.map((e) => e.title)).toEqual(["The story", "Diagnose the leak", "New gas tank"]);
	});

	it("does not mutate the input array", () => {
		const copy = [...ENTRIES];
		chronological(ENTRIES);
		expect(ENTRIES).toEqual(copy);
	});
});
