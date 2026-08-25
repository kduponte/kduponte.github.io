import { describe, expect, it } from "vitest";
import { categorize, isOffTopic } from "../../scripts/toyota-truck/normalize/categorize.ts";

describe("categorize", () => {
	it("matches known failure categories from realistic thread text", () => {
		expect(categorize("Truck not running good, replaced the timing chain tensioner")).toBe("Timing chain");
		expect(categorize("Blown head gasket after overheating on the highway")).toBe("Head gasket");
		expect(categorize("Radiator and water pump replacement, still overheats")).toBe("Cooling / overheating");
		expect(categorize("Extreme rich condition, checked the throttle position sensor")).toBe("Fuel / carburetor / EFI");
		expect(categorize("Fuel pouring out of the charcoal canister")).toBe("Fuel / carburetor / EFI");
		expect(categorize("Speedometer stopped working, ECU wiring harness issue")).toBe("Electrical");
		expect(categorize("AC idle up diaphragm question")).toBe("AC / climate control");
		expect(categorize("Valve cover gasket leaking oil onto the exhaust")).toBe("Oil leaks");
		expect(categorize("Transmission won't shift, clutch feels off")).toBe("Transmission / drivetrain");
		expect(categorize("Brake caliper stuck, rotor is warped")).toBe("Steering / brakes / suspension");
		expect(categorize("Clicking in the steering column, checked the IFS knuckle")).toBe("Steering / brakes / suspension");
		expect(categorize("Frame is rusted through near the bed")).toBe("Rust / body");
	});

	it("falls back to Other / uncategorized when nothing matches", () => {
		expect(categorize("New to the forum, just bought a 4Runner")).toBe("Other / uncategorized");
	});

	it("checks categories in a fixed priority order, first match wins", () => {
		// Mentions both overheating (cooling) and a head gasket — head gasket is checked first.
		expect(categorize("Overheated and now I have a blown head gasket")).toBe("Head gasket");
	});
});

describe("isOffTopic", () => {
	it("flags forum-meta titles (sign-ups, rules, FAQ, marketplace) from the title alone", () => {
		expect(isOffTopic("Rig O da'Month Sign-Up", "Rig O da'Month Sign-Up welcome")).toBe(true);
		expect(isOffTopic("Truck FAQ", "Truck FAQ frequently asked questions")).toBe(true);
		expect(isOffTopic("1990 pickup for sale", "1990 pickup for sale, runs great")).toBe(true);
	});

	it("does not flag a real story that merely mentions 'for sale' in the body, not the title", () => {
		expect(isOffTopic("The life and times of my 1987 pickup", "The life and times of my 1987 pickup I saw it was for sale again")).toBe(false);
	});

	it("flags off-topic platforms (Land Cruiser, RAV4, 3VZE) mentioned anywhere in the text", () => {
		expect(isOffTopic("Nice truck", "Nice truck, is this a Land Cruiser?")).toBe(true);
		expect(isOffTopic("Running rough", "92 pickup 3VZE running rough")).toBe(true);
	});

	it("flags a mentioned model year of 1998 or later as a later generation", () => {
		expect(isOffTopic("Tire pressure", "Tire pressure on my 2018 Tacoma TRD Pro")).toBe(true);
	});

	it("does not flag in-scope years or trucks with no off-topic signal", () => {
		expect(isOffTopic("1993 pickup rebuild", "1993 pickup rebuild, 22RE runs great")).toBe(false);
	});
});
