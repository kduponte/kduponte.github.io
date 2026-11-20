import { describe, expect, it } from "vitest";
import { lengthM, pageLines, parseStationPage, splitTitle } from "../../src/lib/surf-forecast/station-page";

// Cut-down copies of the three layouts NDBC's station pages use for these buoys.
const tail = `<p>Latest NWS Marine Forecast</p><p>Search And Rescue (SAR) Data</p><p>Water depth:</p><p>999 m</p>`;

const HAWAII = `<script>const currentstnname = 'Waimea Bay, HI (106)';</script>
<h1>Station 51201 <span>(LLNR 1059.2)</span> - Waimea Bay, HI (106) </h1>
<div><p><b>Owned and maintained by </b><br>Pacific Islands Ocean Observing System (PacIOOS)<br><b>Data provided by </b><br>Scripps Institution of Oceanography</p>
<b>Waverider Buoy</b><br>21.671 N 158.118 W (21&#176;40'15" N 158&#176;7'5" W)<br>
<b>Site elevation:</b> sea level<br><b>Sea temp depth:</b> 0.46 m below water line<br><b>Water depth:</b> 200 m</div>${tail}`;

const CALIFORNIA = `<script>var currentstnname = 'San Francisco Bar, CA  (142)';</script>
<h1>Station 46237 - San Francisco Bar, CA  (142) </h1>
<p><b>Information submitted by </b><br>Scripps Institution of Oceanography</p><b>Waverider Buoy</b><br>
37.788 N 122.634 W (37&#176;47'16" N 122&#176;38'1" W)<br><b>Water depth:</b> 16.76 m${tail}`;

const NDBC = `<script>currentstnname = 'MONTEREY - 27NM WNW of Monterey, CA';</script>
<h1>Station 46042 <br>(LLNR 297)<br>- MONTEREY - 27NM WNW of Monterey, CA </h1>
<p><b>Owned and maintained by National Data Buoy Center</b><br>3-meter foam buoy w/ seal cage<br>SCOOP payload<br>
36.787 N 122.408 W (36&#176;47'12" N 122&#176;24'30" W)<br><b>Site elevation:</b> sea level<br>
<b>Air temp height:</b> 3.7 m above site elevation<br><b>Anemometer height:</b> 4.1 m above site elevation<br>
<b>Sea temp depth:</b> 1.5 m below water line<br><b>Water depth:</b> 1710 m<br><b>Watch circle radius:</b> 1757 yards</p>${tail}`;

describe("pageLines", () => {
	it("splits text nodes, decodes entities and drops scripts", () => {
		expect(pageLines("<script>var x = 1;</script><b>a&amp;b</b> <i>21&#176;40'</i>")).toEqual(["a&b", "21°40'"]);
	});
});

describe("lengthM", () => {
	it("reads metres and converts yards", () => {
		expect(lengthM("16.76 m")).toBe(16.76);
		expect(lengthM("0.46 m below water line")).toBe(0.46);
		expect(lengthM("1757 yards")).toBeCloseTo(1606.6, 1);
		expect(lengthM("sea level")).toBeNull();
	});
});

describe("splitTitle", () => {
	it("separates the CDIP number", () => {
		expect(splitTitle("San Francisco Bar, CA  (142)")).toEqual({ title: "San Francisco Bar, CA", cdip: "142" });
		expect(splitTitle("MONTEREY - 27NM WNW of Monterey, CA")).toEqual({ title: "MONTEREY - 27NM WNW of Monterey, CA", cdip: null });
	});
});

describe("parseStationPage", () => {
	it("reads a PacIOOS Waverider", () => {
		expect(parseStationPage("51201", HAWAII)).toMatchObject({
			title: "Waimea Bay, HI",
			cdip: "106",
			owner: "Pacific Islands Ocean Observing System (PacIOOS)",
			data_from: "Scripps Institution of Oceanography",
			hull: "Waverider Buoy",
			payload: [],
			latitude: 21.671,
			longitude: -158.118,
			water_depth_m: 200,
			sea_temp_depth_m: 0.46,
			anemometer_height_m: null,
		});
	});

	it("reads a Scripps Waverider with no owner line", () => {
		expect(parseStationPage("46237", CALIFORNIA)).toMatchObject({ cdip: "142", owner: null, data_from: "Scripps Institution of Oceanography", hull: "Waverider Buoy", water_depth_m: 16.76 });
	});

	it("reads an NDBC buoy's hull, payload and sensor heights, and stops before the nearby-station tables", () => {
		expect(parseStationPage("46042", NDBC)).toMatchObject({
			cdip: null,
			owner: "National Data Buoy Center",
			hull: "3-meter foam buoy w/ seal cage",
			payload: ["SCOOP payload"],
			air_temp_height_m: 3.7,
			anemometer_height_m: 4.1,
			sea_temp_depth_m: 1.5,
			water_depth_m: 1710,
		});
		expect(parseStationPage("46042", NDBC).watch_circle_m).toBeCloseTo(1606.6, 1);
	});

	it("refuses a page without the station's block", () => {
		expect(() => parseStationPage("51202", HAWAII)).toThrow(/no station block/);
	});
});
