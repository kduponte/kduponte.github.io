// Renders public/og-image.png, the 1200 × 630 card LinkedIn and others show when the site is
// shared. It matches the site: the Signal pair (safety orange ripple on graphite, like the
// favicon), the name in Anton, and the hero's white card, using the site's own fonts and ripple
// generator. The favicon has its own script (scripts/icons/build-favicon.mjs).
// Run: npm run og:build
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BLUR_PER_GAP, dropPaths } from "../../src/lib/patterns/ripples";

const root = new URL("../../", import.meta.url);
const font = (p: string) => pathToFileURL(new URL(`node_modules/${p}`, root).pathname).href;

const GROUND = "#2b2d30"; // Signal graphite
const RING = "#ff5b1f"; // Signal safety orange
const INK = "#111111";
const DARK_INK = "#f5f5f3";

// One organic drop, drawn the way Ripples.astro draws it: strokes melted by blur, then threshold.
const GAP = 42;
const ripple = dropPaths({ seed: 1991, rings: 10, gap: GAP })
	.map((p) => (p.fill ? `<path d="${p.d}" fill="currentColor" stroke="none"/>` : `<path d="${p.d}" stroke-width="${p.width}"/>`))
	.join("");
const blur = Math.round(GAP * BLUR_PER_GAP * 10) / 10;
const rippleSvg = `<svg viewBox="0 0 1000 1000" width="100%" height="100%" aria-hidden="true"><defs><filter id="goo" filterUnits="userSpaceOnUse" x="-60" y="-60" width="1120" height="1120" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/><feComponentTransfer result="t"><feFuncA type="linear" slope="22" intercept="-9.9"/></feComponentTransfer><feFlood flood-color="${RING}"/><feComposite in2="t" operator="in"/></filter></defs><g filter="url(#goo)" fill="none" stroke="${RING}" color="${RING}" stroke-linecap="round">${ripple}</g></svg>`;

const grain =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.25 -0.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const html = `<!doctype html><html><head><style>
@font-face{font-family:Anton;src:url(${font("@fontsource/anton/files/anton-latin-400-normal.woff2")})}
@font-face{font-family:Bricolage;font-weight:200 800;src:url(${font("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2")})}
@font-face{font-family:Silkscreen;src:url(${font("@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2")})}
@font-face{font-family:Instrument;font-style:italic;src:url(${font("@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2")})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:${GROUND};color:${DARK_INK};position:relative;overflow:hidden;font-family:Bricolage}
.ripple{position:absolute;left:585px;top:-90px;width:810px;height:810px}
.grain{position:absolute;inset:0;background-image:${grain};background-size:180px 180px;opacity:.12}
h1{position:absolute;left:60px;top:36px;font-family:Anton;font-weight:400;text-transform:uppercase;font-size:190px;line-height:.86;letter-spacing:.005em}
.card{position:absolute;left:60px;bottom:56px;width:640px;background:#fff;color:${INK};border:4px solid ${INK};border-radius:22px;padding:22px 28px 24px;font-size:31px;font-weight:700;line-height:1.2}
.card i{font-family:Instrument;font-style:italic;font-weight:400;background:#f0f0ef;padding:0 .12em;border-radius:.12em}
.row{display:flex;align-items:center;gap:12px;margin-top:18px}
.chip{white-space:nowrap;font-family:Silkscreen;font-size:15px;text-transform:uppercase;letter-spacing:.05em;padding:6px 14px;border:2.5px solid ${INK};border-radius:999px}
.url{margin-left:auto;font-size:21px;font-weight:700;padding:10px 18px;border:3px solid ${INK};border-radius:999px;background:${RING};color:${INK};box-shadow:3px 3px 0 ${INK}}
.st{position:absolute;right:64px;bottom:62px;width:170px;height:170px;border-radius:50%;border:4px solid ${DARK_INK};background:${GROUND};display:grid;place-items:center;text-align:center;font-family:Anton;text-transform:uppercase;font-size:27px;line-height:1;transform:rotate(12deg)}
</style></head><body>
<div class="ripple">${rippleSvg}</div><div class="grain"></div>
<h1>Kyle<br>DuPonte</h1>
<div class="card">Staff Data Scientist at Intuit. <i>Experimentation</i> &amp; causal inference.
<div class="row"><span class="chip">SF Bay Area</span><span class="url">kyleduponte.com</span></div></div>
<div class="st">10+<br>years in<br>FinTech</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// File URLs for fonts only load from a file: page, not about:blank.
const htmlPath = join(tmpdir(), "kd-og.html");
writeFileSync(htmlPath, html);
await page.goto(pathToFileURL(htmlPath).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("public/og-image.png", root).pathname });
await browser.close();
console.log("Wrote public/og-image.png");
