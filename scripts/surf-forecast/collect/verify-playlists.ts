// Confirms every Spotify playlist the toy links to actually resolves, and records what it was
// called at the time.
//
// This exists because a playlist is third-party mutable state: anyone can delete one or flip it to
// private, and a dead embed on the page would be a broken promise rather than a joke. Hard rule
// for this project: no playlist ID ships without a fetch confirming it, and no ID is written from
// memory without being checked.
//
// Uses Spotify's public oEmbed endpoint rather than scraping the playlist page. Scraping turned
// out to depend on User-Agent sniffing: a current Chrome UA gets the client-rendered shell with no
// metadata in it, while an unrecognised UA gets a server-rendered page with Open Graph tags. That
// is exactly the kind of accidental dependency that breaks silently later. oEmbed is a documented,
// unauthenticated endpoint that returns the title as JSON, and a nonexistent ID fails outright
// rather than returning a plausible-looking page.
//
// Writes straight to public/data rather than through data/raw and a normalize step, because the
// verified record is already the publishable form: there is nothing to normalize and nothing to
// recompute from it.
//
// Run: npx tsx scripts/surf-forecast/collect/verify-playlists.ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const OUT = "public/data/surf-forecast/playlists.json";

interface Candidate {
	tier: "junk" | "fun" | "firing";
	id: string;
	/** Why this playlist belongs to this verdict. Shown on the page. */
	rationale: string;
}

const CANDIDATES: Candidate[] = [
	{
		tier: "junk",
		id: "37i9dQZF1DX76Wlfdnj7AP",
		rationale: "The ocean is not giving you a workout today, so go get one somewhere else.",
	},
	{
		tier: "fun",
		id: "37i9dQZF1DXbSbnqxMTGx9",
		rationale: "Chest high and clean is reggae weather. This is not negotiable.",
	},
	{
		tier: "firing",
		id: "37i9dQZF1DWWJOmJ7nRx0C",
		rationale: "For the drive over, while you talk yourself into it.",
	},
];

interface OEmbed {
	title?: string;
	thumbnail_url?: string;
	provider_name?: string;
}

export interface VerifiedPlaylist {
	tier: string;
	id: string;
	name: string;
	url: string;
	embed_url: string;
	rationale: string;
}

async function verify(c: Candidate): Promise<VerifiedPlaylist> {
	const url = `https://open.spotify.com/playlist/${c.id}`;
	const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
		headers: { "User-Agent": UA },
	});
	if (!res.ok) throw new Error(`${c.id} failed oEmbed lookup with HTTP ${res.status}`);

	const body = (await res.json()) as OEmbed;
	const name = body.title?.trim();
	if (!name) throw new Error(`${c.id} resolved but returned no title, so it is not a live playlist`);

	return { tier: c.tier, id: c.id, name, url, embed_url: `https://open.spotify.com/embed/playlist/${c.id}`, rationale: c.rationale };
}

async function main(): Promise<void> {
	const verified: VerifiedPlaylist[] = [];
	for (const c of CANDIDATES) {
		const v = await verify(c);
		console.log(`  ok  ${v.tier.padEnd(7)} ${v.id}  ${v.name}`);
		verified.push(v);
		await new Promise((r) => setTimeout(r, 400));
	}

	const payload = {
		verified_at: new Date().toISOString(),
		note: "Titles captured at verification time via Spotify's public oEmbed endpoint. These are third-party playlists that can be renamed, made private or deleted at any time, so the page loads each player only on click and must survive an embed that never loads.",
		playlists: verified,
	};

	await mkdir(dirname(OUT), { recursive: true });
	await writeFile(OUT, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
	console.log(`\nWrote ${OUT} with ${verified.length} verified playlists.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Playlist verification failed:", err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
