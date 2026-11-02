import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Shape only, and deliberately offline. The network check lives in
// scripts/surf-forecast/collect/verify-playlists.ts and runs when a human runs it; a test suite
// that depended on Spotify being up would fail for reasons that have nothing to do with this code.
const data = JSON.parse(readFileSync("public/data/surf-forecast/playlists.json", "utf8")) as {
	verified_at: string;
	note: string;
	playlists: { tier: string; id: string; name: string; url: string; embed_url: string; rationale: string }[];
};

describe("verified playlists", () => {
	it("records when verification last ran", () => {
		expect(Number.isNaN(Date.parse(data.verified_at))).toBe(false);
	});

	it("covers exactly the three rated tiers, with no duplicates", () => {
		expect(data.playlists.map((p) => p.tier).sort()).toEqual(["firing", "fun", "junk"]);
	});

	it("points every embed at the Spotify playlist embed path for its own id", () => {
		for (const p of data.playlists) {
			expect(p.id).toMatch(/^[A-Za-z0-9]{22}$/);
			expect(p.embed_url).toBe(`https://open.spotify.com/embed/playlist/${p.id}`);
			expect(p.url).toBe(`https://open.spotify.com/playlist/${p.id}`);
		}
	});

	it("carries a real name and rationale for each, since both are rendered", () => {
		for (const p of data.playlists) {
			expect(p.name.trim().length).toBeGreaterThan(0);
			expect(p.rationale.trim().length).toBeGreaterThan(0);
		}
	});

	it("uses distinct playlists per tier, so the three verdicts do not collapse into one", () => {
		expect(new Set(data.playlists.map((p) => p.id)).size).toBe(data.playlists.length);
	});
});
