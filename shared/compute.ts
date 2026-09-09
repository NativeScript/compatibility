import * as semver from "semver";
import type {
	Advisory,
	CellState,
	CompatibilityDocument,
	OverridesFile,
	PackageCompatibility,
	RequirementRanges,
	ToolchainKey,
	ToolchainVersion,
	VerifiedFile,
	VersionCompatibility,
} from "./types";
import type { PackageDocument } from "../worker/sources/npm";

export interface TrackedPackageSpec {
	name: string;
	toolchains: ToolchainKey[];
	keep: number;
}

export const TRACKED_PACKAGES: TrackedPackageSpec[] = [
	{ name: "@nativescript/ios", toolchains: ["xcode", "cocoapods"], keep: 12 },
	{ name: "@nativescript/android", toolchains: ["compileSdk", "buildTools", "jdk"], keep: 12 },
	{ name: "@nativescript/visionos", toolchains: ["xcode"], keep: 6 },
	{ name: "nativescript", toolchains: ["node"], keep: 8 },
];

export function buildDocument(input: {
	schema?: string;
	generatedAt: string;
	toolchains: Record<ToolchainKey, ToolchainVersion[]>;
	packages: Array<{ spec: TrackedPackageSpec; document: PackageDocument }>;
	overrides: OverridesFile;
	verified: VerifiedFile;
}): CompatibilityDocument {
	const packages: Record<string, PackageCompatibility> = {};

	for (const { spec, document } of input.packages) {
		const versions: Record<string, VersionCompatibility> = {};
		for (const manifest of document.manifests) {
			const requirements = effectiveRequirements(
				spec.name,
				manifest.version,
				manifest.requirements,
				input.overrides,
			);
			versions[manifest.version] = {
				requirements: requirements.ranges,
				source: requirements.source,
				verified: verifiedFor(spec.name, manifest.version, input.verified),
				publishedAt: manifest.publishedAt,
			};
		}
		packages[spec.name] = {
			toolchains: spec.toolchains,
			distTags: document.distTags,
			versions,
		};
	}

	return {
		...(input.schema ? { $schema: input.schema } : {}),
		schemaVersion: 1,
		generatedAt: input.generatedAt,
		toolchains: input.toolchains,
		packages,
		advisories: input.overrides.advisories,
	};
}

/**
 * Overrides win over the manifest for the keys they set: they exist to
 * describe runtimes that predate the requirements block and to correct a
 * published bound after the fact.
 */
export function effectiveRequirements(
	packageName: string,
	version: string,
	published: RequirementRanges | undefined,
	overrides: OverridesFile,
): { ranges: RequirementRanges; source: VersionCompatibility["source"] } {
	const ranges: RequirementRanges = { ...published };
	let overridden = false;
	for (const entry of overrides.requirements) {
		if (entry.package !== packageName) {
			continue;
		}
		if (!semver.satisfies(version, entry.versions, { includePrerelease: true })) {
			continue;
		}
		Object.assign(ranges, entry.set);
		overridden = true;
	}
	const source = overridden ? "override" : published ? "manifest" : "none";
	return { ranges, source };
}

function verifiedFor(
	packageName: string,
	version: string,
	verified: VerifiedFile,
): VersionCompatibility["verified"] {
	const result: VersionCompatibility["verified"] = {};
	for (const entry of verified.results) {
		if (entry.package !== packageName || entry.version !== version) {
			continue;
		}
		(result[entry.toolchain] ??= []).push(entry.toolchainVersion);
	}
	return result;
}

export function matchingAdvisories(
	advisories: Advisory[],
	packageName: string,
	version: string,
	toolchain: Partial<Record<ToolchainKey, string>>,
): Advisory[] {
	return advisories.filter((advisory) => {
		if (advisory.package !== packageName) {
			return false;
		}
		if (!semver.satisfies(version, advisory.affects, { includePrerelease: true })) {
			return false;
		}
		return Object.entries(advisory.when).every(([key, range]) => {
			const installed = toolchain[key as ToolchainKey];
			return installed !== undefined && inRange(installed, range!);
		});
	});
}

/** Coerces loose toolchain versions ("37", "16.4", "android-35") before matching. */
export function inRange(version: string, range: string): boolean {
	const coerced = semver.coerce(version);
	return !!coerced && semver.satisfies(coerced, range, { includePrerelease: true });
}

export interface Cell {
	state: CellState;
	reason: string;
	advisory?: Advisory;
}

export function cellFor(
	document: CompatibilityDocument,
	packageName: string,
	version: string,
	key: ToolchainKey,
	toolchainVersion: string,
): Cell {
	const entry = document.packages[packageName]?.versions[version];
	if (!entry) {
		return { state: "unverified", reason: "no data" };
	}

	const [advisory] = matchingAdvisories(document.advisories, packageName, version, {
		[key]: toolchainVersion,
	});
	if (advisory) {
		return {
			state: advisory.severity === "error" ? "unsupported" : "advisory",
			reason: advisory.message,
			advisory,
		};
	}

	if (entry.verified[key]?.some((verified) => sameLine(verified, toolchainVersion))) {
		return { state: "verified", reason: "verified by CI" };
	}

	const range = entry.requirements[key];
	if (!range) {
		return { state: "unverified", reason: "no requirement published" };
	}
	if (inRange(toolchainVersion, range)) {
		return { state: "declared", reason: `within declared range ${range}` };
	}
	const coerced = semver.coerce(toolchainVersion);
	if (coerced && semver.gtr(coerced, range, { includePrerelease: true })) {
		return { state: "unverified", reason: `newer than declared range ${range}` };
	}
	return { state: "unsupported", reason: `below declared range ${range}` };
}

function sameLine(a: string, b: string): boolean {
	const ca = semver.coerce(a);
	const cb = semver.coerce(b);
	if (!ca || !cb) {
		return a === b;
	}
	// Verification of 26.2 covers the 26.2 column; verification of "17" covers JDK 17.x.
	const precision = Math.min(a.split(".").length, b.split(".").length);
	return precision >= 2
		? ca.major === cb.major && ca.minor === cb.minor
		: ca.major === cb.major;
}

export interface CellSummary {
	state: "verified" | "declared" | "unverified";
	/** Human-readable range such as "16 – 26" or "17+"; empty when nothing is declared. */
	range: string;
	rawRange?: string;
	source: VersionCompatibility["source"];
	verified: string[];
	advisories: Advisory[];
	/** State of every known toolchain version, newest first, for the detail view. */
	breakdown: Array<{ version: string; prerelease?: boolean; cell: Cell }>;
	/** Whether the newest stable toolchain version is covered by the declared range. */
	latestCovered: boolean | undefined;
}

/**
 * One cell per package version and toolchain, in the style of a browser
 * support table: the supported range at a glance, the per-version facts on
 * demand.
 */
export function summarizeCell(
	document: CompatibilityDocument,
	packageName: string,
	version: string,
	key: ToolchainKey,
): CellSummary {
	const entry = document.packages[packageName]?.versions[version];
	const rawRange = entry?.requirements[key];
	const verified = entry?.verified[key] ?? [];
	const advisories = document.advisories.filter(
		(advisory) =>
			advisory.package === packageName &&
			advisory.when[key] !== undefined &&
			semver.satisfies(version, advisory.affects, { includePrerelease: true }),
	);
	const breakdown = document.toolchains[key].map((tool) => ({
		version: tool.version,
		prerelease: tool.prerelease,
		cell: cellFor(document, packageName, version, key, tool.version),
	}));
	const latestStable = document.toolchains[key].find((tool) => !tool.prerelease);

	return {
		state: verified.length ? "verified" : rawRange ? "declared" : "unverified",
		range: rawRange ? prettyRange(rawRange) : "",
		rawRange,
		source: entry?.source ?? "none",
		verified,
		advisories,
		breakdown,
		latestCovered:
			rawRange && latestStable ? inRange(latestStable.version, rawRange) : undefined,
	};
}

/** "16" for ">=16", "16 – 26" for ">=16 <27", "28 – 30" for ">=28 <=30"; anything else verbatim. */
export function prettyRange(range: string): string {
	let parsed: semver.Range;
	try {
		parsed = new semver.Range(range);
	} catch {
		return range;
	}
	if (parsed.set.length !== 1) {
		return range;
	}
	let min: string | undefined;
	let max: string | undefined;
	for (const comparator of parsed.set[0]) {
		if (!comparator.semver?.version) {
			return range === "*" ? "any" : range;
		}
		const short = shortVersion(comparator.semver.version);
		switch (comparator.operator) {
			case ">=":
			case "":
				min = short;
				break;
			case ">":
				return range;
			case "<":
				max = comparator.semver.minor === 0 && comparator.semver.patch === 0
					? String(comparator.semver.major - 1)
					: range;
				break;
			case "<=":
				max = short;
				break;
		}
	}
	if (max === range) {
		return range;
	}
	if (min && max) {
		return min === max ? min : `${min} – ${max}`;
	}
	if (min) {
		return `${min}+`;
	}
	if (max) {
		return `≤ ${max}`;
	}
	return range;
}

function shortVersion(version: string): string {
	return version.replace(/(\.0)+$/, "");
}
