import { describe, expect, it } from "vitest";
import { buildDocument, cellFor, effectiveRequirements, matchingAdvisories } from "../shared/compute";
import type { CompatibilityDocument, Overrides, VerificationResult } from "../shared/types";

const overrides: Overrides = {
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

const verified: VerificationResult[] = [
	{
		package: "@nativescript/ios",
		version: "9.1.0",
		toolchains: { xcode: "26.2" },
		with: { nativescript: "9.1.1", node: "22" },
		recordedAt: "2026-09-01T00:00:00Z",
	},
];

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
		expect(cell.latest).toMatchObject({ version: "26.3", cell: { state: "declared" } });
		expect(cell.prerelease).toMatchObject({ version: "27.0", cell: { state: "unsupported" } });
		expect(cell.breakdown.map((b) => b.cell.state)).toEqual(["unsupported", "declared", "verified", "declared"]);

		const unknown = summarizeCell(doc, "@nativescript/ios", "8.9.0", "cocoapods");
		expect(unknown.state).toBe("unverified");
		expect(unknown.range).toBe("");
		expect(unknown.latest).toBeUndefined();
	});
});

import { verifiedPairs } from "../shared/compute";

describe("verifiedPairs", () => {
	it("derives runtime toolchain pairs and the CLI's Node.js pair from one build", () => {
		expect(verifiedPairs(verified)).toEqual([
			{ package: "@nativescript/ios", version: "9.1.0", toolchain: "xcode", toolchainVersion: "26.2" },
			{ package: "nativescript", version: "9.1.1", toolchain: "node", toolchainVersion: "22" },
		]);
	});
});

import { collectOverrides } from "../shared/compute";

describe("collectOverrides", () => {
	it("splits entries by kind and drops the file-only fields", () => {
		expect(
			collectOverrides([
				{ $schema: "x", kind: "requirements", package: "p", versions: "*", set: { jdk: ">=17" } },
				{ $schema: "x", kind: "advisory", id: "a", package: "p", affects: "*", when: { jdk: ">=25" }, severity: "warn", message: "m" },
			]),
		).toEqual({
			requirements: [{ package: "p", versions: "*", set: { jdk: ">=17" } }],
			advisories: [{ id: "a", package: "p", affects: "*", when: { jdk: ">=25" }, severity: "warn", message: "m" }],
		});
	});
});

describe("failed builds", () => {
	const doc = () =>
		buildDocument({
			generatedAt: "2026-09-09T00:00:00.000Z",
			toolchains: { xcode: [], cocoapods: [], compileSdk: [], buildTools: [], jdk: [{ version: "25" }, { version: "21" }, { version: "17" }], node: [{ version: "24.0.0" }] },
			packages: [
				{
					spec: { name: "@nativescript/android", toolchains: ["jdk"], keep: 5 },
					document: { distTags: {}, manifests: [{ version: "9.1.1", requirements: { jdk: ">=17" } }] },
				},
				{
					spec: { name: "nativescript", toolchains: ["node"], keep: 5 },
					document: { distTags: {}, manifests: [{ version: "9.1.1", requirements: { node: ">=20" } }] },
				},
			],
			overrides: { requirements: [], advisories: [] },
			verified: [
				{ package: "@nativescript/android", version: "9.1.1", toolchains: { jdk: "25" }, with: { nativescript: "9.1.1", node: "24" }, outcome: "failure", attempts: 2, recordedAt: "2026-09-09T00:00:00Z" },
				{ package: "@nativescript/android", version: "9.1.1", toolchains: { jdk: "21" }, with: { nativescript: "9.1.1", node: "24" }, outcome: "failure", attempts: 1, recordedAt: "2026-09-09T00:00:00Z" },
				{ package: "@nativescript/android", version: "9.1.1", toolchains: { jdk: "17" }, with: { nativescript: "9.1.0", node: "24" }, outcome: "failure", attempts: 1, recordedAt: "2026-09-09T00:00:00Z" },
				{ package: "@nativescript/android", version: "9.1.1", toolchains: { jdk: "17" }, with: { nativescript: "9.1.1", node: "24" }, recordedAt: "2026-09-09T00:00:00Z" },
			],
		});

	it("only a failure confirmed by two runs marks a cell unsupported", () => {
		expect(cellFor(doc(), "@nativescript/android", "9.1.1", "jdk", "25")).toMatchObject({ state: "unsupported", reason: "build failed in two independent CI runs" });
		expect(cellFor(doc(), "@nativescript/android", "9.1.1", "jdk", "21")).toMatchObject({ state: "unverified", reason: "one CI build failed; a second attempt is pending" });
	});

	it("a success outranks a sibling failure and only successes prove the CLI's Node.js support", () => {
		expect(cellFor(doc(), "@nativescript/android", "9.1.1", "jdk", "17")).toMatchObject({ state: "verified", reason: "verified by CI (one other attempt failed)" });
		expect(doc().packages["nativescript"].versions["9.1.1"].verified).toEqual({ node: ["24"] });
		expect(doc().packages["@nativescript/android"].versions["9.1.1"].failed).toEqual({ jdk: ["25"] });
		expect(doc().packages["@nativescript/android"].versions["9.1.1"].suspect).toEqual({ jdk: ["21", "17"] });
	});
});

describe("latest supported", () => {
	it("names the newest usable version when the newest stable one is not", () => {
		const doc = buildDocument({
			generatedAt: "2026-09-09T00:00:00.000Z",
			toolchains: { xcode: [], cocoapods: [], compileSdk: [], buildTools: [], jdk: [{ version: "26", prerelease: true }, { version: "25" }, { version: "21" }, { version: "17" }], node: [] },
			packages: [
				{
					spec: { name: "@nativescript/android", toolchains: ["jdk"], keep: 5 },
					document: { distTags: {}, manifests: [{ version: "9.1.1", requirements: { jdk: ">=17" } }] },
				},
			],
			overrides: { requirements: [], advisories: [] },
			verified: [
				{ package: "@nativescript/android", version: "9.1.1", toolchains: { jdk: "25" }, with: { nativescript: "9.1.1", node: "24" }, outcome: "failure", attempts: 2, recordedAt: "2026-09-09T00:00:00Z" },
				{ package: "@nativescript/android", version: "9.1.1", toolchains: { jdk: "21" }, with: { nativescript: "9.1.1", node: "24" }, recordedAt: "2026-09-09T00:00:00Z" },
			],
		});
		const cell = summarizeCell(doc, "@nativescript/android", "9.1.1", "jdk");
		expect(cell.latest).toMatchObject({ version: "25", cell: { state: "unsupported" } });
		expect(cell.latestSupported).toMatchObject({ version: "21", cell: { state: "verified" } });
		expect(cell.prerelease).toMatchObject({ version: "26" });
		expect(summarizeCell(doc, "@nativescript/android", "9.1.1", "jdk").latestSupported?.version).not.toBe("17");
	});
});

describe("inferred failures", () => {
	it("cascade a confirmed failure to older releases without their own result", () => {
		const build = (version: string, extra: object = {}) => ({
			package: "@nativescript/android", version, toolchains: { jdk: "25" }, with: { nativescript: "9.1.1", node: "24" }, recordedAt: "2026-09-09T00:00:00Z", ...extra,
		});
		const doc = buildDocument({
			generatedAt: "2026-09-09T00:00:00.000Z",
			toolchains: { xcode: [], cocoapods: [], compileSdk: [], buildTools: [], jdk: [{ version: "25" }, { version: "21" }], node: [] },
			packages: [
				{
					spec: { name: "@nativescript/android", toolchains: ["jdk"], keep: 5 },
					document: {
						distTags: {},
						manifests: [{ version: "9.1.1" }, { version: "9.0.0" }, { version: "8.9.2" }, { version: "8.8.0" }].map((m) => ({ ...m, requirements: { jdk: ">=17" } })),
					},
				},
			],
			overrides: { requirements: [], advisories: [] },
			verified: [
				build("9.1.1", { outcome: "failure", attempts: 2 }),
				build("8.9.2"),
			],
		});
		expect(cellFor(doc, "@nativescript/android", "9.1.1", "jdk", "25").state).toBe("unsupported");
		expect(cellFor(doc, "@nativescript/android", "9.0.0", "jdk", "25")).toMatchObject({
			state: "unsupported",
			reason: "assumed unsupported: @nativescript/android 9.1.1 fails with it in CI",
		});
		expect(cellFor(doc, "@nativescript/android", "8.9.2", "jdk", "25").state).toBe("verified");
		expect(cellFor(doc, "@nativescript/android", "8.8.0", "jdk", "25").state).toBe("unsupported");
		expect(cellFor(doc, "@nativescript/android", "9.0.0", "jdk", "21").state).toBe("declared");
		expect(doc.packages["@nativescript/android"].versions["9.0.0"].inferred).toEqual({ jdk: { "25": "9.1.1" } });
		expect(doc.packages["@nativescript/android"].versions["9.1.1"].inferred).toBeUndefined();
	});
});
