/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { onProfileChange, dispatchProfileChange, PROFILE_CHANGE_EVENT } from "../../../src/scripts/surf-volume/state";
import type { ComparisonResult } from "../../../src/lib/surf-volume/types";

const fakeResult: ComparisonResult = {
	profile: { weight_lb: 180, skill: "intermediate" },
	rows: [],
	consensus: { median: null, min: null, max: null, q25: null, q75: null, iqr: null, mad: null, relative_iqr: null, agreement_label: "insufficient_data", n_contributing_systems: 0 },
};

describe("profile-change pub/sub", () => {
	it("delivers the dispatched detail to a listener", () => {
		let received: ComparisonResult | null = null;
		const unsubscribe = onProfileChange((result) => {
			received = result;
		});

		dispatchProfileChange(fakeResult);

		expect(received).toEqual(fakeResult);
		unsubscribe();
	});

	it("stops delivering events after unsubscribe", () => {
		let callCount = 0;
		const unsubscribe = onProfileChange(() => {
			callCount++;
		});
		unsubscribe();

		dispatchProfileChange(fakeResult);

		expect(callCount).toBe(0);
	});

	it("dispatches a real CustomEvent on document with the expected type", () => {
		let sawEvent = false;
		document.addEventListener(PROFILE_CHANGE_EVENT, (e) => {
			sawEvent = true;
			expect(e).toBeInstanceOf(CustomEvent);
		});

		dispatchProfileChange(fakeResult);

		expect(sawEvent).toBe(true);
	});

	it("multiple listeners each receive the same dispatched profile change", () => {
		const seen: number[] = [];
		const unsub1 = onProfileChange(() => seen.push(1));
		const unsub2 = onProfileChange(() => seen.push(2));

		dispatchProfileChange(fakeResult);

		expect(seen.sort()).toEqual([1, 2]);
		unsub1();
		unsub2();
	});
});
