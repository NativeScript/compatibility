#!/usr/bin/env node
// Emits the CI build matrix: every pinned combination of CLI version, Node.js
// major, runtime version and toolchain versions that has no result file under
// data/verified/ yet. Versions come from public feeds, so the first run is
// large and later runs only contain what new releases create. A combination
// verified once is never rebuilt.
//
//   node scripts/build-matrix.mjs            # prints the matrix as JSON
//   node scripts/build-matrix.mjs --github   # also writes outputs for $GITHUB_OUTPUT
//
// A manual run of one combination bypasses the feeds: set MANUAL_PLATFORM to
// ios or android plus MANUAL_CLI, MANUAL_NODE, MANUAL_RUNTIME and either
// MANUAL_XCODE or MANUAL_COMPILE_SDK + MANUAL_JDK. MANUAL_FORCE=true rebuilds
// a combination that is already recorded.
import { appendFileSync } from "node:fs";
import { readResults, status } from "./lib/results.mjs";

const REGISTRY = "https://registry.npmjs.org/";
const XCODE_FEED = "https://xcodereleases.com/data.json";
const NODE_FEED = "https://nodejs.org/dist/index.json";
const ANDROID_REPOSITORY = "https://dl.google.com/android/repository/repository2-3.xml";
const ADOPTIUM_RELEASES = "https://api.adoptium.net/v3/info/available_releases";
// The runner-images README lists every hosted image with its labels and readme,
// so new macOS images and Xcode preview images are discovered, not configured.
const RUNNER_IMAGES_README = "https://raw.githubusercontent.com/actions/runner-images/main/README.md";

const CLI_VERSIONS = 2; // newest stable CLI releases
const RUNTIME_VERSIONS = 2; // newest stable releases of each runtime
const NODE_MAJORS = 2; // newest even (LTS-track) Node.js majors
const XCODE_LINES = 4; // newest major.minor lines
const ANDROID_LEVELS = 3; // newest API levels
const MIN_JDK = 17;
// GitHub runs at most 256 jobs per matrix; anything beyond waits for the next run.
const MAX_JOBS_PER_MATRIX = 256;

async function json(url, init) {
	const res = await fetch(url, init);
	if (!res.ok) {
		throw new Error(`${url} → ${res.status}`);
	}
	return res.json();
}

async function text(url) {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`${url} → ${res.status}`);
	}
	return res.text();
}

function compareVersions(a, b) {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pb[i] ?? 0) - (pa[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

function sameLine(a, b) {
	const pa = String(a).split(".");
	const pb = String(b).split(".");
	const depth = Math.min(pa.length, pb.length);
	return pa.slice(0, depth).join(".") === pb.slice(0, depth).join(".");
}

async function stableVersions(name, count) {
	const doc = await json(`${REGISTRY}${name.replace("/", "%2F")}`, {
		headers: { accept: "application/vnd.npm.install-v1+json" },
	});
	return Object.keys(doc.versions)
		.filter((v) => /^\d+\.\d+\.\d+$/.test(v))
		.sort(compareVersions)
		.slice(0, count);
}

async function nodeMajors() {
	const releases = await json(NODE_FEED);
	const majors = new Set(releases.map((r) => Number(r.version.slice(1).split(".")[0])).filter((m) => m % 2 === 0));
	return [...majors].sort((a, b) => b - a).slice(0, NODE_MAJORS).map(String);
}

async function xcodeLines() {
	const releases = await json(XCODE_FEED);
	const lines = new Set();
	for (const release of releases) {
		if (release.version.release?.release) {
			lines.add(release.version.number.split(".").slice(0, 2).join("."));
		}
	}
	return [...lines].sort(compareVersions).slice(0, XCODE_LINES);
}

// macOS images from the runner-images README table: name, arch, labels, readme.
async function macosRunnerImages() {
	const readme = await text(RUNNER_IMAGES_README);
	const links = new Map(
		[...readme.matchAll(/^\[([^\]]+)\]:\s*(\S+)/gm)].map(([, ref, url]) => [ref.toLowerCase(), url]),
	);
	const images = [];
	for (const row of readme.split("\n")) {
		const cols = row.split("|").map((c) => c.trim());
		if (cols.length < 5) {
			continue;
		}
		const [, name, arch, labelCell, refCell] = cols;
		const ref = refCell.match(/^\[([^\]]+)\]$/)?.[1];
		if (!ref || !/macos|xcode/i.test(name)) {
			continue;
		}
		const url = links.get(ref.toLowerCase());
		const labels = [...labelCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
		if (!url || !labels.length) {
			continue;
		}
		images.push({
			name: name.replace(/<br>.*$/s, "").trim(),
			arch,
			// The plain label: not the "-large" size variants, and not "macos-latest", which moves.
			label: labels.find((label) => !/large|latest/.test(label)) ?? labels[0],
			readme: url.replace("github.com/", "raw.githubusercontent.com/").replace("/blob/", "/"),
			os: Number(name.match(/macOS (\d+)/)?.[1] ?? 0),
			preview: /xcode/i.test(name),
		});
	}
	// arm64 first, regular images before Xcode preview images, newest OS first.
	return images.sort(
		(a, b) => Number(b.arch === "arm64") - Number(a.arch === "arm64") || Number(a.preview) - Number(b.preview) || b.os - a.os,
	);
}

// Which runner label ships each Xcode line, from every image's readme.
async function runnerXcodes() {
	const byLine = new Map();
	for (const image of await macosRunnerImages()) {
		try {
			const readme = await text(image.readme);
			const section = readme.split(/^#+ .*Xcode.*$/m)[1] ?? readme;
			for (const [, version] of section.matchAll(/^\|\s*(\d+\.\d+(?:\.\d+)?)/gm)) {
				const line = version.split(".").slice(0, 2).join(".");
				if (!byLine.has(line)) {
					byLine.set(line, image.label);
				}
			}
		} catch (err) {
			console.warn(`${image.name} readme unavailable (${err.message})`);
		}
	}
	return byLine;
}

// The SDK repository is the only source of installable package ids: newer API
// levels publish as "android-37.2" with no plain "android-37", and build-tools
// carry their own patch versions. The compile SDK the CLI takes is the level.
async function androidLevels(count = ANDROID_LEVELS) {
	const xml = await text(ANDROID_REPOSITORY);
	const platforms = [...xml.matchAll(/path="platforms;(android-(\d+)(?:\.(\d+))?)"/g)].map((m) => ({
		id: m[1],
		level: Number(m[2]),
		minor: Number(m[3] ?? 0),
	}));
	const buildTools = [...xml.matchAll(/path="build-tools;(\d+)\.(\d+)\.(\d+)"/g)]
		.map((m) => ({ id: `${m[1]}.${m[2]}.${m[3]}`, major: Number(m[1]), rank: [Number(m[1]), Number(m[2]), Number(m[3])] }))
		.sort((a, b) => b.rank[0] - a.rank[0] || b.rank[1] - a.rank[1] || b.rank[2] - a.rank[2]);

	const byLevel = new Map();
	for (const platform of platforms) {
		const current = byLevel.get(platform.level);
		if (!current || platform.minor > current.minor) {
			byLevel.set(platform.level, platform);
		}
	}

	return [...byLevel.values()]
		.sort((a, b) => b.level - a.level)
		.slice(0, count)
		.map((platform) => ({
			compileSdk: String(platform.level),
			platform: platform.id,
			buildTools: (buildTools.find((tools) => tools.major === platform.level) ?? buildTools[0]).id,
		}));
}

async function jdkReleases() {
	const info = await json(ADOPTIUM_RELEASES);
	return info.available_lts_releases.filter((v) => v >= MIN_JDK).map(String);
}

const recorded = readResults();

// A success is final and a failure confirmed by two independent runs is
// final; a single failure stays eligible so a later run can retry it on a
// different runner.
function isRecorded(candidate) {
	const current = status(recorded, candidate);
	return current === "success" || current === "confirmed";
}

function emit(matrix) {
	console.log(JSON.stringify(matrix, null, 2));
	if (process.argv.includes("--github") && process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `ios=${JSON.stringify(matrix.ios)}\n`);
		appendFileSync(process.env.GITHUB_OUTPUT, `android=${JSON.stringify(matrix.android)}\n`);
		appendFileSync(process.env.GITHUB_OUTPUT, `has_ios=${matrix.ios.length > 0}\n`);
		appendFileSync(process.env.GITHUB_OUTPUT, `has_android=${matrix.android.length > 0}\n`);
	}
}

async function manualMatrix(env) {
	const platform = env.MANUAL_PLATFORM;
	if (!platform || platform === "feed-driven") {
		return null;
	}
	const required = (name) => {
		if (!env[name]) {
			throw new Error(`${name} is required for a manual ${platform} run`);
		}
		return env[name];
	};
	const base = { cli: required("MANUAL_CLI"), node: required("MANUAL_NODE"), runtime: required("MANUAL_RUNTIME") };
	const force = env.MANUAL_FORCE === "true";
	const matrix = { ios: [], android: [], deferred: { ios: 0, android: 0 }, manual: true };

	if (platform === "ios") {
		const xcode = required("MANUAL_XCODE");
		const runners = await runnerXcodes();
		if (!runners.has(xcode)) {
			throw new Error(`no GitHub macOS runner image ships Xcode ${xcode} (known: ${[...runners.keys()].join(", ")})`);
		}
		const job = { ...base, xcode, runner: runners.get(xcode) };
		const result = { package: "@nativescript/ios", version: job.runtime, toolchains: { xcode: job.xcode }, with: { nativescript: job.cli, node: job.node } };
		if (force || !isRecorded(result)) {
			matrix.ios.push(job);
		}
	} else if (platform === "android") {
		const compileSdk = required("MANUAL_COMPILE_SDK");
		const level = (await androidLevels(Infinity)).find((item) => item.compileSdk === compileSdk);
		if (!level) {
			throw new Error(`no installable platform for API level ${compileSdk} in the SDK repository`);
		}
		const job = { ...base, ...level, jdk: required("MANUAL_JDK") };
		const result = {
			package: "@nativescript/android",
			version: job.runtime,
			toolchains: { compileSdk: job.compileSdk, jdk: job.jdk },
			with: { nativescript: job.cli, node: job.node },
		};
		if (force || !isRecorded(result)) {
			matrix.android.push(job);
		}
	} else {
		throw new Error(`MANUAL_PLATFORM must be ios or android, got ${platform}`);
	}
	if (!matrix.ios.length && !matrix.android.length) {
		console.warn("that combination is already recorded; set MANUAL_FORCE=true to rebuild it");
	}
	return matrix;
}

const manual = await manualMatrix(process.env);
if (manual) {
	emit(manual);
	process.exit(0);
}

const [clis, nodes, iosRuntimes, androidRuntimes, xcodes, installedXcodes, levels, jdks] = await Promise.all([
	stableVersions("nativescript", CLI_VERSIONS),
	nodeMajors(),
	stableVersions("@nativescript/ios", RUNTIME_VERSIONS),
	stableVersions("@nativescript/android", RUNTIME_VERSIONS),
	xcodeLines(),
	runnerXcodes(),
	androidLevels(),
	jdkReleases(),
]);

// Lines a runner ships that are newer than the newest stable feed line are
// betas; they join the matrix so a new Xcode is exercised before it ships.
const newestStable = xcodes[0];
const betaLines = [...installedXcodes.keys()].filter((line) => compareVersions(line, newestStable) < 0);
const xcodeLinesToTest = [...new Set([...betaLines, ...xcodes])].filter((line) => installedXcodes.has(line));

const ios = [];
for (const cli of clis) {
	for (const node of nodes) {
		for (const runtime of iosRuntimes) {
			for (const xcode of xcodeLinesToTest) {
				const result = { package: "@nativescript/ios", version: runtime, toolchains: { xcode }, with: { nativescript: cli, node } };
				if (!isRecorded(result)) {
					ios.push({ cli, node, runtime, xcode, runner: installedXcodes.get(xcode) });
				}
			}
		}
	}
}

const android = [];
for (const cli of clis) {
	for (const node of nodes) {
		for (const runtime of androidRuntimes) {
			for (const level of levels) {
				for (const jdk of jdks) {
					// build-tools is chosen for the level, not a controlled dimension, so it is not part of the identity.
					const result = {
						package: "@nativescript/android",
						version: runtime,
						toolchains: { compileSdk: level.compileSdk, jdk },
						with: { nativescript: cli, node },
					};
					if (!isRecorded(result)) {
						android.push({ cli, node, runtime, ...level, jdk });
					}
				}
			}
		}
	}
}

const matrix = {
	ios: ios.slice(0, MAX_JOBS_PER_MATRIX),
	android: android.slice(0, MAX_JOBS_PER_MATRIX),
	deferred: { ios: Math.max(0, ios.length - MAX_JOBS_PER_MATRIX), android: Math.max(0, android.length - MAX_JOBS_PER_MATRIX) },
	feeds: { clis, nodes, iosRuntimes, androidRuntimes, xcodes, runners: Object.fromEntries(installedXcodes), levels, jdks },
};

emit(matrix);
