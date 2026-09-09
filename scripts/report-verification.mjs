#!/usr/bin/env node
// Appends a CI verification result to data/verified.json. Intended to be run
// by the compat-check workflow after a successful build:
//   node scripts/report-verification.mjs @nativescript/ios 9.1.0 xcode 26.2 "$RUN_URL"
import { readFileSync, writeFileSync } from "node:fs";

const [pkg, version, toolchain, toolchainVersion, evidence] = process.argv.slice(2);
if (!pkg || !version || !toolchain || !toolchainVersion) {
	console.error("usage: report-verification <package> <version> <toolchain> <toolchainVersion> [evidence]");
	process.exit(1);
}

const file = new URL("../data/verified.json", import.meta.url);
const data = JSON.parse(readFileSync(file, "utf8"));
const exists = data.results.some(
	(r) => r.package === pkg && r.version === version && r.toolchain === toolchain && r.toolchainVersion === toolchainVersion,
);
if (!exists) {
	data.results.push({ package: pkg, version, toolchain, toolchainVersion, evidence, date: new Date().toISOString().slice(0, 10) });
	data.results.sort((a, b) => `${a.package}${a.version}${a.toolchain}`.localeCompare(`${b.package}${b.version}${b.toolchain}`));
	writeFileSync(file, JSON.stringify(data, null, "\t") + "\n");
}
