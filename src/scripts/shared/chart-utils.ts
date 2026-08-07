// Shared plumbing for the "chart + accessible table alternative" pattern used by every
// Plot-rendered visualization in this project (brief §17, UI test requirement "charts have
// accessible labels or table alternatives" generalized to all charts, not just the heatmap).
export function wireTableToggle(root: ParentNode) {
	const toggle = root.querySelector<HTMLButtonElement>("[data-vg-table-toggle]");
	const chart = root.querySelector<HTMLElement>("[data-vg-chart]");
	const table = root.querySelector<HTMLElement>("[data-vg-table]");
	if (!toggle || !chart || !table) return;

	table.hidden = true;
	toggle.addEventListener("click", () => {
		const showingTable = !table.hidden;
		table.hidden = showingTable;
		chart.hidden = !showingTable;
		toggle.textContent = showingTable ? "View as table" : "View as chart";
		toggle.setAttribute("aria-pressed", String(!showingTable));
	});
}

export function formatL(value: number | null): string {
	return value === null ? "—" : `${value.toFixed(1)} L`;
}

export function capitalize(value: string): string {
	return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
