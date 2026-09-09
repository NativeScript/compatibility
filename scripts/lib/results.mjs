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

/**
 * Timestamped so a folder lists in recording order, and suffixed by outcome so
 * a success and a failure of one combination can never share a file name.
 * Content, not the name, decides whether a combination is already recorded.
 */
export function resultPath(result, date = new Date()) {
	const suffix = result.outcome === "failure" ? "_failure" : "";
	return new URL(`${result.package}/${timestamp(date)}_${result.version}_${resultKey(result.toolchains, result.with)}${suffix}.json`, ROOT);
}

/** Toolchains recorded for the record but chosen by the job, not by the matrix. */
const INCIDENTAL = new Set(["cocoapods", "buildTools"]);

function controlled(toolchains) {
	return Object.fromEntries(Object.entries(toolchains).filter(([key]) => !INCIDENTAL.has(key)));
}

/** Records of the same pinned combination, ignoring incidental toolchains. */
export function sameCombination(a, b) {
	return (
		a.package === b.package &&
		a.version === b.version &&
		a.with.nativescript === b.with.nativescript &&
		a.with.node === b.with.node &&
		resultKey(controlled(a.toolchains), {}) === resultKey(controlled(b.toolchains), {})
	);
}

/**
 * How a combination stands: "success" if any run built it, "confirmed" after
 * two independent failures, "suspect" after one, or null if never recorded.
 */
export function status(results, candidate) {
	const matching = results.filter((result) => sameCombination(result, candidate));
	if (!matching.length) {
		return null;
	}
	if (matching.some((result) => (result.outcome ?? "success") === "success")) {
		return "success";
	}
	const attempts = Math.max(...matching.map((result) => result.attempts ?? 1));
	return attempts >= 2 ? "confirmed" : "suspect";
}

export function failedAttempts(results, candidate) {
	return results.filter((result) => sameCombination(result, candidate) && result.outcome === "failure").length;
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
