/**
 * Builds the site icons from one drawing: a ripple in the Signal season pair (safety orange on
 * graphite), drawn like the site's ripples. Rounded arc strokes of mixed weight (a center drop, a
 * whole ring that swells and thins, a ring of long dashes that taper and melt together, and an
 * outer ring breaking into oblong dashes and dots) run through a blur-then-threshold filter.
 *
 * Writes public/favicon.svg, public/favicon.ico (16, 32, 48), public/apple-touch-icon.png (180) and
 * public/ripple-mark.svg (the ripple alone, on no background, for the footer).
 * Run: node scripts/icons/build-favicon.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const GROUND = "#2b2d30"; // Signal graphite
const RING = "#ff5b1f"; // Signal safety orange
const C = 32; // center of the 64 × 64 box

const r2 = (v) => Math.round(v * 100) / 100;

/** A rounded arc stroke from angle a0 to a1 (degrees) at radius r; a dot when a0 === a1. */
function arc(r, a0, a1, w) {
	const t0 = (a0 * Math.PI) / 180;
	const t1 = (a1 * Math.PI) / 180;
	const x0 = r2(C + r * Math.cos(t0));
	const y0 = r2(C + r * Math.sin(t0));
	if (a0 === a1) return `<path d="M${x0} ${y0}h.01" stroke-width="${w}"/>`;
	const x1 = r2(C + r * Math.cos(t1));
	const y1 = r2(C + r * Math.sin(t1));
	return `<path d="M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}" stroke-width="${w}"/>`;
}

function ripple() {
	const out = [];
	// Center drop, a touch squashed.
	out.push(`<ellipse cx="${C}" cy="${C}" rx="5.4" ry="4.9" fill="currentColor" stroke="none"/>`);
	// Ring 1: whole, built from overlapping arcs of different weight, so it swells and thins.
	[
		[0, 100, 4.9, 12.2],
		[90, 190, 3.6, 12.7],
		[180, 280, 4.6, 11.9],
		[270, 365, 3.3, 12.4],
	].forEach(([a, b, w, r]) => out.push(arc(r, a, b, w)));
	// Ring 2: long dashes; two nearly touch, so they melt together with a pinch.
	[
		[-160, -52, 4.1, 20.1],
		[-47, 40, 3.4, 19.5],
		[58, 120, 3.9, 19.8],
	].forEach(([a, b, w, r]) => out.push(arc(r, a, b, w)));
	// ...and one dash that tapers to a point.
	[
		[124, 150, 3.2],
		[148, 166, 2.4],
		[164, 176, 1.6],
	].forEach(([a, b, w]) => out.push(arc(19.9, a, b, w)));
	// Ring 3: oblong dashes and dots of mixed size, thinning, plus one blob.
	[
		[-172, -136, 3.1, 27],
		[-120, -104, 2.8, 27.6],
		[-86, -58, 3.2, 26.6],
		[-40, -40, 3.4, 27.3],
		[-20, 14, 2.7, 27],
		[34, 50, 2.6, 26.5],
		[70, 104, 3.0, 27.4],
		[122, 122, 2.4, 27.7],
		[138, 160, 2.8, 26.7],
		[-76, -70, 4.4, 26.6],
	].forEach(([a, b, w, r]) => out.push(arc(r, a, b, w)));
	// Corner dots, where the ripple has nearly died out; the smallest melt away in the filter.
	[
		[-135, 35.5, 3.0],
		[-48, 37, 2.7],
		[44, 35.5, 3.1],
		[137, 36.5, 2.6],
		[-62, 33.8, 2.4],
		[30, 37.6, 2.2],
	].forEach(([a, r, w]) => out.push(arc(r, a, a, w)));
	return out.join("");
}

/** The icon. `rounded` gives the tab icon its rounded corners; the Apple touch icon is square,
 * because iOS rounds it itself. `ground: false` leaves out the graphite square, so the ripple sits
 * straight on whatever is behind it. */
function icon({ rounded = true, ground = true } = {}) {
	const rx = rounded ? 14 : 0;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
		`<defs>`,
		`<clipPath id="c"><rect width="64" height="64" rx="${rx}"/></clipPath>`,
		// Blur, then keep only what is dense enough, then paint that shape in the ring color.
		`<filter id="goo" filterUnits="userSpaceOnUse" x="0" y="0" width="64" height="64" color-interpolation-filters="sRGB">`,
		`<feGaussianBlur stdDeviation="1.15"/>`,
		`<feComponentTransfer result="t"><feFuncA type="linear" slope="22" intercept="-9.9"/></feComponentTransfer>`,
		`<feFlood flood-color="${RING}"/><feComposite in2="t" operator="in"/>`,
		`</filter>`,
		`</defs>`,
		ground ? `<rect width="64" height="64" rx="${rx}" fill="${GROUND}"/>` : "",
		`<g clip-path="url(#c)"><g filter="url(#goo)" fill="none" stroke="${RING}" color="${RING}" stroke-linecap="round">${ripple()}</g></g>`,
		`</svg>`,
	].join("");
}

/** An .ico holding PNG images (supported by every current browser). */
function ico(pngs) {
	const head = Buffer.alloc(6);
	head.writeUInt16LE(0, 0);
	head.writeUInt16LE(1, 2);
	head.writeUInt16LE(pngs.length, 4);
	const dir = Buffer.alloc(16 * pngs.length);
	let offset = 6 + 16 * pngs.length;
	pngs.forEach(({ size, data }, i) => {
		const b = i * 16;
		dir.writeUInt8(size, b);
		dir.writeUInt8(size, b + 1);
		dir.writeUInt16LE(1, b + 4);
		dir.writeUInt16LE(32, b + 6);
		dir.writeUInt32LE(data.length, b + 8);
		dir.writeUInt32LE(offset, b + 12);
		offset += data.length;
	});
	return Buffer.concat([head, dir, ...pngs.map((p) => p.data)]);
}

const pub = (name) => fileURLToPath(new URL(`../../public/${name}`, import.meta.url));
const raster = (svg, size) => sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png().toBuffer();

const tab = icon();
writeFileSync(pub("favicon.svg"), `${tab}\n`);
const pngs = [];
for (const size of [16, 32, 48]) pngs.push({ size, data: await raster(tab, size) });
writeFileSync(pub("favicon.ico"), ico(pngs));
writeFileSync(pub("apple-touch-icon.png"), await raster(icon({ rounded: false }), 180));
writeFileSync(pub("ripple-mark.svg"), `${icon({ rounded: false, ground: false })}\n`);
console.log("Wrote favicon.svg, favicon.ico, apple-touch-icon.png and ripple-mark.svg");
