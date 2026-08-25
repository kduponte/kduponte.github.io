import { describe, expect, it } from "vitest";
import { countByCategory, countByCategoryAndSource, countBySource, type FailurePoint } from "../../src/lib/toyota-truck/aggregate";

const SAMPLE: FailurePoint[] = [
	{ thread_id: "1", thread_title: "a", thread_url: "https://a.example/1", source_id: "yotatech", source_name: "YotaTech", category: "Cooling / overheating" },
	{ thread_id: "2", thread_title: "b", thread_url: "https://a.example/2", source_id: "yotatech", source_name: "YotaTech", category: "Cooling / overheating" },
	{ thread_id: "3", thread_title: "c", thread_url: "https://b.example/3", source_id: "ih8mud", source_name: "IH8MUD", category: "Electrical" },
	{ thread_id: "4", thread_title: "d", thread_url: "https://c.example/4", source_id: "tacomaworld", source_name: "TacomaWorld", category: "Other / uncategorized" },
];

describe("countByCategory", () => {
	it("counts and sorts categories descending", () => {
		const result = countByCategory(SAMPLE);
		expect(result[0]).toEqual({ category: "Cooling / overheating", count: 2, percentage: 50 });
		expect(result.map((r) => r.category)).toEqual(["Cooling / overheating", "Electrical", "Other / uncategorized"]);
	});

	it("percentages sum to 100 across all categories", () => {
		const result = countByCategory(SAMPLE);
		const total = result.reduce((sum, r) => sum + r.percentage, 0);
		expect(total).toBeCloseTo(100, 6);
	});

	it("counts sum to the total number of points passed in", () => {
		const result = countByCategory(SAMPLE);
		const total = result.reduce((sum, r) => sum + r.count, 0);
		expect(total).toBe(SAMPLE.length);
	});

	it("returns an empty array for no points", () => {
		expect(countByCategory([])).toEqual([]);
	});
});

describe("countBySource", () => {
	it("counts and sorts sources descending, carrying the display name through", () => {
		const result = countBySource(SAMPLE);
		expect(result).toEqual([
			{ source_id: "yotatech", source_name: "YotaTech", count: 2 },
			{ source_id: "ih8mud", source_name: "IH8MUD", count: 1 },
			{ source_id: "tacomaworld", source_name: "TacomaWorld", count: 1 },
		]);
	});

	it("counts sum to the total number of points passed in", () => {
		const result = countBySource(SAMPLE);
		const total = result.reduce((sum, r) => sum + r.count, 0);
		expect(total).toBe(SAMPLE.length);
	});
});

describe("countByCategoryAndSource", () => {
	it("counts each (category, source) pair separately", () => {
		const result = countByCategoryAndSource(SAMPLE);
		expect(result).toContainEqual({ category: "Cooling / overheating", source_id: "yotatech", source_name: "YotaTech", count: 2 });
		expect(result).toContainEqual({ category: "Electrical", source_id: "ih8mud", source_name: "IH8MUD", count: 1 });
		expect(result).toContainEqual({ category: "Other / uncategorized", source_id: "tacomaworld", source_name: "TacomaWorld", count: 1 });
	});

	it("sorts by each category's total count descending", () => {
		const result = countByCategoryAndSource(SAMPLE);
		expect(result[0].category).toBe("Cooling / overheating");
	});

	it("counts sum to the total number of points passed in", () => {
		const result = countByCategoryAndSource(SAMPLE);
		const total = result.reduce((sum, r) => sum + r.count, 0);
		expect(total).toBe(SAMPLE.length);
	});

	it("returns an empty array for no points", () => {
		expect(countByCategoryAndSource([])).toEqual([]);
	});
});
