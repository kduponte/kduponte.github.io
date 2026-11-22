/**
 * The catalog behind the 22RE truck builder. Every option is a real part, size or rule for a 1991
 * Toyota Pickup 2WD, with its numbers and where they come from, so the page can show both next to
 * the choice. No three.js here: the page, the URL encoding and the 3D builder all read it.
 */

export interface Source {
	label: string;
	href: string;
}

const SRC = {
	paint: { label: "PaintScratch, 1991 Toyota Truck colors", href: "https://www.paintscratch.com/touch_up_paint/Toyota/1991-Toyota-Truck.html" },
	belltech444: {
		label: "Belltech 444 listing (Summit Racing)",
		href: "https://www.summitracing.com/parts/bel-444sp",
	},
	belltech2000: {
		label: "Belltech 2000 drop spindles (Switch Suspension)",
		href: "https://switchsuspension.com/toyota-pickup-84-95-front-2-drop-spindles-belltech-part-2000/",
	},
	pa5503m: {
		label: "Performance Accessories PA5503M (Suspension Connection)",
		href: "https://www.suspensionconnection.com/5503m",
	},
	stockWheel: { label: "ThreePiece fitment, 1989 Toyota Pickup 2WD", href: "https://vehicles.threepiece.us/vehicles/toyota/pickup/1989/dlx-rwd/" },
	enkei92: { label: "Enkei92 15x7 5x114.3 +38, part 465-570-6538 (MAPerformance)", href: "https://www.maperformance.com/products/enkei-enkei92-5x114-3-15-wheels-in-gold-with-a-machined-lip" },
	tireFactory: { label: "Goodyear fitment, 1991 Toyota Pickup 2WD", href: "https://www.goodyear.com/en-us/vehicles/Toyota/Pickup/1991/2~-wheel-drive" },
	tireAlt: { label: "TireSize.com, 1991 Toyota Pickup 2WD", href: "https://tiresize.com/tires/Toyota/Pick-up/1991/2wd/" },
	tint: { label: "Hawaii Revised Statutes §291-21.5", href: "https://data.capitol.hawaii.gov/hrscurrent/Vol05_Ch0261-0319/HRS0291/HRS_0291-0021_0005.htm" },
	fmvss: { label: "FMVSS 205 (49 CFR 571.205)", href: "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-571/subpart-B/section-571.205" },
	grille: { label: "1989-91 Pickup grille listings (Go-Parts)", href: "https://www.go-parts.com/toyota-pickup-grilles.html" },
	story: { label: "Kyle's truck log, Aug 23 2026", href: "#the-story" },
	kalapanaSticker: {
		label: "Aloha Got Soul, Kalapana bumper sticker",
		href: "https://alohagotsoul.com/products/slow-down-i-m-listening-to-kalapana-bumper-sticker",
	},
	reference: { label: "Rutledge Wood's '91 Pickup (Instagram)", href: "https://www.instagram.com/reel/DSOkEEVjNIz/" },
	underground: { label: "Toyota touch-up paint, Underground 1L7", href: "https://autoparts.toyota.com/products/product/underground-00258001l721" },
	ultra164: { label: "Ultra Wheel, Type 164 sizes", href: "https://www.ultrawheel.com/wheel/28/164" },
	bttf: { label: "Back to the Future wiki, Marty's Toyota", href: "https://backtothefuture.fandom.com/wiki/Toyota_Hilux" },
	tcLongboard: { label: "T&C Makani 9'6\" longboard (Rider Shack)", href: "https://www.ridershack.com/used-96-t-c-makani-longboard-surfboard-117559.html" },
	trueAmes: { label: "True Ames Greenough 4-A 10.5\" fin (Rider Shack)", href: "https://ridershack.com/products/true-ames-greenough-4-a-10-5-single-fin" },
	h6054: { label: "H6054 sealed beam, 200 mm wide (NAPA)", href: "https://www.napaonline.com/en/p/LMPH6054N" },
} as const satisfies Record<string, Source>;

const INCH = 0.0254;

export interface Option {
	id: string;
	name: string;
	/** The numbers, short, shown with the choice. */
	spec: string;
	note?: string;
	source?: Source;
}

/** Factory colors offered on the 1991 Toyota Truck. Swatches are on-screen approximations; the code is what a paint shop mixes. */
export interface PaintOption extends Option {
	hex: string;
	metallic: boolean;
}

export const PAINTS: PaintOption[] = [
	{ id: "3H7", name: "Red", spec: "1991 factory, code 3H7", hex: "#c4262e", metallic: false, source: SRC.paint, note: "Kyle's truck is a factory red; the code on its door-jamb plate (C/TR) will say which." },
	{ id: "138", name: "Slate Gray Metallic", spec: "1991 factory, code 138", hex: "#4f545a", metallic: true, source: SRC.paint },
	{ id: "147", name: "Silver Metallic", spec: "1991 factory, code 147", hex: "#b8bcc0", metallic: true, source: SRC.paint },
	{ id: "8E3", name: "Blue Pearl Metallic", spec: "1991 factory, code 8E3", hex: "#1e2c52", metallic: true, source: SRC.paint },
	{ id: "8H8", name: "Midam Blue Metallic", spec: "1991 factory, code 8H8", hex: "#3a5683", metallic: true, source: SRC.paint },
	{ id: "179", name: "Blue Gray Metallic", spec: "1991 factory, code 179", hex: "#6c7c8b", metallic: true, source: SRC.paint },
	{ id: "8D8", name: "Light Blue Metallic", spec: "1991 factory, code 8D8", hex: "#8ea8c3", metallic: true, source: SRC.paint },
	{ id: "6J7", name: "Forest Green Metallic", spec: "1991 factory, code 6J7", hex: "#2c4838", metallic: true, source: SRC.paint },
	{ id: "045", name: "White", spec: "1991 factory, code 045", hex: "#f1efe7", metallic: false, source: SRC.paint },
	{ id: "202", name: "Black", spec: "1991 factory, code 202", hex: "#141518", metallic: false, source: SRC.paint },
	{
		id: "1L7",
		name: "Underground",
		spec: "2020s Toyota, code 1L7",
		hex: "#3e4651",
		metallic: false,
		note: "A dark gray with a blue cast, between charcoal and navy. Not offered in 1991.",
		source: SRC.underground,
	},
];

/** Ride height change at each axle, meters (negative is lower). */
export interface RideOption extends Option {
	front: number;
	rear: number;
}

export const RIDES: RideOption[] = [
	{ id: "stock", name: "Stock", spec: "Factory height", front: 0, rear: 0 },
	{
		id: "b444",
		name: "Belltech 444 lowering kit",
		spec: '2" drop front (spindles), 3" rear (blocks)',
		front: -2 * INCH,
		rear: -3 * INCH,
		note: "Made for the 1984-95 Pickup 2WD.",
		source: SRC.belltech444,
	},
	{
		id: "b2000",
		name: "Belltech 2000 drop spindles",
		spec: '2" drop, front only',
		front: -2 * INCH,
		rear: 0,
		note: "Keeps the factory suspension geometry; the rear stays put.",
		source: SRC.belltech2000,
	},
	{
		id: "pa5503m",
		name: "Performance Accessories PA5503M body lift",
		spec: '3" body lift',
		front: 3 * INCH,
		rear: 3 * INCH,
		note: "Lifts the body off the frame; doesn't fit 2WD trucks with power steering.",
		source: SRC.pa5503m,
	},
];

export type WheelStyle = "hubcap" | "steel" | "alloy" | "hammer" | "eighthole";

export interface WheelOption extends Option {
	diameterIn: number;
	widthIn: number;
	offsetMm: number;
	style: WheelStyle;
}

export const WHEELS: WheelOption[] = [
	{
		id: "steel-cap",
		name: "Factory steel with hubcap",
		spec: '14 x 5.5", +20 mm, 5 x 114.3',
		diameterIn: 14,
		widthIn: 5.5,
		offsetMm: 20,
		style: "hubcap",
		source: SRC.stockWheel,
	},
	{
		id: "steel",
		name: "Factory steel, cap off",
		spec: '14 x 5.5", +20 mm, 5 x 114.3',
		diameterIn: 14,
		widthIn: 5.5,
		offsetMm: 20,
		style: "steel",
		note: "The same wheel with its center cap popped off.",
		source: SRC.stockWheel,
	},
	{
		id: "hammer",
		name: "Ultra Hammer",
		spec: '15 x 7", +20 mm, 5 x 114.3 (size to confirm)',
		diameterIn: 15,
		widthIn: 7,
		offsetMm: 20,
		style: "hammer",
		note: "90s Ultra five-slot wheels. The reference build runs a new-old-stock set (its caption names them); Ultra no longer lists the model, so the size is a placeholder until Kyle picks a set.",
		source: SRC.reference,
	},
	{
		id: "ultra164",
		name: "Ultra 164",
		spec: '15 x 10", -46 mm, 5 x 4.5 (part 164-5165P)',
		diameterIn: 15,
		widthIn: 10,
		offsetMm: -46,
		style: "eighthole",
		note: "Fat and old-school. The -46 mm offset sets the wheel 66 mm further out than the factory +20, so the tires stick out past the fenders.",
		source: SRC.ultra164,
	},
	{
		id: "alloy15",
		name: "15 x 7 alloy",
		spec: '15 x 7", +38 mm, 5 x 114.3',
		diameterIn: 15,
		widthIn: 7,
		offsetMm: 38,
		style: "alloy",
		note: "The Enkei92 is sold in exactly this size (part 465-570-6538). Drawn as a plain five-spoke until Kyle picks a real wheel.",
		source: SRC.enkei92,
	},
];

export interface TireOption extends Option {
	widthMm: number;
	aspect: number;
	rimIn: number;
}

export const TIRES: TireOption[] = [
	{ id: "195-75-14", name: "195/75R14", spec: "", widthMm: 195, aspect: 75, rimIn: 14, note: "Factory size.", source: SRC.tireFactory },
	{ id: "205-75-14", name: "205/75R14", spec: "", widthMm: 205, aspect: 75, rimIn: 14, note: "Factory alternate.", source: SRC.tireAlt },
	{ id: "215-65-15", name: "215/65R15", spec: "", widthMm: 215, aspect: 65, rimIn: 15, note: "Factory alternate, on 15-inch wheels.", source: SRC.tireAlt },
	{ id: "205-60-15", name: "205/60R15", spec: "", widthMm: 205, aspect: 60, rimIn: 15, note: "Not a factory size: shorter sidewall, the lowered look.", source: SRC.tireAlt },
	{ id: "205-50-15", name: "205/50R15", spec: "", widthMm: 205, aspect: 50, rimIn: 15, note: "Low profile: a short sidewall for a lowered truck. Not a factory size.", source: SRC.tireAlt },
	{
		id: "33-12.5-15",
		name: "33x12.50R15",
		spec: "",
		// A flotation size: 33 in tall and 12.5 in wide on a 15 in rim, written as width and sidewall ratio.
		widthMm: 12.5 * 25.4,
		aspect: ((((33 - 15) / 2) * 25.4) / (12.5 * 25.4)) * 100,
		rimIn: 15,
		note: "Monster-truck rubber. Nothing I found confirms 33s on a 2WD pickup, so expect trimming and rubbing.",
		source: SRC.tireAlt,
	},
].map((t) => ({ ...t, spec: tireSpec(t.widthMm, t.aspect, t.rimIn) }));

/** Overall tire diameter, meters: the rim plus two sidewalls (width x aspect ratio). */
export function tireDiameter(widthMm: number, aspect: number, rimIn: number): number {
	return rimIn * INCH + 2 * (widthMm * aspect) / 100 / 1000;
}

function tireSpec(widthMm: number, aspect: number, rimIn: number): string {
	const d = tireDiameter(widthMm, aspect, rimIn);
	return `${(d / INCH).toFixed(1)}" tall, ${(widthMm / 25.4).toFixed(1)}" wide`;
}

/** Visible light transmission of a window film, as a fraction. Factory glass is about 0.74 here. */
export interface TintOption extends Option {
	vlt: number;
}

/** Bare factory glass, no film. FMVSS 205 requires at least 70% for glass needed for driving visibility. */
export const FACTORY_VLT = 0.74;

const tint = (pct: number, note?: string): TintOption => ({
	id: String(pct),
	name: `${pct}% film`,
	spec: `${pct}% of light gets through`,
	vlt: pct / 100,
	note,
	source: SRC.tint,
});

const NO_TINT: TintOption = {
	id: "none",
	name: "No film",
	spec: "Factory glass, at least 70% light through",
	vlt: FACTORY_VLT,
	source: SRC.fmvss,
};

/** Hawaii: front side windows must pass at least 35% (plus or minus 6%) with the film on. */
export const FRONT_TINTS: TintOption[] = [NO_TINT, tint(50), tint(35, "Hawaii's limit for front side windows.")];
/** Hawaii exempts a truck's rear window, so any film is legal there. */
export const REAR_TINTS: TintOption[] = [NO_TINT, tint(50), tint(35), tint(20, "Legal on a truck's rear window only."), tint(5, "Legal on a truck's rear window only.")];

export interface LightOption extends Option {
	kind: "sealed" | "led";
}

export const LIGHTS: LightOption[] = [
	{ id: "sealed", name: "Factory sealed beams", spec: "7 x 6 in, H6054 (200 x 142 mm)", kind: "sealed", source: SRC.h6054 },
	{ id: "led", name: "7 x 6 LED", spec: "LED units in the same 200 x 142 mm opening", kind: "led", note: "As on the reference build.", source: SRC.h6054 },
];

export interface RackOption extends Option {
	kind: "none" | "rollbar";
}

export const RACKS: RackOption[] = [
	{ id: "none", name: "No rack", spec: "", kind: "none" },
	{
		id: "rollbar",
		name: "McFly roll bar",
		spec: 'Tube bar behind the cab, four 6" KC Daylighters',
		kind: "rollbar",
		note: "Marty McFly's 1985 Toyota carried four 6-inch round KC Daylighters on its rear roll bar. Yellow KC covers (part 5202).",
		source: SRC.bttf,
	},
];

export interface BoardOption extends Option {
	board: boolean;
}

export const BOARDS: BoardOption[] = [
	{ id: "none", name: "No board", spec: "", board: false },
	{
		id: "longboard",
		name: "T&C longboard, single fin",
		spec: '9\'6" x 23 1/2" x 3 1/2", 10.5" fin',
		board: true,
		note: "Classic white with a yin-yang and TANAKA on the bottom, deck down so the translucent neon green fin points up, tail out over the tailgate. Sized from a T&C Makani; the fin is a 10.5\" True Ames Greenough 4-A. Needs an open bed.",
		source: SRC.tcLongboard,
	},
];

export interface TailgateOption extends Option {
	lettering: boolean;
}

export const TAILGATES: TailgateOption[] = [
	{ id: "factory", name: "White TOYOTA", spec: "Factory lettering in the indented panel", lettering: true },
	{ id: "plain", name: "Lettering removed", spec: "The tailgate in body color only", lettering: false },
];

export type GrilleFinish = "painted" | "chrome";

export interface GrilleOption extends Option {
	finish: GrilleFinish;
}

export const GRILLES: GrilleOption[] = [
	{ id: "painted", name: "Painted black", spec: "1989-91 grille, black shell", finish: "painted", source: SRC.grille },
	{ id: "chrome", name: "Chrome shell", spec: "1989-91 grille, chrome shell, black insert", finish: "chrome", source: SRC.grille },
];

export type BedKind = "none" | "shell" | "tonneau";

export interface BedOption extends Option {
	kind: BedKind;
}

export const BEDS: BedOption[] = [
	{ id: "none", name: "Open bed", spec: "", kind: "none" },
	{ id: "shell", name: "Cab-high camper shell", spec: "Top level with the roof, full bed length", kind: "shell", note: "Any make; drawn from the bed's own size." },
	{ id: "tonneau", name: "Soft roll-up tonneau", spec: "Flush with the bed rails", kind: "tonneau", note: "Any make; drawn from the bed's own size." },
];

export interface DecalOption extends Option {
	kalapana: boolean;
}

/** Aloha Got Soul's Kalapana sticker is 7.5 x 2.5 inches. */
export const STICKER_SIZE = { w: 7.5 * INCH, h: 2.5 * INCH } as const;

export const DECALS: DecalOption[] = [
	{ id: "none", name: "No sticker", spec: "", kalapana: false, source: SRC.story },
	{
		id: "kalapana",
		name: '"Slow Down, I\'m Listening to Kalapana"',
		spec: '7.5 x 2.5" sticker, white on green, rear window',
		kalapana: true,
		note: "The Aloha Got Soul sticker from Kyle's plan for the truck.",
		source: SRC.kalapanaSticker,
	},
];

export interface Build {
	paint: string;
	ride: string;
	wheel: string;
	tire: string;
	tintFront: string;
	tintRear: string;
	lights: string;
	grille: string;
	tailgate: string;
	bed: string;
	rack: string;
	board: string;
	decal: string;
}

/** The truck as it sits in Hilo today. */
export const AS_IT_SITS: Build = {
	paint: "3H7",
	ride: "stock",
	wheel: "steel-cap",
	tire: "195-75-14",
	tintFront: "none",
	tintRear: "none",
	lights: "sealed",
	grille: "painted",
	tailgate: "factory",
	bed: "none",
	rack: "none",
	board: "none",
	decal: "none",
};

/**
 * Kyle's build, from his notes and the reference truck he picked: factory black, lowered a little on a
 * Belltech kit (not slammed), Ultra Hammer wheels on low-profile tires, LED headlights, 35% film all
 * round, the tailgate lettering removed, the Kalapana sticker, and a longboard in the bed.
 */
export const KYLE_BUILD: Build = {
	...AS_IT_SITS,
	paint: "202",
	ride: "b444",
	wheel: "hammer",
	tire: "205-50-15",
	tintFront: "35",
	tintRear: "35",
	lights: "led",
	tailgate: "plain",
	board: "longboard",
	decal: "kalapana",
};

/**
 * Noah's build: closer to a monster truck, after Marty McFly's Toyota and Poi Pounder. Underground
 * paint, a body lift, 33-inch tires on fat 15 x 10 wheels, and a McFly roll bar with KC lights on top.
 */
export const NOAH_BUILD: Build = {
	...AS_IT_SITS,
	paint: "1L7",
	ride: "pa5503m",
	wheel: "ultra164",
	tire: "33-12.5-15",
	rack: "rollbar",
};

export const CATALOG = {
	paint: PAINTS,
	ride: RIDES,
	wheel: WHEELS,
	tire: TIRES,
	tintFront: FRONT_TINTS,
	tintRear: REAR_TINTS,
	lights: LIGHTS,
	grille: GRILLES,
	tailgate: TAILGATES,
	bed: BEDS,
	rack: RACKS,
	board: BOARDS,
	decal: DECALS,
} as const;

export type BuildKey = keyof Build;

/** Look up the full option for each choice, falling back to the truck as it sits for anything unknown. */
export function resolveBuild(build: Build) {
	const pick = <K extends BuildKey>(key: K) => {
		const list = CATALOG[key] as readonly Option[];
		return (list.find((o) => o.id === build[key]) ?? list.find((o) => o.id === AS_IT_SITS[key])!) as (typeof CATALOG)[K][number];
	};
	const wheel = pick("wheel");
	let tire = pick("tire");
	// A tire only goes on a wheel of its own rim size.
	if (tire.rimIn !== wheel.diameterIn) tire = TIRES.find((t) => t.rimIn === wheel.diameterIn)!;
	const bed = pick("bed");
	// The board rides in an open bed; a shell or a cover leaves no room for it.
	let board = pick("board");
	if (board.board && bed.kind !== "none") board = BOARDS[0];
	return {
		paint: pick("paint"),
		ride: pick("ride"),
		wheel,
		tire,
		tintFront: pick("tintFront"),
		tintRear: pick("tintRear"),
		lights: pick("lights"),
		grille: pick("grille"),
		tailgate: pick("tailgate"),
		bed,
		rack: pick("rack"),
		board,
		decal: pick("decal"),
	};
}

export type ResolvedBuild = ReturnType<typeof resolveBuild>;

const KEY_ORDER: BuildKey[] = ["paint", "ride", "wheel", "tire", "tintFront", "tintRear", "lights", "grille", "tailgate", "bed", "rack", "board", "decal"];

/** A build as a short, readable URL fragment, e.g. "paint=138&ride=b444&...". */
export function encodeBuild(build: Build): string {
	const r = resolveBuild(build);
	return KEY_ORDER.map((k) => `${k}=${encodeURIComponent(r[k].id)}`).join("&");
}

/** Parse a fragment back into a build; unknown or missing values fall back to the truck as it sits. */
export function decodeBuild(fragment: string): Build {
	const params = new URLSearchParams(fragment.replace(/^#?(build=)?/, ""));
	const raw = Object.fromEntries(KEY_ORDER.map((k) => [k, params.get(k) ?? AS_IT_SITS[k]])) as unknown as Build;
	const r = resolveBuild(raw);
	return Object.fromEntries(KEY_ORDER.map((k) => [k, r[k].id])) as unknown as Build;
}

/** One line per choice, for the readout and the email. */
export function describeBuild(build: Build): { label: string; value: string }[] {
	const r = resolveBuild(build);
	return [
		{ label: "Paint", value: `${r.paint.name} (code ${r.paint.id})` },
		{ label: "Ride height", value: `${r.ride.name}: ${r.ride.spec}` },
		{ label: "Wheels", value: `${r.wheel.name}, ${r.wheel.spec}` },
		{ label: "Tires", value: `${r.tire.name}, ${r.tire.spec}` },
		{ label: "Front side windows", value: r.tintFront.name },
		{ label: "Rear window", value: r.tintRear.name },
		{ label: "Headlights", value: r.lights.name },
		{ label: "Grille", value: r.grille.name },
		{ label: "Tailgate", value: r.tailgate.name },
		{ label: "Bed", value: r.bed.name },
		{ label: "Rack", value: r.rack.name },
		{ label: "Surfboard", value: r.board.board ? `${r.board.name}, ${r.board.spec}` : r.board.name },
		{ label: "Sticker", value: r.decal.name },
	];
}

/** Section labels for the picker, in display order. */
export const PICKER_GROUPS: { key: BuildKey; label: string }[] = [
	{ key: "paint", label: "Paint" },
	{ key: "ride", label: "Ride height" },
	{ key: "wheel", label: "Wheels" },
	{ key: "tire", label: "Tires" },
	{ key: "tintFront", label: "Front side windows" },
	{ key: "tintRear", label: "Rear window" },
	{ key: "lights", label: "Headlights" },
	{ key: "grille", label: "Grille" },
	{ key: "tailgate", label: "Tailgate" },
	{ key: "bed", label: "Bed" },
	{ key: "rack", label: "Rack and lights" },
	{ key: "board", label: "Surfboard" },
	{ key: "decal", label: "Sticker" },
];

/** What the 3D truck needs for a build: the paint color and the builder options (minus the engine). */
export function truckSetup(build: Build) {
	const r = resolveBuild(build);
	return {
		body: r.paint.hex,
		options: {
			metallicPaint: r.paint.metallic,
			ride: { front: r.ride.front, rear: r.ride.rear },
			wheel: { diameterIn: r.wheel.diameterIn, widthIn: r.wheel.widthIn, offsetMm: r.wheel.offsetMm, style: r.wheel.style },
			tire: { widthMm: r.tire.widthMm, aspect: r.tire.aspect, rimIn: r.tire.rimIn },
			glassVlt: { front: r.tintFront.vlt, rear: r.tintRear.vlt },
			headlights: r.lights.kind,
			grille: r.grille.finish,
			bed: r.bed.kind,
			sticker: r.decal.kalapana,
			tailgateLettering: r.tailgate.lettering,
			rack: r.rack.kind,
			board: r.board.board,
		},
	};
}
