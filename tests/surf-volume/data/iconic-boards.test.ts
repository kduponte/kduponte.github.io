// Data gate for the hand-curated iconic boards behind the Volume Gap's 3D hero, plus the size
// rule, range placement and volume-estimate method it relies on.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	estimateVolumeL,
	formatInches,
	formatLengthIn,
	parseLengthIn,
	pickNearestSize,
	placeAgainstRange,
	resolveBoards,
	withVolumes,
	type IconicBoardData,
} from "../../../src/lib/surf-volume/iconic-boards";
import type { ComparisonResult } from "../../../src/lib/surf-volume/types";

const PUBLIC = path.resolve(import.meta.dirname, "../../../public/data/surf-volume");
const data: IconicBoardData = JSON.parse(readFileSync(path.join(PUBLIC, "iconic_boards.json"), "utf-8"));
const summary: ComparisonResult = JSON.parse(readFileSync(path.join(PUBLIC, "profile_summary.json"), "utf-8"));

describe("iconic_boards.json", () => {
	it("cites a real URL for every size", () => {
		for (const board of data.boards) {
			expect(board.sources.length).toBeGreaterThan(0);
			for (const size of board.sizes) {
				const src = board.sources[size.source];
				expect(src, `${board.id} ${size.length}`).toBeDefined();
				expect(src.url).toMatch(/^https:\/\//);
			}
		}
	});

	it("flags every volume as published or estimated, and published ones carry a number", () => {
		for (const board of data.boards) {
			for (const size of board.sizes) {
				expect(["published", "estimated"]).toContain(size.volume_status);
				if (size.volume_status === "published") expect(size.volume_l).toBeGreaterThan(0);
			}
		}
	});

	it("has plausible surfboard dimensions", () => {
		for (const board of data.boards) {
			for (const size of board.sizes) {
				const L = parseLengthIn(size.length);
				expect(L).toBeGreaterThan(48);
				expect(L).toBeLessThan(144);
				expect(size.width_in).toBeGreaterThan(16);
				expect(size.width_in).toBeLessThan(26);
				expect(size.thickness_in).toBeGreaterThan(1.8);
				expect(size.thickness_in).toBeLessThan(4.5);
			}
		}
	});

	it("places every label on its board, in one of the site's fonts", () => {
		for (const { board, size } of resolveBoards(data, summary.consensus, summary.rows)) {
			const L = parseLengthIn(size.length);
			for (const label of board.labels ?? []) {
				// Each label is either a logo from the registry or text in one of the site's fonts.
				expect(Boolean(label.logo) !== Boolean(label.text?.trim()), `${board.id} label`).toBe(true);
				if (label.logo) expect(data.logos?.[label.logo], label.logo).toBeDefined();
				else expect(["display", "script", "sans", "mono"]).toContain(label.font);
				expect(["deck", "bottom"]).toContain(label.side);
				expect(["along", "across"]).toContain(label.orient);
				expect(label.at_in, `${board.id} ${label.text}`).toBeGreaterThan(4);
				expect(label.at_in, `${board.id} ${label.text}`).toBeLessThan(L - 4);
				expect(Math.abs(label.z_in)).toBeLessThan(size.width_in / 2);
				// Big laminates (the AIPA atom spans half the bottom) stay well inside the outline.
				expect(label.height_in).toBeLessThan(size.width_in / 2);
				expect([undefined, "nose", "tail"]).toContain(label.anchor);
				for (const c of [label.color].flat()) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
			}
		}
	});

	it("ships every logo file it names, with its source", () => {
		for (const [key, logo] of Object.entries(data.logos ?? {})) {
			expect(existsSync(path.resolve(PUBLIC, "../..", `.${logo.file}`)), key).toBe(true);
			expect(logo.source, key).toMatch(/^https:\/\//);
			if (logo.mask === "glyph") expect(logo.glyph, key).toBeTruthy();
		}
	});

	it("dresses decks and bottoms only in makers' logo files, never typeset words", () => {
		for (const board of data.boards) for (const label of board.labels ?? []) expect(label.logo, `${board.id} ${label.text ?? ""}`).toBeTruthy();
	});

	it("uses every logo it ships, and never typesets a model name on a deck", () => {
		const used = new Set(data.boards.flatMap((b) => (b.labels ?? []).map((l) => l.logo).filter(Boolean)));
		for (const key of Object.keys(data.logos ?? {})) expect(used.has(key), key).toBe(true);
		for (const board of data.boards) {
			for (const label of board.labels ?? []) {
				if (label.side !== "deck" || !label.text) continue;
				expect(label.text.toLowerCase(), board.id).not.toContain(board.name.toLowerCase().replace(/^'/, ""));
			}
		}
	});

	it("uses unique ids", () => {
		const ids = data.boards.map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("lengths", () => {
	it("parses and formats feet and inches", () => {
		expect(parseLengthIn(`9'6"`)).toBe(114);
		expect(parseLengthIn(`6'0`)).toBe(72);
		expect(parseLengthIn(`9'10"`)).toBe(118);
		expect(formatLengthIn(80)).toBe(`6'8"`);
		expect(formatInches(20.625)).toBe(`20 5/8"`);
		expect(formatInches(22.63)).toBe(`22 5/8"`);
		expect(formatInches(3)).toBe(`3"`);
		expect(formatInches(2.875)).toBe(`2 7/8"`);
	});
});

describe("size rule: closest to the calculators' median", () => {
	const resolved = resolveBoards(data, summary.consensus, summary.rows);

	it("reads the median from profile_summary.json", () => {
		expect(summary.consensus.median).toBeGreaterThan(30);
	});

	it("honors a size override only for a real size, with a reason", () => {
		for (const r of resolved.filter((x) => x.board.size_override)) {
			expect(r.size.length).toBe(r.board.size_override!.length);
			expect(r.board.size_override!.reason.length, r.board.id).toBeGreaterThan(10);
		}
	});

	it("picks the stock size nearest the median for each model without an override", () => {
		for (const r of resolved.filter((x) => !x.board.size_override)) {
			const median = summary.consensus.median!;
			const sizes = withVolumes(r.board, data.boards);
			for (const s of sizes) expect(Math.abs(r.size.volume_l - median)).toBeLessThanOrEqual(Math.abs(s.volume_l - median));
		}
	});

	it("prefers the shorter board on a tie", () => {
		const sizes = [
			{ length: `6'0"`, volume_l: 40 },
			{ length: `6'4"`, volume_l: 48 },
		];
		expect(pickNearestSize(sizes, 44).length).toBe(`6'0"`);
	});
});

describe("placement against the calculators", () => {
	const { consensus, rows } = summary;
	const n = rows.filter((r) => r.recommended_volume_point_l !== null).length;

	it("counts how many calculators recommend less", () => {
		const p = placeAgainstRange(consensus.median!, consensus, rows);
		expect(p.n).toBe(n);
		expect(p.vsMedianL).toBeCloseTo(0, 6);
		expect(p.band).toBe("middle");
	});

	it("says when a board holds more than every calculator recommends", () => {
		const p = placeAgainstRange(consensus.max! + 1, consensus, rows);
		expect(p.band).toBe("above-all");
		expect(p.nBelow).toBe(n);
		expect(p.sentence).toContain(`more than all ${n} calculators`);
	});

	it("says when a board holds less than every calculator recommends", () => {
		const p = placeAgainstRange(consensus.min! - 1, consensus, rows);
		expect(p.band).toBe("below-all");
		expect(p.nBelow).toBe(0);
	});
});

describe("volume estimate for sizes with no published liters", () => {
	const published = data.boards.flatMap((b) =>
		b.sizes
			.filter((s) => s.volume_status === "published")
			.map((s) => ({ model: b.id, lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in, liters: s.volume_l as number })),
	);
	// Foam soft-tops (matte finish) fill their bounding box far more than glassed boards (~0.70 of
	// L x W x T against ~0.55), so they're a design family of their own.
	const softTops = new Set(data.boards.filter((b) => b.finish === "matte").map((b) => b.id));
	const hard = published.filter((r) => !softTops.has(r.model));
	const soft = published.filter((r) => softTops.has(r.model));

	it("recovers each published size from the rest of its own model within 5% (11% for soft-tops)", () => {
		// Catch Surf's Odysea Log chart is the loose one: its 7'0" (same width and thickness as the
		// 6'0", 15 L more) is about 7% fuller than its siblings predict, its 9'0" about 10% leaner.
		for (const row of published) {
			const refs = published.filter((r) => r.model === row.model && r !== row);
			if (refs.length === 0) continue;
			const est = estimateVolumeL(row, refs);
			expect(Math.abs(est - row.liters) / row.liters, `${row.model} ${row.lengthIn}"`).toBeLessThan(softTops.has(row.model) ? 0.11 : 0.05);
		}
	});

	it("recovers each hard board from all the other models within 20% (the last-resort fallback)", () => {
		// The whole catalog, soft-tops included, is the fallback's reference set. A soft-top leaning
		// on it comes out 20-25% low, which is why an estimated model should name its design
		// family in volume_reference_models instead.
		for (const row of hard) {
			const refs = published.filter((r) => r.model !== row.model);
			const est = estimateVolumeL(row, refs);
			expect(Math.abs(est - row.liters) / row.liters, `${row.model} ${row.lengthIn}"`).toBeLessThan(0.2);
		}
	});

	it("does better among hard boards alone: within 15%", () => {
		for (const row of hard) {
			const refs = hard.filter((r) => r.model !== row.model);
			const est = estimateVolumeL(row, refs);
			expect(Math.abs(est - row.liters) / row.liters, `${row.model} ${row.lengthIn}"`).toBeLessThan(0.15);
		}
	});

	it("recovers each soft-top from the other soft-tops within 10%", () => {
		expect(new Set(soft.map((r) => r.model)).size).toBeGreaterThan(1);
		for (const row of soft) {
			const refs = soft.filter((r) => r.model !== row.model);
			const est = estimateVolumeL(row, refs);
			expect(Math.abs(est - row.liters) / row.liters, `${row.model} ${row.lengthIn}"`).toBeLessThan(0.1);
		}
	});

	it("estimates a model with no published sizes from its named design family", () => {
		for (const board of data.boards.filter((b) => b.volume_reference_models?.length)) {
			const family = published.filter((r) => board.volume_reference_models!.includes(r.model));
			expect(family.length, board.id).toBeGreaterThan(0);
			for (const size of withVolumes(board, data.boards)) {
				if (board.sizes.find((s) => s.length === size.length)?.volume_status !== "estimated") continue;
				const dims = { lengthIn: parseLengthIn(size.length), widthIn: size.width_in, thicknessIn: size.thickness_in };
				expect(size.volume_status).toBe("estimated");
				expect(size.volume_l).toBeCloseTo(estimateVolumeL(dims, family), 6);
			}
		}
	});

	it("recovers each model from its closest family member within 10% (the Sting and the Pipeliner's case)", () => {
		// The '76 Sting's two sizes predict each other, the same family step the Pipeliner relies on.
		const sting = published.filter((r) => r.model === "aipa-76-sting");
		for (const row of sting) {
			const est = estimateVolumeL(row, sting.filter((r) => r !== row));
			expect(Math.abs(est - row.liters) / row.liters).toBeLessThan(0.1);
		}
	});

	it("is used only where no volume is published, and marks the result estimated", () => {
		const board = {
			...data.boards[1],
			sizes: [...data.boards[1].sizes, { length: `7'0"`, width_in: 21.25, thickness_in: 3.06, volume_l: null, volume_status: "estimated" as const, source: 0 }],
		};
		const sizes = withVolumes(board, data.boards);
		const added = sizes[sizes.length - 1];
		expect(added.volume_status).toBe("estimated");
		expect(added.volume_l).toBeGreaterThan(43.3);
		expect(sizes.slice(0, -1).every((s) => s.volume_status === "published")).toBe(true);
	});
});
