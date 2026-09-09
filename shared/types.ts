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
	/** Toolchain versions whose builds failed in two independent CI runs, per key. */
	failed?: Partial<Record<ToolchainKey, string[]>>;
	/** Toolchain versions with a single CI failure, awaiting a second attempt, per key. */
	suspect?: Partial<Record<ToolchainKey, string[]>>;
	/**
	 * Toolchain versions assumed unsupported because a newer release failed
	 * with them and this release has no result of its own; maps the toolchain
	 * version to that newer release.
	 */
	inferred?: Partial<Record<ToolchainKey, Record<string, string>>>;
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
	/** The deployment that computed this document. */
	build?: string;
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
	/** Omitted means success. */
	outcome?: "success" | "failure";
	/** For failures: independent runs that failed this combination, this one included. */
	attempts?: number;
	/** The last recognisable error line of a failed build. */
	signature?: string;
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
