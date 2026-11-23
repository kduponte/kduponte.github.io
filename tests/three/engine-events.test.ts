// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ENGINE_SHOW, hoverSystem, pinSystem, pinnedSystem, type EngineShowDetail } from "../../src/scripts/three/engine-events";

function setup() {
	const root = document.createElement("div");
	const shown: (string | null)[] = [];
	root.addEventListener(ENGINE_SHOW, (e) => shown.push((e as CustomEvent<EngineShowDetail>).detail.system));
	return { root, shown };
}

describe("engine events", () => {
	it("pins a system, and pinning it again clears the pin", () => {
		const { root, shown } = setup();
		pinSystem(root, "fuel");
		expect(pinnedSystem(root)).toBe("fuel");
		pinSystem(root, "fuel");
		expect(pinnedSystem(root)).toBeNull();
		expect(shown).toEqual(["fuel", null]);
	});

	it("shows a hovered system, then falls back to the pinned one", () => {
		const { root, shown } = setup();
		pinSystem(root, "cooling");
		hoverSystem(root, "oil");
		hoverSystem(root, "oil"); // no repeat while nothing changes
		hoverSystem(root, null);
		expect(shown).toEqual(["cooling", "oil", "cooling"]);
		expect(pinnedSystem(root)).toBe("cooling");
	});
});
