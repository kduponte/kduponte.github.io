// Client controller for the Volume Gap's board rack (BoardRackSection.astro). Picking a board,
// the dimension sliders, the volume estimate and the fit verdict all live here; the 3D rack
// (surfboard-rack.ts) only listens for "surfrack:select" / "surfrack:dims" and reports taps.
import { clampDims, estimateForDims, FIT_HEADLINES, nearestStockSize, specRanges, type Dims, type ModelSpecRanges } from "../../lib/surf-volume/board-rack";
import { computeComparison } from "../../lib/surf-volume/compare";
import { formatInches, formatLengthIn, parseLengthIn, placeAgainstRange, type IconicBoard, type IconicBoardData } from "../../lib/surf-volume/iconic-boards";
import type { ComparisonResult, Skill } from "../../lib/surf-volume/types";
import type { RackDimsDetail } from "../three/subjects/surfboard-rack";
import { loadSurfVolumeData } from "./data-client";
import { onProfileChange } from "./state";

type Key = "length" | "width" | "thickness";
const FIELD: Record<Key, keyof Dims> = { length: "lengthIn", width: "widthIn", thickness: "thicknessIn" };
/** Slider steps: whole inches of length, eighths of width, sixteenths of thickness. */
const STEP: Record<Key, number> = { length: 1, width: 1 / 8, thickness: 1 / 16 };
const BAR_W = 300;

let iconic: Promise<IconicBoardData> | null = null;
const loadIconic = () => (iconic ??= fetch("/data/surf-volume/iconic_boards.json").then((r) => r.json() as Promise<IconicBoardData>));

/** Inches to the nearest sixteenth, e.g. 2 11/16". */
function formatSixteenths(v: number): string {
	const whole = Math.floor(v + 1e-9);
	let n = Math.round((v - whole) * 16);
	if (n === 16) return `${whole + 1}"`;
	if (n === 0) return `${whole}"`;
	let d = 16;
	while (n % 2 === 0) {
		n /= 2;
		d /= 2;
	}
	return `${whole} ${n}/${d}"`;
}
const FORMAT: Record<Key, (v: number) => string> = { length: formatLengthIn, width: formatInches, thickness: formatSixteenths };

const dimsLine = (d: Dims) => `${formatLengthIn(d.lengthIn)} × ${formatInches(d.widthIn)} × ${formatSixteenths(d.thicknessIn)}`;

export async function initBoardRack(root: HTMLElement) {
	const host = root.querySelector<HTMLElement>("[data-volume-rack-viewer]")!;
	const panel = root.querySelector<HTMLElement>("[data-rack-panel]")!;
	const hint = root.querySelector<HTMLElement>("[data-rack-hint]")!;
	const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
	const picks = [...root.querySelectorAll<HTMLButtonElement>("[data-rack-pick]")];
	const sliders = Object.fromEntries((["length", "width", "thickness"] as Key[]).map((k) => [k, q<HTMLInputElement>(`[data-p-slider="${k}"]`)])) as Record<Key, HTMLInputElement>;
	const outs = Object.fromEntries((["length", "width", "thickness"] as Key[]).map((k) => [k, q<HTMLOutputElement>(`[data-p-out="${k}"]`)])) as Record<Key, HTMLOutputElement>;
	const weight = q<HTMLInputElement>("[data-p-weight]");
	const skill = q<HTMLSelectElement>("[data-p-skill]");
	const bar = root.querySelector<SVGSVGElement>("[data-p-bar]")!;

	const [data, { observations, sources, defaultProfile }] = await Promise.all([loadIconic(), loadSurfVolumeData()]);
	const byId = new Map(data.boards.map((b) => [b.id, b]));
	const startSize = new Map((JSON.parse(root.dataset.order ?? "[]") as { id: string; start: string }[]).map((o) => [o.id, o.start]));

	let board: IconicBoard | null = null;
	let ranges: ModelSpecRanges | null = null;
	let dims: Dims | null = null;
	let fit: ComparisonResult = computeComparison(defaultProfile, observations, sources);
	weight.value = String(defaultProfile.weight_lb);
	skill.value = defaultProfile.skill;

	const stockDims = (b: IconicBoard): Dims => {
		const len = startSize.get(b.id);
		const s = b.sizes.find((x) => x.length === len) ?? b.sizes[0];
		return { lengthIn: parseLengthIn(s.length), widthIn: s.width_in, thicknessIn: s.thickness_in };
	};

	let frame = 0;
	let pendingFinal = false;
	const sendDims = (final: boolean) => {
		pendingFinal ||= final;
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			if (!board || !dims) return;
			const detail: RackDimsDetail = { id: board.id, ...dims, liters: estimateForDims(board, data.boards, dims).liters, final: pendingFinal };
			pendingFinal = false;
			host.dispatchEvent(new CustomEvent("surfrack:dims", { detail }));
		});
	};

	const drawBar = (liters: number) => {
		const points = fit.rows.map((r) => r.recommended_volume_point_l).filter((v): v is number => v !== null);
		const c = fit.consensus;
		if (c.min === null || c.max === null || c.q25 === null || c.q75 === null || c.median === null) {
			bar.innerHTML = "";
			return;
		}
		const lo = Math.floor((Math.min(c.min, liters) - 3) / 10) * 10;
		const hi = Math.ceil((Math.max(c.max, liters) + 3) / 10) * 10;
		const X = (l: number) => (((l - lo) / (hi - lo)) * BAR_W).toFixed(1);
		const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
		bar.innerHTML = `
			<line x1="${X(c.min)}" x2="${X(c.max)}" y1="26" y2="26" stroke="#111" stroke-width="2" />
			<rect x="${X(c.q25)}" y="17" width="${(Number(X(c.q75)) - Number(X(c.q25))).toFixed(1)}" height="18" fill="#c8ff3d" stroke="#111" stroke-width="2.5" />
			<line x1="${X(c.median)}" x2="${X(c.median)}" y1="14" y2="38" stroke="#111" stroke-width="3" />
			${points.map((p) => `<circle cx="${X(p)}" cy="46" r="2.6" fill="#111" />`).join("")}
			<line x1="0" x2="${BAR_W}" y1="54" y2="54" stroke="#111" stroke-width="1.5" />
			${ticks.map((t) => `<line x1="${X(t)}" x2="${X(t)}" y1="54" y2="58" stroke="#111" stroke-width="1.5" /><text x="${X(t)}" y="67" text-anchor="middle" font-size="8" font-family="Silkscreen, monospace">${t}</text>`).join("")}
			<g transform="translate(${X(liters)} 0)">
				<line x1="0" x2="0" y1="8" y2="50" stroke="#ff5a1f" stroke-width="3" />
				<path d="M-6 2 L6 2 L0 10 Z" fill="#ff5a1f" stroke="#111" stroke-width="1.5" stroke-linejoin="round" />
			</g>`;
	};

	const render = () => {
		if (!board || !dims || !ranges) return;
		const est = estimateForDims(board, data.boards, dims);
		q("[data-p-liters]").textContent = est.liters.toFixed(1);
		q("[data-p-dims]").textContent = dimsLine(dims);
		q("[data-p-method]").textContent =
			est.method === "stock"
				? `${est.basis} volume at this stock size`
				: `≈ estimated: L × W × T × ${est.boxFill.toFixed(3)} box fill (median of ${est.nRefs} ${est.basis === "published" ? "published" : "estimated"} sizes)`;
		for (const k of Object.keys(sliders) as Key[]) outs[k].textContent = FORMAT[k](dims[FIELD[k]]);
		const near = nearestStockSize(board, data.boards, dims);
		const nearDims: Dims = { lengthIn: parseLengthIn(near.length), widthIn: near.width_in, thicknessIn: near.thickness_in };
		q("[data-p-nearest]").textContent = `${dimsLine(nearDims)} · ${near.volume_l.toFixed(1)} L (${near.volume_status})`;
		q("[data-p-snap]").hidden = est.method === "stock";

		const place = placeAgainstRange(est.liters, fit.consensus, fit.rows);
		q("[data-p-headline]").textContent = FIT_HEADLINES[place.band];
		q("[data-p-headline]").dataset.band = place.band;
		q("[data-p-sentence]").textContent = `For a ${fit.profile.weight_lb} lb ${fit.profile.skill} surfer, ${est.liters.toFixed(1)} L is ${place.sentence}.`;
		drawBar(est.liters);
	};

	const setDims = (next: Dims, final: boolean) => {
		if (!ranges) return;
		dims = clampDims(next, ranges);
		for (const k of Object.keys(sliders) as Key[]) sliders[k].value = String(dims[FIELD[k]]);
		render();
		sendDims(final);
	};

	const show = (id: string | null, fromViewer: boolean) => {
		board = id ? (byId.get(id) ?? null) : null;
		for (const p of picks) p.setAttribute("aria-pressed", String(p.dataset.rackPick === id));
		if (!fromViewer) host.dispatchEvent(new CustomEvent("surfrack:select", { detail: { id } }));
		panel.hidden = !board;
		hint.hidden = !!board;
		if (!board) return;
		ranges = specRanges(board);
		q("[data-p-eyebrow]").textContent = `${board.style} · ${ranges.nSizes === 1 ? "1 size on record" : `${ranges.nSizes} stock sizes`}`;
		q("[data-p-name]").textContent = board.name;
		q("[data-p-maker]").textContent = `${board.maker} · ${board.fin_setup.model}`;
		const single = ranges.nSizes === 1;
		const one = q("[data-p-onesize]");
		one.hidden = !single;
		one.textContent = single ? `Only one ${board.name} size is on record here, so there is nothing to stretch.` : "";
		for (const k of Object.keys(sliders) as Key[]) {
			const r = ranges[k];
			const s = sliders[k];
			s.min = String(r.min);
			s.max = String(r.max);
			s.disabled = r.min === r.max;
			q(`[data-p-min="${k}"]`).textContent = FORMAT[k](r.min);
			q(`[data-p-max="${k}"]`).textContent = FORMAT[k](r.max);
		}
		dims = stockDims(board);
		for (const k of Object.keys(sliders) as Key[]) sliders[k].value = String(dims[FIELD[k]]);
		render();
	};

	for (const k of Object.keys(sliders) as Key[]) {
		const s = sliders[k];
		const read = (): Dims => {
			const step = STEP[k];
			const r = ranges![k];
			// Quantize to the step from the range's start, but let the ends be reached exactly.
			const v = Number(s.value);
			const snapped = Math.min(r.max, Math.max(r.min, r.min + Math.round((v - r.min) / step) * step));
			return { ...dims!, [FIELD[k]]: v >= r.max - step / 2 ? r.max : snapped };
		};
		s.addEventListener("input", () => dims && setDims(read(), false));
		s.addEventListener("change", () => dims && setDims(read(), true));
	}

	q("[data-p-snap]").addEventListener("click", () => {
		if (!board || !dims) return;
		const near = nearestStockSize(board, data.boards, dims);
		setDims({ lengthIn: parseLengthIn(near.length), widthIn: near.width_in, thicknessIn: near.thickness_in }, true);
	});
	q("[data-p-back]").addEventListener("click", () => show(null, false));
	for (const p of picks) p.addEventListener("click", () => show(p.dataset.rackPick === board?.id ? null : p.dataset.rackPick!, false));
	host.addEventListener("surfrack:selected", (e) => show((e as CustomEvent<{ id: string | null }>).detail.id, true));
	host.addEventListener("surfrack:hover", (e) => {
		const id = (e as CustomEvent<{ id: string | null }>).detail.id;
		for (const p of picks) p.toggleAttribute("data-hover", p.dataset.rackPick === id);
	});

	const recompute = () => {
		const w = Math.min(280, Math.max(100, Number(weight.value) || defaultProfile.weight_lb));
		fit = computeComparison({ ...defaultProfile, weight_lb: w, skill: skill.value as Skill }, observations, sources);
		render();
	};
	weight.addEventListener("input", recompute);
	skill.addEventListener("change", recompute);
	// Follow the profile form at the top of the page whenever the reader changes it.
	onProfileChange((result) => {
		fit = result;
		weight.value = String(result.profile.weight_lb);
		skill.value = result.profile.skill;
		render();
	});
}
