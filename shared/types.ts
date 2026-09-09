/**
 * The v1 contract served at /v1/compatibility.json. Consumers (the NativeScript
 * CLI's doctor among them) read this for years, so changes within v1 must be
 * additive only.
 */
export type ToolchainKey =
	| "xcode"
	| "cocoapods"
	| "compileSdk"
	| "buildTools"
	| "jdk"
	| "node";

export const TOOLCHAIN_LABELS: Record<ToolchainKey, string> = {
	xcode: "Xcode",
	cocoapods: "CocoaPods",
	compileSdk: "Compile SDK",
	buildTools: "Build-tools",
	jdk: "JDK",
	node: "Node.js",
};

export interface ToolchainVersion {
	version: string;
	prerelease?: boolean;
	/** ISO date the version shipped, when the feed provides one. */
	date?: string;
}

export type RequirementRanges = Partial<Record<ToolchainKey, string>>;

export type RequirementSource = "manifest" | "override" | "none";

export interface VersionCompatibility {
	/** Effective semver ranges after overrides are applied. */
	requirements: RequirementRanges;
	source: RequirementSource;
	/** Toolchain versions a CI build proved to work, per key. */
	verified: Partial<Record<ToolchainKey, string[]>>;
	publishedAt?: string;
}

export interface PackageCompatibility {
	/** Which toolchains matter for this package, in display order. */
	toolchains: ToolchainKey[];
	distTags: Record<string, string>;
	versions: Record<string, VersionCompatibility>;
}

export type Severity = "error" | "warn";

export interface Advisory {
	id: string;
	package: string;
	/** Semver range of affected package versions. */
	affects: string;
	/** Toolchain conditions that trigger the advisory; all must match. */
	when: RequirementRanges;
	severity: Severity;
	message: string;
	fix?: string;
	url?: string;
}

export interface CompatibilityDocument {
	$schema?: string;
	schemaVersion: 1;
	generatedAt: string;
	toolchains: Record<ToolchainKey, ToolchainVersion[]>;
	packages: Record<string, PackageCompatibility>;
	advisories: Advisory[];
}

/** Hand-maintained inputs, see data/overrides.json. */
export interface OverridesFile {
	$schema?: string;
	requirements: Array<{
		package: string;
		versions: string;
		set: RequirementRanges;
		note?: string;
	}>;
	advisories: Advisory[];
}

/** CI-produced inputs, see data/verified.json and scripts/report-verification.mjs. */
export interface VerifiedFile {
	$schema?: string;
	results: Array<{
		package: string;
		version: string;
		toolchain: ToolchainKey;
		toolchainVersion: string;
		/** Workflow run or job URL that proved it. */
		evidence?: string;
		date?: string;
	}>;
}

export type CellState =
	| "verified"
	| "declared"
	| "unverified"
	| "unsupported"
	| "advisory";
