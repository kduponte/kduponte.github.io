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
	bbsRgr: { label: "BBS RG-R, 17x7.5 5x114.3 +48 (Canada Wheels)", href: "https://www.canadawheels.ca/bbs-wheels/rgr" },
	bbsJapan: { label: "BBS Japan, RG-R sizes and finishes", href: "https://bbs-japan.co.jp/en/?p=1266" },
	cavalryBlue: { label: "AutomotiveTouchup, 2021 Tacoma colors (8W2 Cavalry Blue)", href: "https://www.automotivetouchup.com/touch-up-paint/toyota/2021/tacoma" },
	fabtech2wd: { label: "Fabtech 3.5\" 2WD lift, 1984-95 Pickup (LC Engineering)", href: "https://www.lceperformance.com/2wd-3-5-lift-kit-with-shocks-1984-1995-pickup/" },
	westinSteps: {
		label: "Westin Signature 3\" step bars, 25-0575 (Vivid Racing)",
		href: "https://www.vividracing.com/westin-black-signature-nerf-step-bars-toyota-pickup-reg-cab-19891994-p-153275974.html",
	},
	toyotaBoards: { label: "Toyota running board 00228-89915-13 (North Park Toyota)", href: "https://parts.northparktoyota.com/oem-parts/toyota-running-board-2288991513" },
	tailpipe: { label: "Walker 44363 tailpipe, 1990-95 Pickup (FinditParts)", href: "https://www.finditparts.com/products/538637/walker-exhaust-44363" },
	chromeTip: { label: "Summit Racing APH-9822 chrome tip", href: "https://www.summitracing.com/parts/aph-9822" },
	stacks: { label: "5 x 36\" chrome mitered stack, EP50MS236C (Big Rig World)", href: "https://bigrigworld.com/mitered-stack-36-ep50ms236c.html" },
	bogger: { label: "Interco Super Swamper Bogger sizes (B-150)", href: "https://intercotire.com/tire/bogger" },
	rs5000x: { label: "Rancho RS5000X RS55372: 2.25\" body, red boot (Summit Racing)", href: "https://www.summitracing.com/parts/ran-rs55372/make/ford" },
	bttf: { label: "Back to the Future wiki, Marty's Toyota", href: "https://backtothefuture.fandom.com/wiki/Toyota_Hilux" },
	tcLongboard: { label: "T&C Surf Designs, Tommy Tanaka Beach Boy", href: "https://tcsurf.com/collections/tommy-tanaka/products/beach-boy" },
	trueAmes: { label: "True Ames Greenough 4-A 10.5\" fin (Rider Shack)", href: "https://ridershack.com/products/true-ames-greenough-4-a-10-5-single-fin" },
	h6054: { label: "H6054 sealed beam, 200 mm wide (NAPA)", href: "https://www.napaonline.com/en/p/LMPH6054N" },
	hellaH4: { label: "Hella 003427291 7 x 6\" Vision Plus conversion (JEGS)", href: "https://jegs.com/p/Hella/Hella-Vision-Plus-Halogen-Sealed-Beam-Headlight-Conversions/2836501/10002/-1" },
	retroBright: { label: "Holley RetroBright LFRB130, Classic White 3000K", href: "https://www.holley.com/products/electrical/lighting/headlights/parts/LFRB130" },
	bilstein5100: { label: "Bilstein 5100 (VS-24-186216): 46 mm zinc body, black boot (CARiD)", href: "https://www.carid.com/bilstein/b8-5100-series-front-shock-absorber-set-mpn-vs-24-186216.html" },
	kc5105: { label: "KC HiLiTES 5105, 6\" black cover, white KC logo (ExtremeTerrain)", href: "https://www.extremeterrain.com/kc-hilites-jeep-wrangler-6-inch-slimlite-hid-daylighter-hard-light-cover-black-white-kc-logo-5105.html" },
	linex: { label: "LINE-X Standard spray-on bedliner", href: "https://linex.com/bedliners/standard" },
	apexSliders: { label: "Trail-Gear APEX rock sliders, 1984-95 Toyota Pickup", href: "https://trail-gear.com/armor/1984-1995-toyota-pickup-apex-rock-sliders.html" },
	turndown: { label: "Nickson 17601 turndown, 1.75\" inlet, 12\" long (CARiD)", href: "https://www.carid.com/nickson/product-mpn-17601.html" },
	ulua: { label: "PENN Battalion II Ulua rod: 13', two pieces", href: "https://www.pennfishing.com/products/battalion-ii-conventional-ulua-surf-rod-1523124" },
	cooler: { label: "YETI Tundra 110: 37.2 x 18 x 19.8\" outside (CampSaver)", href: "https://www.campsaver.com/yeti-tundra-110-cooler.html" },
	bags: { label: "Do it Best 33 gal bags, 33 x 36.5\"", href: "https://www.doitbest.com/product/628131/do-it-best-33-gal-extra-large-black-trash-bag-40-count-628131/" },
	crf50f: { label: "Honda CRF50F specifications (Honda News)", href: "https://hondanews.com/en-US/releases/release-13f25e90cfe47cd58453f1f71015b964-2024-honda-crf50f-specifications" },
	kanaka: { label: "Flags For Good, Kanaka Maoli flag sticker (3.75 x 2.5\")", href: "https://flagsforgood.com/products/hawaii-flag-sticker" },
	dahui: { label: "Da Hui Paddle Race 2023, the Hui O He'e Nalu badge (Pacific Sport Events)", href: "https://www.pseresults.com/post/da-hui-paddle-race-2023" },
	lemon: {
		label: "Lemon's logo",
		href: "https://media.licdn.com/dms/image/v2/C4E0BAQGzTdkgip9RiQ/company-logo_200_200/company-logo_200_200/0/1631314531356?e=2147483647&v=beta&t=ulszIuaSUY6FTbNd9jF7MswAgEKeHWYbb55l_kolAK0",
	},
	tcSticker: { label: "T&C Surf Designs, 6\" Standard Logo Sticker", href: "https://tcsurf.com/products/6-std-logo-sticker" },
} as const satisfies Record<string, Source>;

/** TireSize.com's page for one size: its height, width and approved wheel widths. */
const tireSizeSrc = (size: string): Source => ({ label: `TireSize.com, ${size}`, href: `https://tiresize.com/tiresizes/${size.replace("/", "-")}.htm` });

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
	{
		id: "3H7",
		name: "Red",
		spec: "1991 factory, code 3H7",
		hex: "#c4262e",
		metallic: false,
		source: SRC.paint,
		note: "Kyle's truck is a solid factory red, so this is the best guess for it; the door-jamb plate (C/TR) would confirm.",
	},
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
	{
		id: "8W2",
		name: "Cavalry Blue",
		spec: "2019+ Toyota, code 8W2",
		hex: "#56687c",
		metallic: false,
		note: "Sold as a grayish blue: the same family as Underground, a step bluer. Not offered in 1991.",
		source: SRC.cavalryBlue,
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
	{
		id: "fabtech",
		name: "Fabtech 3.5\" 2WD lift",
		spec: '3.5" suspension lift (kit 2044030)',
		front: 3.5 * INCH,
		rear: 3.5 * INCH,
		note: "Taller upper control arms up front and add-a-leafs in the rear, made for the 1984-95 Pickup 2WD.",
		source: SRC.fabtech2wd,
	},
	{
		id: "fabtech-pa",
		name: "Fabtech lift plus PA5503M body lift",
		spec: '6.5" total: 3.5" suspension, 3" body',
		front: 6.5 * INCH,
		rear: 6.5 * INCH,
		note: "Both kits together. The body lift is the PA5503M above, which doesn't fit 2WD trucks with power steering. Three inches is as far as Hawaii lets a body sit off its frame (HRS §291-35.1), and no taller 2WD suspension kit turned up, so more height has to come from bigger tires.",
		source: SRC.fabtech2wd,
	},
];

export type WheelStyle = "hubcap" | "steel" | "alloy" | "hammer" | "eighthole" | "mesh";
/** What the spokes are finished in, where a wheel comes in more than one (only the mesh wheel does). */
export type WheelFinish = "black" | "chrome";

export interface WheelOption extends Option {
	diameterIn: number;
	widthIn: number;
	offsetMm: number;
	style: WheelStyle;
	finish?: WheelFinish;
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
		id: "bbs-rgr-chrome",
		name: "BBS RG-R, chrome",
		spec: '17 x 7.5", +48 mm, 5 x 114.3 (RG744, chromed)',
		diameterIn: 17,
		widthIn: 7.5,
		offsetMm: 48,
		style: "mesh",
		finish: "chrome",
		note: "The same RG744 in chrome. BBS doesn't sell the RG-R in chrome (it comes in Diamond Black, Diamond Silver, Black Diacut and Gold Diacut), so a chrome set means plating a set after you buy it. Diamond Silver is the brightest finish sold new.",
		source: SRC.bbsJapan,
	},
	{
		id: "bbs-rgr",
		name: "BBS RG-R, black",
		spec: '17 x 7.5", +48 mm, 5 x 114.3 (part RG744HDBK)',
		diameterIn: 17,
		widthIn: 7.5,
		offsetMm: 48,
		style: "mesh",
		finish: "black",
		note: "BBS's classic cross-spoke mesh, in Diamond Black, sold new in this bolt pattern. The +48 mm offset tucks the wheel 28 mm further in than the factory +20.",
		source: SRC.bbsRgr,
	},
	{
		id: "hammer",
		name: "Ultra Hammer",
		spec: '17 x 7", +20 mm, 5 x 114.3 (estimated)',
		diameterIn: 17,
		widthIn: 7,
		offsetMm: 20,
		style: "hammer",
		note: "90s Ultra five-slot wheels, new-old-stock on the reference build. Ultra no longer lists them, so the size is estimated from the reference footage (the rim is about 78% of the tire's height) and the offset is assumed to be factory.",
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
	/** A mud tread: lug depth and tread width, inches, from the maker's spec sheet. */
	lugs?: { depthIn: number; treadWidthIn: number };
}

export const TIRES: TireOption[] = ([
	{ id: "195-75-14", name: "195/75R14", spec: "", widthMm: 195, aspect: 75, rimIn: 14, note: "Factory size.", source: SRC.tireFactory },
	{ id: "205-75-14", name: "205/75R14", spec: "", widthMm: 205, aspect: 75, rimIn: 14, note: "Factory alternate.", source: SRC.tireAlt },
	{ id: "195-60-14", name: "195/60R14", spec: "", widthMm: 195, aspect: 60, rimIn: 14, note: "Not a factory size: a short sidewall on the factory 14-inch wheels, for a lowered truck.", source: tireSizeSrc("195/60R14") },
	{ id: "215-70-14", name: "215/70R14", spec: "", widthMm: 215, aspect: 70, rimIn: 14, note: "Not a factory size: a little taller and wider than stock, still on 14s.", source: tireSizeSrc("215/70R14") },
	{ id: "215-65-15", name: "215/65R15", spec: "", widthMm: 215, aspect: 65, rimIn: 15, note: "Factory alternate, on 15-inch wheels.", source: SRC.tireAlt },
	{ id: "205-60-15", name: "205/60R15", spec: "", widthMm: 205, aspect: 60, rimIn: 15, note: "Not a factory size: shorter sidewall, the lowered look.", source: tireSizeSrc("205/60R15") },
	{ id: "205-50-15", name: "205/50R15", spec: "", widthMm: 205, aspect: 50, rimIn: 15, note: "Low profile: a short sidewall for a lowered truck. Not a factory size.", source: tireSizeSrc("205/50R15") },
	{
		id: "31-10.5-15",
		name: "31x10.50R15",
		spec: "",
		// A flotation size: 31 in tall and 10.5 in wide on a 15 in rim, written as width and sidewall ratio.
		widthMm: 10.5 * 25.4,
		aspect: ((((31 - 15) / 2) * 25.4) / (10.5 * 25.4)) * 100,
		rimIn: 15,
		note: "The everyday 31-inch all-terrain size, for 7-9 in wheels. Not a factory size on a 2WD, and nothing I found confirms it clears one at stock height.",
		source: tireSizeSrc("31x10.50R15"),
	},
	{
		id: "33-12.5-15",
		name: "33x12.50R15",
		spec: "",
		// A flotation size: 33 in tall and 12.5 in wide on a 15 in rim, written as width and sidewall ratio.
		widthMm: 12.5 * 25.4,
		aspect: ((((33 - 15) / 2) * 25.4) / (12.5 * 25.4)) * 100,
		rimIn: 15,
		note: "Monster-truck rubber. Nothing I found confirms 33s on a 2WD pickup, so expect trimming and rubbing.",
		source: tireSizeSrc("33x12.50R15"),
	},
	{
		id: "bogger-35",
		name: "Super Swamper Bogger 35x12.50-15",
		spec: "",
		// Interco lists it 35.3 in tall and 13.2 in wide (B-150), written here as width and sidewall ratio.
		widthMm: 13.2 * 25.4,
		aspect: ((((35.3 - 15) / 2) * 25.4) / (13.2 * 25.4)) * 100,
		rimIn: 15,
		lugs: { depthIn: 24 / 32, treadWidthIn: 10.9 },
		note: "Interco's mud tire: three-stage lugs (short, intermediate, long) 24/32 in deep across a 10.9 in tread, for 8.5-11 in wheels. How many lugs go around it is an estimate. As with the 33s, nothing confirms 35s fit a 2WD Pickup.",
		source: SRC.bogger,
	},
	{ id: "205-45-17", name: "205/45R17", spec: "", widthMm: 205, aspect: 45, rimIn: 17, note: "The lowest profile here for 17s, for 6.5-7.5 in wheels. Not a factory size.", source: tireSizeSrc("205/45R17") },
	{ id: "215-45-17", name: "215/45R17", spec: "", widthMm: 215, aspect: 45, rimIn: 17, note: "Low profile for 17-inch wheels. Not a factory size.", source: tireSizeSrc("215/45R17") },
	{ id: "225-45-17", name: "225/45R17", spec: "", widthMm: 225, aspect: 45, rimIn: 17, note: "A wider low profile for 17s. Not a factory size.", source: tireSizeSrc("225/45R17") },
	{ id: "215-50-17", name: "215/50R17", spec: "", widthMm: 215, aspect: 50, rimIn: 17, note: "A taller sidewall on 17s, closer to the factory tire's height. Not a factory size.", source: tireSizeSrc("215/50R17") },
] as TireOption[]).map((t) => ({ ...t, spec: tireSpec(t.widthMm, t.aspect, t.rimIn) + (t.lugs ? `, ${Math.round(t.lugs.depthIn * 32)}/32" lugs` : "") }));

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

/** Darker than Hawaii allows on the front side windows (35%, plus or minus 6%, with the film on). */
const OVER_FRONT = "Darker than Hawaii's 35% limit for front side windows.";
/** Hawaii allows film on a windshield only along its top edge, above the AS-1 line (or the top 4 inches). */
const OVER_WINDSHIELD = "Hawaii allows film only along the top edge of a windshield, so this is darker than the law allows.";

/** Hawaii: front side windows must pass at least 35% (plus or minus 6%) with the film on. */
export const FRONT_TINTS: TintOption[] = [NO_TINT, tint(50), tint(35, "Hawaii's limit for front side windows."), tint(20, OVER_FRONT), tint(5, OVER_FRONT)];
/** Hawaii exempts a truck's rear window, so any film is legal there. */
export const REAR_TINTS: TintOption[] = [NO_TINT, tint(50), tint(35), tint(20, "Legal on a truck's rear window only."), tint(5, "Legal on a truck's rear window only.")];
/** Film across the whole windshield; Hawaii allows only a strip along the top edge. */
export const WINDSHIELD_TINTS: TintOption[] = [NO_TINT, tint(50, OVER_WINDSHIELD), tint(35, OVER_WINDSHIELD), tint(20, OVER_WINDSHIELD), tint(5, OVER_WINDSHIELD)];

export interface LightOption extends Option {
	kind: "sealed" | "h4" | "retro" | "led";
}

export const LIGHTS: LightOption[] = [
	{ id: "sealed", name: "Factory sealed beams", spec: "7 x 6 in, H6054 (200 x 142 mm)", kind: "sealed", source: SRC.h6054 },
	{
		id: "hella-h4",
		name: "Hella Vision Plus H4",
		spec: '7 x 6", glass lens over a chrome reflector, H4 bulb (part 003427291)',
		kind: "h4",
		note: "A conversion housing for the same opening that takes a replaceable H4 halogen bulb. ECE approved rather than DOT, so it's sold for off-road use in the US.",
		source: SRC.hellaH4,
	},
	{
		id: "retrobright",
		name: "Holley RetroBright LED",
		spec: '5 x 7" LED, Classic White 3000K (part LFRB130)',
		kind: "retro",
		note: "An LED unit made to replace the H6054 and keep the old look: a clear lens over a chrome reflector, in a warm 3000K white.",
		source: SRC.retroBright,
	},
	{ id: "led", name: "7 x 6 LED", spec: "LED units in the same 200 x 142 mm opening", kind: "led", note: "As on the reference build.", source: SRC.h6054 },
];

export interface RackOption extends Option {
	kind: "none" | "rollbar";
	/** The four 6-inch KC Daylighters on top of the bar, by cover color, or none. */
	lights: "none" | "yellow" | "black";
}

export interface StepOption extends Option {
	kind: "none" | "tube" | "board" | "slider";
}

export const STEPS: StepOption[] = [
	{ id: "none", name: "No steps", spec: "", kind: "none" },
	{
		id: "westin",
		name: "Westin Signature step bars",
		spec: '3" round tube, black (part 25-0575)',
		kind: "tube",
		note: "Made for the 1989-94 regular cab: a step for climbing into a lifted truck.",
		source: SRC.westinSteps,
	},
	{
		id: "toyota-boards",
		name: "Toyota chrome running boards",
		spec: "Dealer accessory, standard cab (part 00228-89915-13)",
		kind: "board",
		note: "Toyota's own chrome board for the 1989-95 standard cab. The listing gives no width, so it is drawn 5.5 in wide (estimated).",
		source: SRC.toyotaBoards,
	},
	{
		id: "apex-sliders",
		name: "Trail-Gear APEX rock sliders",
		spec: '60", 1.75" DOM tube, 2" square legs, steel fill plate',
		kind: "slider",
		note: "Bolt-on armor that guards the rockers and doubles as a step: the outer tube kicks out and up, with a plate filling the gap. Listed for the 1984-95 Pickup; nothing says 2WD either way. The kick-out angle is estimated.",
		source: SRC.apexSliders,
	},
];

/** Shocks on hoops: how many per front wheel, the body's diameter (inches) and its colors. */
export interface ShockSetup {
	perWheel: 1 | 2;
	diameterIn: number;
	body: string;
	boot: string;
	metallic: boolean;
}

export interface ShockOption extends Option {
	kind: "factory" | "hoops";
	setup?: ShockSetup;
}

/** Rancho's RS5000X: a 2.25 in white body under a red accordion boot. */
const RS5000X = { diameterIn: 2.25, body: "#f2f1ec", boot: "#c41e2a", metallic: false } as const;
const HOOPS_NOTE =
	"Custom work, not a kit: hoops welded to the frame stand the shocks up in each front wheel well, where they show beside the tire. Where the hoops sit and how tall they stand are estimates. The rear shocks stay at their mounts behind the tires.";

export const SHOCKS: ShockOption[] = [
	{
		id: "factory",
		name: "Factory mounts",
		spec: "Behind the tires, not drawn",
		kind: "factory",
		note: "Every truck has shocks, lift kits included; bolted where the factory put them, they hide behind the tires.",
	},
	{
		id: "rs5000x-single",
		name: "Rancho RS5000X on front shock hoops",
		spec: '2.25" white shock with a red boot, one per front wheel, on a weld-on hoop',
		kind: "hoops",
		setup: { perWheel: 1, ...RS5000X },
		note: HOOPS_NOTE,
		source: SRC.rs5000x,
	},
	{
		id: "rs5000x-hoops",
		name: "Dual Rancho RS5000X on front shock hoops",
		spec: '2.25" white shocks with red boots, two per front wheel, on weld-on hoops',
		kind: "hoops",
		setup: { perWheel: 2, ...RS5000X },
		note: `${HOOPS_NOTE} Two to a wheel, one leans forward and one back, so both show either side of the tire.`,
		source: SRC.rs5000x,
	},
	{
		id: "bilstein5100-hoops",
		name: "Dual Bilstein 5100s on front shock hoops",
		spec: '1.81" zinc-plated monotubes with black boots, two per front wheel',
		kind: "hoops",
		setup: { perWheel: 2, diameterIn: 1.81, body: "#c3c7ca", boot: "#141516", metallic: true },
		note: `Bilstein's lifted-truck shock, slimmer and silver where the Ranchos are white and red. The listing is for a Jeep; on hoops, the hoop sets the length. ${HOOPS_NOTE}`,
		source: SRC.bilstein5100,
	},
];

export interface ExhaustOption extends Option {
	kind: "factory" | "tip" | "stacks" | "turndown";
}

export const EXHAUSTS: ExhaustOption[] = [
	{
		id: "factory",
		name: "Factory tailpipe",
		spec: '1.75" pipe',
		kind: "factory",
		note: "Comes out on the driver's side, as on Kyle's truck, drawn exiting under the rear bumper.",
		source: SRC.tailpipe,
	},
	{
		id: "chrome-tip",
		name: "Chrome tip",
		spec: '1.75" inlet, 1.75" outlet, 5.25" long (Summit APH-9822)',
		kind: "tip",
		note: "A plain round chrome tip that bolts onto the factory 1.75-inch tailpipe.",
		source: SRC.chromeTip,
	},
	{
		id: "turndown",
		name: "Side-exit turndown",
		spec: '1.75" aluminized turndown, 12" long (Nickson 17601)',
		kind: "turndown",
		note: "The tailpipe cut short and turned down just ahead of the driver's rear tire, as on many off-road trucks. Where it's cut is an estimate.",
		source: SRC.turndown,
	},
	{
		id: "stacks",
		name: "Twin chrome stacks",
		spec: '5" x 36" mitered, in the bed behind the cab (part EP50MS236C)',
		kind: "stacks",
		note: "The monster-truck look. The 22R-E has a single exhaust, so twin stacks mean splitting it with a Y-pipe. We couldn't find what Poi Pounder itself ran.",
		source: SRC.stacks,
	},
];

export const RACKS: RackOption[] = [
	{ id: "none", name: "No rack", spec: "", kind: "none", lights: "none" },
	{
		id: "bar",
		name: "Roll bar, no lights",
		spec: "The McFly tube bar behind the cab, bare",
		kind: "rollbar",
		lights: "none",
		note: "The same bar as Marty McFly's, without its KC lights.",
		source: SRC.bttf,
	},
	{
		id: "rollbar",
		name: "McFly roll bar",
		spec: 'Tube bar behind the cab, four 6" KC Daylighters',
		kind: "rollbar",
		lights: "yellow",
		note: "Marty McFly's 1985 Toyota carried four 6-inch round KC Daylighters on its rear roll bar. Yellow KC covers (part 5202).",
		source: SRC.bttf,
	},
	{
		id: "rollbar-black",
		name: "Roll bar, black KC covers",
		spec: 'Four 6" KC Daylighters in black covers with the white KC logo (part 5105)',
		kind: "rollbar",
		lights: "black",
		note: "The McFly bar and lights with KC's black covers in place of the yellow.",
		source: SRC.kc5105,
	},
];

export type CargoKind = "none" | "longboard" | "ulua" | "cooler" | "rubbish" | "dirtbike";

/** What rides in the bed. Everything needs an open bed (a spray-in liner is fine). */
export interface CargoOption extends Option {
	kind: CargoKind;
}

export const CARGO: CargoOption[] = [
	{ id: "none", name: "Empty bed", spec: "", kind: "none" },
	{
		id: "longboard",
		name: "Tanaka Beach Boy (T&C)",
		spec: '9\'4" x 23 1/2" x 3", single 10.5" fin',
		kind: "longboard",
		note: "Tommy Tanaka's single-fin noserider for T&C, in classic white with the Town & Country Hawaii disc and the Tanaka script near the nose. It rides deck down so the translucent neon green pivot fin points up, its tail out over the tailgate.",
		source: SRC.tcLongboard,
	},
	{
		id: "ulua",
		name: "Ulua poles",
		spec: "Three 13' PENN Battalion II Ulua rods, broken down into 6' 6\" halves",
		kind: "ulua",
		note: "Hawaii shore-casting rods, made for ulua off the rocks. They come apart in two, so they ride in the bed in halves, butt ends on the floor and resting up on the tailgate. Drawn from PENN's photos: black blanks, a stainless butt sleeve, black rubber grips, silver trim rings at the reel seat, a magenta band and gold label above the grip, and silver wire guides. Where each sits along the rod is estimated from the photos, and the reels are drawn generic.",
		source: SRC.ulua,
	},
	{
		id: "yeti-110",
		name: "YETI Tundra 110",
		spec: '37.2 x 18 x 19.8" outside, white',
		kind: "cooler",
		note: "Across the front of the bed with its front to the tailgate: the white rotomolded body and lid, the raised front panel, two black rubber T-latches, the black YETI nameplate, rope handles at the ends and rubber feet. The lid's height and the panel's shape are taken from YETI's photos.",
		source: SRC.cooler,
	},
	{
		id: "rubbish",
		name: "Rubbish run",
		spec: 'Four 33-gallon black bags, 33 x 36.5" flat',
		kind: "rubbish",
		note: "Loaded for the transfer station: three standing and one laid on its side. Each is drawn tied off; how full each is, and how it slumps and bulges, is estimated from the flat size.",
		source: SRC.bags,
	},
	{
		id: "crf50f",
		name: "Honda CRF50F dirt bike",
		spec: '51.3" long, 30.5" tall, 10" wheels, red',
		kind: "dirtbike",
		note: "Honda's smallest trail bike, standing on its wheels in the bed, strapped down. Wheelbase, height, seat height and tire size are Honda's. Drawn from Honda's studio photo: red plastics and seat, the white HONDA on each side panel and CRF on the shrouds, a silver frame and fork with red guards, spoked wheels on knobby tires, and the black exhaust on the right. Panel shapes are simplified.",
		source: SRC.crf50f,
	},
];

export interface TailgateOption extends Option {
	lettering: boolean;
	/** The TOYOTA letters' color, when they're there. */
	letterHex?: string;
}

export const TAILGATES: TailgateOption[] = [
	{ id: "factory", name: "White TOYOTA", spec: "Factory lettering in the indented panel", lettering: true, letterHex: "#f4f2ec" },
	{ id: "silver", name: "Silver TOYOTA", spec: "The factory letters in silver", lettering: true, letterHex: "#b9bdc1", note: "Custom: the same letters, painted or cut from silver vinyl." },
	{ id: "black", name: "Black TOYOTA", spec: "The factory letters in black", lettering: true, letterHex: "#141518", note: "Custom: the same letters in black. On a black truck they all but disappear." },
	{ id: "plain", name: "Lettering removed", spec: "The tailgate in body color only", lettering: false },
];

export type GrilleFinish = "painted" | "chrome" | "body" | "blackout";

export interface GrilleOption extends Option {
	finish: GrilleFinish;
}

export const GRILLES: GrilleOption[] = [
	{ id: "painted", name: "Painted black", spec: "1989-91 grille, black shell", finish: "painted", source: SRC.grille },
	{ id: "chrome", name: "Chrome shell", spec: "1989-91 grille, chrome shell, black insert", finish: "chrome", source: SRC.grille },
	{
		id: "body",
		name: "Body color",
		spec: "1989-91 grille, shell painted to match",
		finish: "body",
		note: "Custom paint: the factory grille with its shell sprayed in the truck's color. Nothing to buy.",
		source: SRC.grille,
	},
	{
		id: "blackout",
		name: "Blacked out",
		spec: "1989-91 grille, black shell, black letters",
		finish: "blackout",
		note: "Custom paint: the chrome TOYOTA letters painted black to match the shell.",
		source: SRC.grille,
	},
];

export type BedKind = "none" | "liner" | "shell" | "tonneau";

export interface BedOption extends Option {
	kind: BedKind;
}

export const BEDS: BedOption[] = [
	{ id: "none", name: "Open bed", spec: "", kind: "none" },
	{
		id: "linex",
		name: "LINE-X spray-on liner",
		spec: "Black textured coating, floor and inside walls",
		kind: "liner",
		note: "Sprayed on at a LINE-X dealer. The bed stays open, so cargo still fits.",
		source: SRC.linex,
	},
	{ id: "shell", name: "Cab-high camper shell", spec: "Top level with the roof, full bed length", kind: "shell", note: "Any make; drawn from the bed's own size." },
	{ id: "tonneau", name: "Soft roll-up tonneau", spec: "Flush with the bed rails", kind: "tonneau", note: "Any make; drawn from the bed's own size." },
];

/** Whether cargo can ride in the bed: open, with or without a liner. */
export const bedIsOpen = (kind: BedKind) => kind === "none" || kind === "liner";

export type StickerKind = "kalapana" | "tc" | "lemon" | "kanaka" | "dahui";

export interface DecalOption extends Option {
	stickers: StickerKind[];
}

/** Aloha Got Soul's Kalapana sticker is 7.5 x 2.5 inches. */
export const STICKER_SIZE = { w: 7.5 * INCH, h: 2.5 * INCH } as const;
/** T&C's Standard Logo sticker is 6 inches across. */
export const TC_STICKER_D = 6 * INCH;

/** Every sticker shares the bottom passenger-side corner of the rear window, drawn bigger than life. */
const DRAWN_BIGGER = "Drawn 1.5x its real size so it shows up on screen.";

export const DECALS: DecalOption[] = [
	{ id: "none", name: "No sticker", spec: "", stickers: [], source: SRC.story },
	{
		id: "kalapana",
		name: '"Slow Down, I\'m Listening to Kalapana"',
		spec: '7.5 x 2.5" sticker, white on green, rear window',
		stickers: ["kalapana"],
		note: `The Aloha Got Soul sticker from Kyle's plan for the truck. ${DRAWN_BIGGER}`,
		source: SRC.kalapanaSticker,
	},
	{
		id: "tc",
		name: "T&C logo",
		spec: '6" round, white on clear, rear window',
		stickers: ["tc"],
		note: `T&C Surf Designs' classic yin-yang logo, in its white-and-clear version. The ring lettering is too small to draw at this scale. ${DRAWN_BIGGER}`,
		source: SRC.tcSticker,
	},
	{
		id: "lemon",
		name: "Lemon",
		spec: "Die-cut lemon slice, rear window",
		stickers: ["lemon"],
		note: `A throwback to Lemon, Kyle's old company: just the lemon from its logo, cut to its outline. There's no sticker to buy, so its 4 in size is an estimate. ${DRAWN_BIGGER}`,
		source: SRC.lemon,
	},
	{
		id: "kanaka",
		name: "Kanaka Maoli flag",
		spec: '3.75 x 2.5" sticker, rear window',
		stickers: ["kanaka"],
		note: `Gene Simeona's flag: nine stripes of green, red and yellow, and a green shield carrying a kahili and two crossed paddles. ${DRAWN_BIGGER}`,
		source: SRC.kanaka,
	},
	{
		id: "dahui",
		name: "Da Hui",
		spec: "Round badge, yellow on black, rear window",
		stickers: ["dahui"],
		note: `The Hui O He'e Nalu badge from the North Shore's Da Hui Paddle Race: a black disc ringed in yellow with a yellow surfer at its center. The ring lettering is too small to draw at this scale, and the surfer is simplified. No sticker size is listed, so its 4 in size is an estimate. ${DRAWN_BIGGER}`,
		source: SRC.dahui,
	},
];

export interface Build {
	paint: string;
	ride: string;
	wheel: string;
	tire: string;
	tintFront: string;
	tintRear: string;
	tintWindshield: string;
	lights: string;
	grille: string;
	tailgate: string;
	bed: string;
	rack: string;
	steps: string;
	shocks: string;
	exhaust: string;
	cargo: string;
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
	tintWindshield: "none",
	lights: "sealed",
	grille: "painted",
	tailgate: "factory",
	bed: "none",
	rack: "none",
	steps: "none",
	shocks: "factory",
	exhaust: "factory",
	cargo: "none",
	decal: "none",
};

/**
 * Kyle's build, from his notes and the reference truck he picked: factory black, lowered a little on a
 * Belltech kit (not slammed), chrome BBS RG-R mesh wheels on low-profile tires, LED headlights, 20% film on
 * every window (windshield too), the tailgate lettering removed, a chrome exhaust tip, the Kalapana sticker, and a longboard in the bed.
 */
export const KYLE_BUILD: Build = {
	...AS_IT_SITS,
	paint: "202",
	ride: "b444",
	wheel: "bbs-rgr-chrome",
	tire: "215-45-17",
	tintFront: "20",
	tintRear: "20",
	tintWindshield: "20",
	lights: "led",
	tailgate: "plain",
	exhaust: "chrome-tip",
	cargo: "longboard",
	decal: "kalapana",
};

/**
 * Noah's build: closer to a monster truck, after Marty McFly's Toyota and Poi Pounder. Toyota's 1991
 * Blue Pearl, nearer navy than gray; 6.5 inches of lift, 35-inch Super Swamper Boggers on fat 15 x 10 wheels,
 * front shocks on hoops where they show, step bars, twin chrome stacks, and a McFly roll bar with KC lights.
 */
export const NOAH_BUILD: Build = {
	...AS_IT_SITS,
	paint: "8E3",
	ride: "fabtech-pa",
	wheel: "ultra164",
	tire: "bogger-35",
	rack: "rollbar",
	steps: "westin",
	shocks: "rs5000x-hoops",
	exhaust: "stacks",
};

export const CATALOG = {
	paint: PAINTS,
	ride: RIDES,
	wheel: WHEELS,
	tire: TIRES,
	tintFront: FRONT_TINTS,
	tintRear: REAR_TINTS,
	tintWindshield: WINDSHIELD_TINTS,
	lights: LIGHTS,
	grille: GRILLES,
	tailgate: TAILGATES,
	bed: BEDS,
	rack: RACKS,
	steps: STEPS,
	shocks: SHOCKS,
	exhaust: EXHAUSTS,
	cargo: CARGO,
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
	// Cargo rides in an open bed; a shell or a cover leaves no room for it.
	let cargo = pick("cargo");
	if (cargo.kind !== "none" && !bedIsOpen(bed.kind)) cargo = CARGO[0];
	return {
		paint: pick("paint"),
		ride: pick("ride"),
		wheel,
		tire,
		tintFront: pick("tintFront"),
		tintRear: pick("tintRear"),
		tintWindshield: pick("tintWindshield"),
		lights: pick("lights"),
		grille: pick("grille"),
		tailgate: pick("tailgate"),
		bed,
		rack: pick("rack"),
		steps: pick("steps"),
		shocks: pick("shocks"),
		exhaust: pick("exhaust"),
		cargo,
		decal: pick("decal"),
	};
}

export type ResolvedBuild = ReturnType<typeof resolveBuild>;

const KEY_ORDER: BuildKey[] = ["paint", "ride", "shocks", "wheel", "tire", "tintFront", "tintRear", "tintWindshield", "lights", "grille", "tailgate", "bed", "rack", "steps", "exhaust", "cargo", "decal"];

/** A build as a short, readable URL fragment, e.g. "paint=138&ride=b444&...". */
export function encodeBuild(build: Build): string {
	const r = resolveBuild(build);
	return KEY_ORDER.map((k) => `${k}=${encodeURIComponent(r[k].id)}`).join("&");
}

/** Parse a fragment back into a build; unknown or missing values fall back to the truck as it sits. */
export function decodeBuild(fragment: string): Build {
	const params = new URLSearchParams(fragment.replace(/^#?(build=)?/, ""));
	// Links made before the bed held more than a surfboard say board=longboard.
	if (!params.has("cargo") && params.get("board") === "longboard") params.set("cargo", "longboard");
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
		{ label: "Shocks", value: r.shocks.name },
		{ label: "Wheels", value: `${r.wheel.name}, ${r.wheel.spec}` },
		{ label: "Tires", value: `${r.tire.name}, ${r.tire.spec}` },
		{ label: "Front side windows", value: r.tintFront.name },
		{ label: "Rear window", value: r.tintRear.name },
		{ label: "Windshield", value: r.tintWindshield.name },
		{ label: "Headlights", value: r.lights.name },
		{ label: "Grille", value: r.grille.name },
		{ label: "Tailgate", value: r.tailgate.name },
		{ label: "Bed", value: r.bed.name },
		{ label: "Rack", value: r.rack.name },
		{ label: "Steps", value: r.steps.name },
		{ label: "Exhaust", value: r.exhaust.name },
		{ label: "Cargo", value: r.cargo.kind === "none" ? r.cargo.name : `${r.cargo.name}, ${r.cargo.spec}` },
		{ label: "Stickers", value: r.decal.name },
	];
}

/** Section labels for the picker, in display order. */
export const PICKER_GROUPS: { key: BuildKey; label: string }[] = [
	{ key: "paint", label: "Paint" },
	{ key: "ride", label: "Ride height" },
	{ key: "shocks", label: "Shocks" },
	{ key: "wheel", label: "Wheels" },
	{ key: "tire", label: "Tires" },
	{ key: "tintFront", label: "Front side windows" },
	{ key: "tintRear", label: "Rear window" },
	{ key: "tintWindshield", label: "Windshield" },
	{ key: "lights", label: "Headlights" },
	{ key: "grille", label: "Grille" },
	{ key: "tailgate", label: "Tailgate" },
	{ key: "bed", label: "Bed" },
	{ key: "rack", label: "Rack and lights" },
	{ key: "steps", label: "Steps" },
	{ key: "exhaust", label: "Exhaust" },
	{ key: "cargo", label: "Cargo" },
	{ key: "decal", label: "Stickers" },
];

/** What the 3D truck needs for a build: the paint color and the builder options (minus the engine). */
export function truckSetup(build: Build) {
	const r = resolveBuild(build);
	return {
		body: r.paint.hex,
		options: {
			metallicPaint: r.paint.metallic,
			ride: { front: r.ride.front, rear: r.ride.rear },
			wheel: { diameterIn: r.wheel.diameterIn, widthIn: r.wheel.widthIn, offsetMm: r.wheel.offsetMm, style: r.wheel.style, finish: r.wheel.finish },
			tire: { widthMm: r.tire.widthMm, aspect: r.tire.aspect, rimIn: r.tire.rimIn, lugs: r.tire.lugs },
			glassVlt: { front: r.tintFront.vlt, rear: r.tintRear.vlt, windshield: r.tintWindshield.vlt },
			headlights: r.lights.kind,
			grille: r.grille.finish,
			bed: r.bed.kind,
			stickers: r.decal.stickers,
			tailgateLettering: r.tailgate.lettering,
			tailgateLetterColor: r.tailgate.letterHex,
			rack: r.rack.kind,
			rackLights: r.rack.lights,
			steps: r.steps.kind,
			shocks: r.shocks.kind,
			shockSetup: r.shocks.setup,
			exhaust: r.exhaust.kind,
			cargo: r.cargo.kind,
		},
	};
}
