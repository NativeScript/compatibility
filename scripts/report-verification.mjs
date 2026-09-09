#!/usr/bin/env node
// Records a pinned build under data/verified/. CI jobs and humans use the
// same command. A success is recorded once. A failure is recorded per
// independent run with its attempt number, so the second one confirms the
// combination as failing; a later success outranks any failure.
//
//   node scripts/report-verification.mjs --package @nativescript/ios --version 9.1.0 \
//     --toolchain xcode=26.3 --toolchain cocoapods=1.16.2 \
//     --with nativescript=9.1.1 --with node=22 --resolved node=22.23.2 --evidence <url> \
//     [--outcome failure --signature "<last error line>"]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { failedAttempts, readResults, resultPath, status } from "./lib/results.mjs";

const args = process.argv.slice(2);
const options = { toolchains: {}, with: {}, resolved: {} };
for (let i = 0; i < args.length; i += 2) {
	const flag = args[i].replace(/^--/, "");
	const value = args[i + 1];
	if (flag === "signature") {
		options.signature = value;
	} else if (["toolchain", "with", "resolved"].includes(flag)) {
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

const recorded = readResults();
const failure = options.outcome === "failure";
const candidate = { package: options.package, version: options.version, toolchains: options.toolchains, with: options.with };
const result = {
	$schema: "https://compatibility.nativescript.org/v1/schemas/verified.json",
	...candidate,
	...(Object.keys(options.resolved).length ? { resolved: options.resolved } : {}),
	...(failure ? { outcome: "failure", attempts: failedAttempts(recorded, candidate) + 1 } : {}),
	...(failure && options.signature ? { signature: options.signature.slice(0, 300) } : {}),
	...(options.evidence ? { evidence: options.evidence } : {}),
	recordedAt: new Date().toISOString(),
};

const current = status(recorded, candidate);
if (current === "success" && !failure) {
	console.log("already recorded as a success");
} else if (current === "confirmed" && failure) {
	console.log("already confirmed as failing");
} else {
	const file = resultPath(result);
	mkdirSync(dirname(file.pathname), { recursive: true });
	writeFileSync(file, JSON.stringify(result, null, "\t") + "\n");
	console.log(`recorded: ${file.pathname}`);
}
