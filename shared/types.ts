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

export interface RequirementsOverride {
	package: string;
	versions: string;
	set: RequirementRanges;
	note?: string;
}

/** One file under data/overrides/, applied in file-name (timestamp) order. */
export type OverrideEntry =
	| ({ $schema?: string; kind: "requirements" } & RequirementsOverride)
	| ({ $schema?: string; kind: "advisory" } & Advisory);

/** The override entries folded into the two lists the compute model consumes. */
export interface Overrides {
	requirements: RequirementsOverride[];
	advisories: Advisory[];
}

/**
 * One CI-proven build of a runtime version with every relevant version
 * pinned, stored as its own file under data/verified/. It verifies each
 * toolchain in `toolchains` for the runtime, and the Node.js major for the
 * CLI version it was built with.
 */
export interface VerificationResult {
	$schema?: string;
	package: string;
	version: string;
	toolchains: Partial<Record<Exclude<ToolchainKey, "node">, string>>;
	with: { nativescript: string; node: string };
	resolved?: Record<string, string>;
	/** Workflow run or job URL that proved it. */
	evidence?: string;
	recordedAt: string;
}

export type CellState =
	| "verified"
	| "declared"
	| "unverified"
	| "unsupported"
	| "advisory";
