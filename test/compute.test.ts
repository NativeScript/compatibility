import { describe, expect, it } from "vitest";
import { buildDocument, cellFor, effectiveRequirements, matchingAdvisories } from "../shared/compute";
import type { CompatibilityDocument, OverridesFile, VerifiedFile } from "../shared/types";

const overrides: OverridesFile = {
	requirements: [
		{ package: "@nativescript/ios", versions: "<9.0.0", set: { xcode: ">=15 <26" } },
	],
	advisories: [
		{
			id: "ios-xcode-27",
			package: "@nativescript/ios",
			affects: "<9.2.0",
			when: { xcode: ">=27" },
			severity: "error",
			message: "breaks",
			fix: "update",
		},
	],
};

const verified: VerifiedFile = {
	results: [
		{ package: "@nativescript/ios", version: "9.1.0", toolchain: "xcode", toolchainVersion: "26.2" },
	],
};

function document(): CompatibilityDocument {
	return buildDocument({
		generatedAt: "2026-09-09T00:00:00.000Z",
		toolchains: {
			xcode: [{ version: "27.0", prerelease: true }, { version: "26.3" }, { version: "26.2" }, { version: "16.4" }],
			cocoapods: [],
			compileSdk: [],
			buildTools: [],
			jdk: [],
			node: [],
		},
		packages: [
			{
				spec: { name: "@nativescript/ios", toolchains: ["xcode"], keep: 5 },
				document: {
					distTags: { latest: "9.1.0" },
					manifests: [
						{ version: "9.1.0", requirements: { xcode: ">=16 <27" } },
						{ version: "8.9.0" },
					],
				},
			},
		],
		overrides,
		verified,
	});
}

describe("effectiveRequirements", () => {
	it("prefers overrides for the keys they set and reports the source", () => {
		expect(effectiveRequirements("@nativescript/ios", "8.9.0", undefined, overrides)).toEqual({
			ranges: { xcode: ">=15 <26" },
			source: "override",
		});
		expect(effectiveRequirements("@nativescript/ios", "9.1.0", { xcode: ">=16" }, overrides)).toEqual({
			ranges: { xcode: ">=16" },
			source: "manifest",
		});
		expect(effectiveRequirements("@nativescript/android", "9.1.0", undefined, overrides).source).toBe("none");
	});
});

describe("cellFor", () => {
	const doc = document();

	it("ranks advisories, CI verification, declared ranges and unknowns", () => {
		expect(cellFor(doc, "@nativescript/ios", "9.1.0", "xcode", "27.0").state).toBe("unsupported");
		expect(cellFor(doc, "@nativescript/ios", "9.1.0", "xcode", "26.2").state).toBe("verified");
		expect(cellFor(doc, "@nativescript/ios", "9.1.0", "xcode", "26.3").state).toBe("declared");
		expect(cellFor(doc, "@nativescript/ios", "9.1.0", "xcode", "16.4").state).toBe("declared");
		expect(cellFor(doc, "@nativescript/ios", "8.9.0", "xcode", "16.4").state).toBe("declared");
		expect(cellFor(doc, "@nativescript/ios", "8.9.0", "xcode", "26.2").state).toBe("unverified");
	});

	it("marks versions below the declared minimum as unsupported and unknown packages as unverified", () => {
		expect(cellFor(doc, "@nativescript/ios", "8.9.0", "xcode", "14.0").state).toBe("unsupported");
		expect(cellFor(doc, "@nativescript/android", "9.0.0", "jdk", "17").state).toBe("unverified");
	});
});

describe("matchingAdvisories", () => {
	it("requires the package, the version range and every toolchain condition to match", () => {
		expect(matchingAdvisories(overrides.advisories, "@nativescript/ios", "9.1.0", { xcode: "27.0" })).toHaveLength(1);
		expect(matchingAdvisories(overrides.advisories, "@nativescript/ios", "9.2.0", { xcode: "27.0" })).toHaveLength(0);
		expect(matchingAdvisories(overrides.advisories, "@nativescript/ios", "9.1.0", { xcode: "26.3" })).toHaveLength(0);
		expect(matchingAdvisories(overrides.advisories, "@nativescript/ios", "9.1.0", {})).toHaveLength(0);
	});
});

import { prettyRange, summarizeCell } from "../shared/compute";

describe("prettyRange", () => {
	it("shortens common ranges and leaves odd ones verbatim", () => {
		expect(prettyRange(">=16")).toBe("16+");
		expect(prettyRange(">=16 <27")).toBe("16 – 26");
		expect(prettyRange(">=28 <=30")).toBe("28 – 30");
		expect(prettyRange("28")).toBe("28");
		expect(prettyRange(">=1.0.0")).toBe("1+");
		expect(prettyRange(">=17 <22")).toBe("17 – 21");
		expect(prettyRange(">=16.4 <26.2")).toBe(">=16.4 <26.2");
		expect(prettyRange("*")).toBe("any");
	});
});

describe("summarizeCell", () => {
	it("summarises range, verification, advisories and latest coverage", () => {
		const doc = document();
		const cell = summarizeCell(doc, "@nativescript/ios", "9.1.0", "xcode");
		expect(cell.state).toBe("verified");
		expect(cell.range).toBe("16 – 26");
		expect(cell.verified).toEqual(["26.2"]);
		expect(cell.advisories.map((a) => a.id)).toEqual(["ios-xcode-27"]);
		expect(cell.latestCovered).toBe(true);
		expect(cell.breakdown.map((b) => b.cell.state)).toEqual(["unsupported", "declared", "verified", "declared"]);

		const unknown = summarizeCell(doc, "@nativescript/ios", "8.9.0", "cocoapods");
		expect(unknown.state).toBe("unverified");
		expect(unknown.range).toBe("");
		expect(unknown.latestCovered).toBeUndefined();
	});
});
