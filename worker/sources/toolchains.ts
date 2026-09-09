import * as semver from "semver";
import staticToolchains from "../../data/toolchains.json";
import type { ToolchainKey, ToolchainVersion } from "../../shared/types";

const XCODE_FEED = "https://xcodereleases.com/data.json";
const NODE_FEED = "https://nodejs.org/dist/index.json";
const COCOAPODS_FEED = "https://rubygems.org/api/v1/versions/cocoapods.json";

/**
 * Toolchain columns come from public release feeds where one exists, so a new
 * Xcode shows up as an unverified column the day it ships. Android SDK levels
 * and JDK releases have no machine-readable feed and live in data/toolchains.json.
 */
export async function fetchToolchains(): Promise<
	Record<ToolchainKey, ToolchainVersion[]>
> {
	const [xcode, node, cocoapods] = await Promise.all([
		safely(fetchXcode, staticToolchains.xcode),
		safely(fetchNode, staticToolchains.node),
		safely(fetchCocoaPods, staticToolchains.cocoapods),
	]);

	return {
		xcode,
		cocoapods,
		node,
		compileSdk: staticToolchains.compileSdk,
		buildTools: staticToolchains.buildTools,
		jdk: staticToolchains.jdk,
	};
}

async function safely(
	load: () => Promise<ToolchainVersion[]>,
	fallback: ToolchainVersion[],
): Promise<ToolchainVersion[]> {
	try {
		const versions = await load();
		return versions.length ? versions : fallback;
	} catch (err) {
		console.warn(JSON.stringify({ event: "toolchain_feed_failed", error: String(err) }));
		return fallback;
	}
}

async function fetchXcode(): Promise<ToolchainVersion[]> {
	const releases = (await (await fetch(XCODE_FEED)).json()) as Array<{
		version: { number: string; release: { release?: boolean; beta?: number; rc?: number } };
		date: { year: number; month: number; day: number };
	}>;

	// One column per major.minor; a prerelease only appears when no final build of that line exists yet.
	const byLine = new Map<string, ToolchainVersion>();
	for (const release of releases) {
		const line = release.version.number.split(".").slice(0, 2).join(".");
		const prerelease = !release.version.release.release;
		const existing = byLine.get(line);
		if (!existing || (existing.prerelease && !prerelease)) {
			byLine.set(line, {
				version: line,
				prerelease: prerelease || undefined,
				date: isoDate(release.date),
			});
		}
	}
	return Array.from(byLine.values())
		.sort((a, b) => semver.rcompare(semver.coerce(a.version)!, semver.coerce(b.version)!))
		.slice(0, 10);
}

async function fetchNode(): Promise<ToolchainVersion[]> {
	const releases = (await (await fetch(NODE_FEED)).json()) as Array<{
		version: string;
		date: string;
	}>;
	// Latest release per major line, newest majors first.
	const byMajor = new Map<number, ToolchainVersion>();
	for (const release of releases) {
		const major = semver.major(release.version);
		if (!byMajor.has(major)) {
			byMajor.set(major, { version: release.version.replace(/^v/, ""), date: release.date });
		}
	}
	return Array.from(byMajor.entries())
		.sort(([a], [b]) => b - a)
		.slice(0, 6)
		.map(([, version]) => version);
}

async function fetchCocoaPods(): Promise<ToolchainVersion[]> {
	const versions = (await (await fetch(COCOAPODS_FEED)).json()) as Array<{
		number: string;
		prerelease: boolean;
		created_at: string;
	}>;
	return versions
		.filter((version) => !version.prerelease && semver.valid(version.number))
		.sort((a, b) => semver.rcompare(a.number, b.number))
		.slice(0, 6)
		.map((version) => ({ version: version.number, date: version.created_at.slice(0, 10) }));
}

function isoDate(date: { year: number; month: number; day: number }): string {
	return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}
