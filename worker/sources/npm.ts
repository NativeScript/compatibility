import * as semver from "semver";
import type { RequirementRanges } from "../../shared/types";

const ABBREVIATED = "application/vnd.npm.install-v1+json";
const TRACKED_TAGS = ["latest", "next", "rc", "beta", "alpha"];

export interface PackageManifest {
	version: string;
	requirements?: RequirementRanges;
	publishedAt?: string;
}

export interface PackageDocument {
	distTags: Record<string, string>;
	manifests: PackageManifest[];
}

interface TrackedPackage {
	name: string;
	/** How many stable versions to keep, newest first. */
	keep: number;
}

/**
 * Full registry documents run to megabytes (the CLI's is 11 MB), so versions
 * are picked from the abbreviated document and each manifest is fetched on its
 * own; per-version manifests keep custom fields such as `nativescript`.
 */
export async function fetchPackage(
	registry: string,
	pkg: TrackedPackage,
): Promise<PackageDocument> {
	const encoded = pkg.name.replace("/", "%2F");
	const res = await fetch(`${registry}${encoded}`, {
		headers: { accept: ABBREVIATED },
	});
	if (!res.ok) {
		throw new Error(`Registry returned ${res.status} for ${pkg.name}`);
	}
	const doc = (await res.json()) as {
		"dist-tags": Record<string, string>;
		versions: Record<string, unknown>;
		time?: Record<string, string>;
	};

	const distTags = doc["dist-tags"] ?? {};
	const stable = Object.keys(doc.versions)
		.filter((version) => semver.valid(version) && !semver.prerelease(version))
		.sort(semver.rcompare)
		.slice(0, pkg.keep);
	// Only the channels people actually install from; experimental tags would
	// each add a row.
	const tagged = TRACKED_TAGS.map((tag) => distTags[tag]).filter(
		(version) => version && semver.valid(version),
	);
	const selected = Array.from(new Set([...stable, ...tagged]));

	const manifests = await Promise.all(
		selected.map(async (version) => {
			const manifestRes = await fetch(`${registry}${encoded}/${version}`);
			if (!manifestRes.ok) {
				return { version } satisfies PackageManifest;
			}
			const manifest = (await manifestRes.json()) as {
				nativescript?: { requirements?: RequirementRanges };
				engines?: { node?: string };
			};
			const requirements: RequirementRanges = {
				...manifest.nativescript?.requirements,
			};
			// The CLI's Node.js support is ordinary package metadata.
			if (manifest.engines?.node && !requirements.node) {
				requirements.node = manifest.engines.node;
			}
			return {
				version,
				requirements: Object.keys(requirements).length ? requirements : undefined,
				publishedAt: doc.time?.[version],
			} satisfies PackageManifest;
		}),
	);

	return { distTags, manifests };
}
