#!/usr/bin/env node
// Records a successful pinned build under data/verified/. CI jobs and humans
// use the same command; an existing file is left untouched.
//
//   node scripts/report-verification.mjs --package @nativescript/ios --version 9.1.0 \
//     --toolchain xcode=26.3 --toolchain cocoapods=1.16.2 \
//     --with nativescript=9.1.1 --with node=22 --resolved node=22.23.2 --evidence <url>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { findRecorded, readResults, resultPath } from "./lib/results.mjs";

const args = process.argv.slice(2);
const options = { toolchains: {}, with: {}, resolved: {} };
for (let i = 0; i < args.length; i += 2) {
	const flag = args[i].replace(/^--/, "");
	const value = args[i + 1];
	if (["toolchain", "with", "resolved"].includes(flag)) {
		const [key, version] = value.split("=");
		options[flag === "toolchain" ? "toolchains" : flag][key] = version;
	} else {
		options[flag] = value;
	}
}

if (!options.package || !options.version || !Object.keys(options.toolchains).length || !options.with.nativescript || !options.with.node) {
	console.error("usage: report-verification --package <name> --version <v> --toolchain <key>=<v>... --with nativescript=<v> --with node=<major> [--resolved <key>=<v>...] [--evidence <url>]");
	process.exit(1);
}

const result = {
	$schema: "https://compatibility.nativescript.org/v1/schemas/verified.json",
	package: options.package,
	version: options.version,
	toolchains: options.toolchains,
	with: options.with,
	...(Object.keys(options.resolved).length ? { resolved: options.resolved } : {}),
	...(options.evidence ? { evidence: options.evidence } : {}),
	recordedAt: new Date().toISOString(),
};

const existing = findRecorded(readResults(), result);
if (existing) {
	console.log(`already recorded at ${existing.recordedAt}`);
} else {
	const file = resultPath(result);
	mkdirSync(dirname(file.pathname), { recursive: true });
	writeFileSync(file, JSON.stringify(result, null, "\t") + "\n");
	console.log(`recorded: ${file.pathname}`);
}
