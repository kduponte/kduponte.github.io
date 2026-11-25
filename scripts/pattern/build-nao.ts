/**
 * Builds Nao's print files, one set per colorway (src/lib/patterns/nao-colorways.ts).
 *
 * Writes, for each colorway:
 *   public/patterns/nao/<id>.svg            the full 54 x 36 in width (two repeats, half-drop), for
 *                                            the web page; it tiles straight in both directions
 *   exports/pattern/nao-<id>-repeat-<dpi>dpi.png   one 27 x 36 in repeat at print resolution, DPI in
 *                                            the file. Set it as a half-drop repeat (drop 18 in).
 *   exports/pattern/nao-<id>-full-<dpi>dpi.png     the 54 x 36 in width, for printers that only set
 *                                            straight repeats (with --full)
 * and the tee's placed prints, in the tee colorway:
 *   exports/pattern/tee-back-panel-<id>-<dpi>dpi.png   the 14 x 10.5 in back panel (landscape), composed
 *                                            for its rectangle rather than cropped from the cloth
 *
 * exports/ is ignored by git: the PNGs are large and come back from this script exactly.
 *
 * Run: npm run pattern:build [-- --dpi=300 --only=night,moss --full]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { fullWidth, makeNao, naoPanel, naoSvg, NAO_SEED, REPEAT_IN, type Nao, type Region } from "../../src/lib/patterns/nao";
import { NAO_COLORWAYS, NAO_SHOWN, colorway } from "../../src/lib/patterns/nao-colorways";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const DPI = Number(args.dpi ?? 300);
const only = args.only ? new Set(String(args.only).split(",")) : null;
const FULL = args.full === "true";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const webDir = root("public/patterns/nao");
const outDir = root("exports/pattern");
mkdirSync(webDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const nao = makeNao(NAO_SEED);
const pxPerUnit = (DPI * nao.settings.printIn) / 1000;

// The SVG renderer cuts the blur off at the edge of its canvas, which would leave a thin seam
// around every repeat. Draw a margin of cloth around the region and crop it away.
const MARGIN = 160; // site units
async function png(n: Nao, region: Region, ground: string, ink: string, file: string) {
	const [x0, y0, x1, y1] = region;
	const svg = naoSvg(n, { ground, ink, region: [x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN], scale: pxPerUnit, prefix: "p" });
	const m = Math.round(MARGIN * pxPerUnit);
	const width = Math.round((x1 - x0) * pxPerUnit);
	const height = Math.round((y1 - y0) * pxPerUnit);
	await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true })
		.extract({ left: m, top: m, width, height })
		.withMetadata({ density: DPI })
		.png({ compressionLevel: 9 })
		.toFile(file);
	return `${width} x ${height} px`;
}

const started = Date.now();
for (const c of NAO_COLORWAYS) {
	if (only && !only.has(c.id)) continue;
	writeFileSync(`${webDir}/${c.id}.svg`, `${naoSvg(nao, { ground: c.ground, ink: c.ink, prefix: `nao-${c.id}` })}\n`);
	const size = await png(nao, [0, 0, nao.W, nao.H], c.ground, c.ink, `${outDir}/nao-${c.id}-repeat-${DPI}dpi.png`);
	console.log(`${c.name}: ${c.id}.svg, repeat ${REPEAT_IN.w} x ${REPEAT_IN.h} in = ${size}`);
	if (FULL) await png(nao, fullWidth(nao), c.ground, c.ink, `${outDir}/nao-${c.id}-full-${DPI}dpi.png`);
}
const tee = colorway(NAO_SHOWN.tee);
if (!only || only.has(tee.id)) {
	const panel = naoPanel(14, 10.5);
	const size = await png(panel.nao, panel.region, tee.ground, tee.ink, `${outDir}/tee-back-panel-${tee.id}-${DPI}dpi.png`);
	console.log(`Tee back panel (${tee.name}): 14 x 10.5 in = ${size}`);
}
console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s at ${DPI} DPI.`);
