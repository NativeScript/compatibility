import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../data/verified/", import.meta.url);

/** Deterministic file key for a pinned build: sorted toolchains, then sorted pins. */
export function resultKey(toolchains, with_) {
	const part = (entries) =>
		Object.entries(entries)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([k, v]) => `${k}-${v}`);
	return [...part(toolchains), ...part(with_)].join("__");
}

export function timestamp(date = new Date()) {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** New files are timestamped so a folder lists in recording order; content decides whether a tuple is already recorded. */
export function resultPath(result, date = new Date()) {
	return new URL(`${result.package}/${timestamp(date)}_${result.version}_${resultKey(result.toolchains, result.with)}.json`, ROOT);
}

export function findRecorded(results, candidate) {
	return results.find(
		(result) =>
			result.package === candidate.package &&
			result.version === candidate.version &&
			result.with.nativescript === candidate.with.nativescript &&
			result.with.node === candidate.with.node &&
			resultKey(result.toolchains, {}) === resultKey(candidate.toolchains, {}),
	);
}

export function readResults() {
	const results = [];
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith(".json")) {
				results.push(JSON.parse(readFileSync(full, "utf8")));
			}
		}
	};
	if (existsSync(ROOT)) {
		walk(ROOT.pathname);
	}
	return results;
}
