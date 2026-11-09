// Renders public/og-image.png and public/favicon.ico from the site's own fonts and palette.
// Run: node scripts/og/build-og.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const font = (p) => pathToFileURL(new URL(`node_modules/${p}`, root).pathname).href;

const html = `<!doctype html><html><head><style>
@font-face{font-family:Anton;src:url(${font("@fontsource/anton/files/anton-latin-400-normal.woff2")})}
@font-face{font-family:Bricolage;font-weight:200 800;src:url(${font("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2")})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#2438ff;position:relative;overflow:hidden;font-family:Bricolage}
.dots{position:absolute;inset:0;background:radial-gradient(circle,#ff5a1f 32%,transparent 34%) 0 0/18px 18px;opacity:.4}
h1{position:absolute;left:60px;top:30px;font-family:Anton;font-weight:400;text-transform:uppercase;font-size:215px;line-height:.92;color:#c8ff3d;text-shadow:8px 8px 0 #111;-webkit-text-stroke:3px #111}
.box{position:absolute;left:60px;bottom:50px;width:700px;background:#f6f1e4;border:4px solid #111;border-radius:22px;box-shadow:8px 8px 0 #111;padding:22px 28px;font-size:34px;font-weight:700;line-height:1.15}
.st{position:absolute;right:70px;bottom:60px;width:210px;height:210px;border-radius:50%;background:#ff7ac8;border:4px solid #111;box-shadow:8px 8px 0 #111;display:grid;place-items:center;text-align:center;font-weight:800;font-size:34px;line-height:1.1;transform:rotate(12deg)}
</style></head><body><div class="dots"></div><h1>Kyle<br>DuPonte</h1>
<div class="box">Staff Data Scientist at Intuit. Experimentation &amp; causal inference.</div>
<div class="st">10+<br>years in<br>FinTech</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// File URLs for fonts only load from a file: page, not about:blank.
const htmlPath = join(tmpdir(), "kd-og.html");
writeFileSync(htmlPath, html);
await page.goto(pathToFileURL(htmlPath).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("public/og-image.png", root).pathname });

// favicon.ico: a 48px PNG wrapped in an ICO container.
const svg = readFileSync(new URL("public/favicon.svg", root), "utf8");
const icon = await browser.newPage({ viewport: { width: 48, height: 48 } });
await icon.setContent(`<body style="margin:0">${svg.replace("<svg ", '<svg width="48" height="48" ')}</body>`);
const png = await icon.screenshot({ omitBackground: true });
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 48; header[7] = 48; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(new URL("public/favicon.ico", root).pathname, Buffer.concat([header, png]));
await browser.close();
