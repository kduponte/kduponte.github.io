// Just enough of the ZIP and XLSX formats to read CDFW's shark workbook (a ZIP holding an XLSX,
// itself a ZIP of XML) without adding a dependency.
import { inflateRawSync } from "node:zlib";

/** The named entries of a ZIP archive, read through its central directory. */
export function readZip(buf: Buffer): Map<string, Buffer> {
	// End of central directory: the last "PK\x05\x06".
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("not a ZIP archive");
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	const out = new Map<string, Buffer>();
	for (let n = 0; n < count; n++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
		const method = buf.readUInt16LE(p + 10);
		const compressed = buf.readUInt32LE(p + 20);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const local = buf.readUInt32LE(p + 42);
		const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		const data = buf.subarray(start, start + compressed);
		out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
		p += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

const unescapeXml = (s: string) =>
	s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&amp;/g, "&");

/** Rows of one worksheet of an XLSX, as strings (shared strings resolved; numbers as written). */
export function xlsxRows(xlsx: Map<string, Buffer>, sheetPath = "xl/worksheets/sheet1.xml"): (string | null)[][] {
	const shared = [...(xlsx.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
		unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
	);
	const sheet = xlsx.get(sheetPath)?.toString("utf8");
	if (!sheet) throw new Error(`no ${sheetPath}`);
	const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
	return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
		const cells: (string | null)[] = [];
		for (const c of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const [, ref, attrs, inner = ""] = c;
			const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
			const inline = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
			cells[colIndex(ref)] = attrs.includes('t="s"') && v !== undefined ? shared[Number(v)] : inline !== undefined ? unescapeXml(inline) : v !== undefined ? unescapeXml(v) : null;
		}
		return Array.from(cells, (x) => x ?? null);
	});
}
