// Minimal CSV reader/writer — no dependency needed for this dataset's size/shape. Assumes
// well-formed CSV as produced by our own toCsv() (quoted fields with escaped internal quotes).
export function fromCsv(text: string): Record<string, string>[] {
	const lines = text.trim().split("\n");
	if (lines.length === 0) return [];
	const parseLine = (line: string): string[] => {
		const fields: string[] = [];
		let cur = "";
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (inQuotes) {
				if (ch === '"' && line[i + 1] === '"') {
					cur += '"';
					i++;
				} else if (ch === '"') {
					inQuotes = false;
				} else {
					cur += ch;
				}
			} else if (ch === '"') {
				inQuotes = true;
			} else if (ch === ",") {
				fields.push(cur);
				cur = "";
			} else {
				cur += ch;
			}
		}
		fields.push(cur);
		return fields;
	};
	const header = parseLine(lines[0]);
	return lines.slice(1).map((line) => {
		const values = parseLine(line);
		return Object.fromEntries(header.map((h, i) => [h, values[i] ?? ""]));
	});
}

export function toCsv<T extends object>(rows: T[], columns: (keyof T)[]): string {
	const escape = (value: unknown) => {
		if (value === null || value === undefined) return "";
		const str = String(value);
		return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
	};
	const header = columns.join(",");
	const body = rows.map((row) => columns.map((col) => escape(row[col])).join(","));
	return [header, ...body].join("\n") + "\n";
}
