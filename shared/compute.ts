import * as semver from "semver";
import type {
	Advisory,
	CellState,
	CompatibilityDocument,
	OverrideEntry,
	Overrides,
	PackageCompatibility,
	RequirementRanges,
	ToolchainKey,
	ToolchainVersion,
	VerificationResult,
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

/**
 * Folds override files into requirement and advisory lists. Callers pass the
 * entries in file-name order so a later timestamp wins where two overlap.
 */
export function collectOverrides(entries: OverrideEntry[]): Overrides {
	const overrides: Overrides = { requirements: [], advisories: [] };
	for (const entry of entries) {
		const { $schema, kind, ...rest } = entry;
		if (kind === "requirements") {
			overrides.requirements.push(rest as Overrides["requirements"][number]);
		} else {
			overrides.advisories.push(rest as Advisory);
		}
	}
	return overrides;
}

export function buildDocument(input: {
	schema?: string;
	build?: string;
	generatedAt: string;
	toolchains: Record<ToolchainKey, ToolchainVersion[]>;
	packages: Array<{ spec: TrackedPackageSpec; document: PackageDocument }>;
	overrides: Overrides;
	verified: VerificationResult[];
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
			const verified = verifiedFor(spec.name, manifest.version, input.verified, "success");
			const failed = verifiedFor(spec.name, manifest.version, input.verified, "confirmed");
			const suspect = verifiedFor(spec.name, manifest.version, input.verified, "suspect");
			versions[manifest.version] = {
				requirements: requirements.ranges,
				source: requirements.source,
				verified,
				...(Object.keys(failed).length ? { failed } : {}),
				...(Object.keys(suspect).length ? { suspect } : {}),
				publishedAt: manifest.publishedAt,
			};
		}
		inferFailures(versions);
		packages[spec.name] = {
			toolchains: spec.toolchains,
			distTags: document.distTags,
			versions,
		};
	}

	return {
		...(input.schema ? { $schema: input.schema } : {}),
		schemaVersion: 1,
		...(input.build ? { build: input.build } : {}),
		generatedAt: input.generatedAt,
		toolchains: input.toolchains,
		packages,
		advisories: input.overrides.advisories,
	};
}

/**
 * A confirmed failure on a newer release is taken to apply to every older
 * release that has no result of its own for that toolchain version: what
 * 9.1.1 cannot build with, 8.9.2 will not either.
 */
export function inferFailures(versions: Record<string, VersionCompatibility>): void {
	const newestFirst = Object.keys(versions).sort(semver.rcompare);
	const failingSince: Partial<Record<ToolchainKey, Record<string, string>>> = {};

	for (const version of newestFirst) {
		const entry = versions[version];
		const inferred: VersionCompatibility["inferred"] = {};

		for (const [key, byToolchain] of Object.entries(failingSince) as Array<[ToolchainKey, Record<string, string>]>) {
			for (const [toolchainVersion, from] of Object.entries(byToolchain)) {
				const ownResult =
					entry.verified[key]?.some((v) => sameLine(v, toolchainVersion)) ||
					entry.failed?.[key]?.some((v) => sameLine(v, toolchainVersion));
				if (!ownResult) {
					(inferred[key] ??= {})[toolchainVersion] = from;
				}
			}
		}
		if (Object.keys(inferred).length) {
			entry.inferred = inferred;
		}

		for (const [key, list] of Object.entries(entry.failed ?? {}) as Array<[ToolchainKey, string[]]>) {
			for (const toolchainVersion of list) {
				(failingSince[key] ??= {})[toolchainVersion] ??= version;
			}
		}
	}
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
	overrides: Overrides,
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

export type ResultClass = "success" | "confirmed" | "suspect";

/** A failure counts once a second independent run has failed the same combination. */
export function classify(entry: VerificationResult): ResultClass {
	if ((entry.outcome ?? "success") === "success") {
		return "success";
	}
	return (entry.attempts ?? 1) >= 2 ? "confirmed" : "suspect";
}

/**
 * A successful result proves every toolchain it pinned for the runtime it
 * built, and the Node.js major for the CLI it built with. A failure only
 * speaks about the runtime's toolchains.
 */
export function verifiedPairs(
	verified: VerificationResult[],
	outcome: ResultClass = "success",
): Array<{ package: string; version: string; toolchain: ToolchainKey; toolchainVersion: string }> {
	return verified
		.filter((entry) => classify(entry) === outcome)
		.flatMap((entry) => [
			...Object.entries(entry.toolchains).map(([toolchain, toolchainVersion]) => ({
				package: entry.package,
				version: entry.version,
				toolchain: toolchain as ToolchainKey,
				toolchainVersion: toolchainVersion!,
			})),
			// A failed runtime build says nothing about the CLI's Node.js support.
			...(outcome === "success"
				? [
						{
							package: "nativescript",
							version: entry.with.nativescript,
							toolchain: "node" as ToolchainKey,
							toolchainVersion: entry.with.node,
						},
					]
				: []),
		]);
}

function verifiedFor(
	packageName: string,
	version: string,
	verified: VerificationResult[],
	outcome: ResultClass,
): VersionCompatibility["verified"] {
	const result: VersionCompatibility["verified"] = {};
	for (const pair of verifiedPairs(verified, outcome)) {
		if (pair.package !== packageName || pair.version !== version) {
			continue;
		}
		const list = (result[pair.toolchain] ??= []);
		if (!list.includes(pair.toolchainVersion)) {
			list.push(pair.toolchainVersion);
		}
	}
	for (const list of Object.values(result)) {
		list.sort((a, b) => semver.rcompare(semver.coerce(a) ?? "0.0.0", semver.coerce(b) ?? "0.0.0"));
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

	// Any success outranks failures: a combination that built once builds.
	if (entry.verified[key]?.some((verified) => sameLine(verified, toolchainVersion))) {
		const alsoFailed = entry.suspect?.[key]?.some((failed) => sameLine(failed, toolchainVersion));
		return { state: "verified", reason: alsoFailed ? "verified by CI (one other attempt failed)" : "verified by CI" };
	}
	if (entry.failed?.[key]?.some((failed) => sameLine(failed, toolchainVersion))) {
		return { state: "unsupported", reason: "build failed in two independent CI runs" };
	}
	const inferredFrom = Object.entries(entry.inferred?.[key] ?? {}).find(([failed]) =>
		sameLine(failed, toolchainVersion),
	)?.[1];
	if (inferredFrom) {
		return { state: "unsupported", reason: `assumed unsupported: ${packageName} ${inferredFrom} fails with it in CI` };
	}
	if (entry.suspect?.[key]?.some((failed) => sameLine(failed, toolchainVersion))) {
		return { state: "unverified", reason: "one CI build failed; a second attempt is pending" };
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
	/** The newest stable toolchain version and how this package version fares with it. */
	latest?: { version: string; cell: Cell };
	/** A prerelease toolchain newer than `latest`, when one is known. */
	prerelease?: { version: string; cell: Cell };
	/** When `latest` is not usable: the newest stable version that is verified or declared. */
	latestSupported?: { version: string; cell: Cell };
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
	const latest = breakdown.find((item) => !item.prerelease);
	const prerelease = breakdown.find(
		(item) => item.prerelease && (!latest || breakdown.indexOf(item) < breakdown.indexOf(latest)),
	);
	const usable = (state: CellState) => state === "verified" || state === "declared";
	const latestSupported =
		latest && !usable(latest.cell.state)
			? breakdown.find((item) => !item.prerelease && item !== latest && usable(item.cell.state))
			: undefined;

	return {
		state: verified.length ? "verified" : rawRange ? "declared" : "unverified",
		range: rawRange ? prettyRange(rawRange) : "",
		rawRange,
		source: entry?.source ?? "none",
		verified,
		advisories,
		breakdown,
		...(latest ? { latest: { version: latest.version, cell: latest.cell } } : {}),
		...(prerelease ? { prerelease: { version: prerelease.version, cell: prerelease.cell } } : {}),
		...(latestSupported ? { latestSupported: { version: latestSupported.version, cell: latestSupported.cell } } : {}),
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
