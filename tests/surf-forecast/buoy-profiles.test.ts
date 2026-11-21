import { describe, expect, it } from "vitest";
import pages from "../../public/data/surf-forecast/buoy-stations.json";
import coverage from "../../public/data/surf-forecast/coverage.json";
import stations from "../../public/data/surf-forecast/stations.json";
import metadata from "../../public/data/surf-forecast/metadata.json";
import { PROFILE_LEAD_DAYS, buoyProfiles, countWord, hullLabel, operatorLabel, shortOrg, type ErrorRow } from "../../src/lib/surf-forecast/buoy-profiles";
import { instrumentFor } from "../../src/lib/surf-forecast/buoy-snapshot";

const REP = { ecmwf: "ecmwf_wam", noaa: "ncep_gfswave016", dwd: "gwam" } as const;
const profiles = buoyProfiles({
	pages: pages.stations,
	coverage: coverage.rows,
	errors: stations.rows as ErrorRow[],
	representative: REP,
	systems: ["ecmwf", "noaa", "dwd"],
});

describe("buoyProfiles", () => {
	it("has one profile per buoy, by region and then west to east", () => {
		expect(profiles.map((p) => p.station)).toEqual(["51208", "51201", "51211", "51202", "51205", "51206", "46237", "46042", "46221", "46222", "46224", "46254"]);
	});

	it("draws each buoy as the hull its station page names", () => {
		for (const p of profiles) expect(p.instrument === "waverider").toBe(/Waverider/.test(p.page.hull));
		expect(profiles.filter((p) => instrumentFor(p.station) === "discus").map((p) => p.station)).toEqual(["46042"]);
	});

	it("totals the record to the coverage the analysis reports", () => {
		for (const p of profiles) {
			const meta = metadata.stations.find((s) => s.station === p.station)!;
			expect(p.record.share).toBeCloseTo(meta.height_obs_coverage, 3);
			expect(p.record.months).toHaveLength(metadata.window.months);
		}
		// Waimea was dark in March and April.
		const waimea = profiles.find((p) => p.station === "51201")!;
		expect(waimea.record.months.filter((m) => m.share === 0).map((m) => m.month)).toEqual(["2026-03", "2026-04"]);
	});

	it(`quotes each system's wave height error ${PROFILE_LEAD_DAYS} days out from its representative model`, () => {
		const waimea = profiles.find((p) => p.station === "51201")!;
		const row = (source: string) => stations.rows.find((r) => r.scope === "51201" && r.source === source && r.variable === "wave_height" && r.lead_days === 3)!;
		expect(waimea.errors.map((e) => e.system)).toEqual(["ecmwf", "noaa", "dwd"]);
		expect(waimea.errors[0].mae_m).toBe(row("ecmwf_wam").mae);
		expect(waimea.errors[2].bias_m).toBe(row("gwam").bias);
	});

	it("lists the breaks each buoy is nearest to, nearest first", () => {
		const waimea = profiles.find((p) => p.station === "51201")!;
		expect(waimea.breaks.map((b) => b.name)).toEqual(["Waimea Bay", "Pipeline", "Sunset Beach", "Haleiwa"]);
		const monterey = profiles.find((p) => p.station === "46042")!;
		expect(monterey.breaks.every((b) => b.tier === "disagreement_only")).toBe(true);
	});
});

describe("labels", () => {
	it("tidies NDBC's hull lines", () => {
		expect(hullLabel("3-meter foam buoy w/ seal cage")).toBe("3 m foam buoy with seal cage");
		expect(hullLabel("Waverider Buoy")).toBe("Waverider buoy");
	});

	it("names who runs a buoy and who its data comes through", () => {
		expect(shortOrg("Pacific Islands Ocean Observing System (PacIOOS)")).toBe("PacIOOS");
		expect(operatorLabel({ owner: "Pacific Islands Ocean Observing System (PacIOOS)", data_from: "Scripps Institution of Oceanography" })).toBe(
			"PacIOOS, data from Scripps Institution of Oceanography",
		);
		expect(operatorLabel({ owner: null, data_from: "Scripps Institution of Oceanography" })).toBe("Scripps Institution of Oceanography");
		expect(operatorLabel({ owner: "National Data Buoy Center", data_from: null })).toBe("National Data Buoy Center");
	});

	it("writes small counts as words", () => {
		expect(countWord(12)).toBe("twelve");
		expect(countWord(11, true)).toBe("Eleven");
		expect(countWord(40)).toBe("40");
	});
});
