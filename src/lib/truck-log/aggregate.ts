// Pure aggregation over build-log entries — total cost, total hours, cost by system, chronological
// order. Simple arithmetic, but tested rather than trusted, same discipline as everything else in
// this repo that ends up on a public page.

export interface TruckLogEntry {
	date: Date;
	title: string;
	system: string;
	parts: { name: string; cost: number }[];
	hours: number;
	people: string[];
}

export function entryCost(entry: TruckLogEntry): number {
	return entry.parts.reduce((sum, part) => sum + part.cost, 0);
}

export function totalCost(entries: TruckLogEntry[]): number {
	return entries.reduce((sum, entry) => sum + entryCost(entry), 0);
}

export function totalHours(entries: TruckLogEntry[]): number {
	return entries.reduce((sum, entry) => sum + entry.hours, 0);
}

export interface SystemCost {
	system: string;
	cost: number;
}

/** Cost grouped by system, sorted descending; systems with $0 spent so far are omitted. */
export function costBySystem(entries: TruckLogEntry[]): SystemCost[] {
	const costs = new Map<string, number>();
	for (const entry of entries) {
		const cost = entryCost(entry);
		costs.set(entry.system, (costs.get(entry.system) ?? 0) + cost);
	}
	return [...costs.entries()]
		.filter(([, cost]) => cost > 0)
		.map(([system, cost]) => ({ system, cost }))
		.sort((a, b) => b.cost - a.cost);
}

export function chronological(entries: TruckLogEntry[]): TruckLogEntry[] {
	return [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
}
