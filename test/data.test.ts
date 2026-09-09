import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import compatibilitySchema from "../schemas/compatibility.json";
import overridesSchema from "../schemas/overrides.json";
import requirementsSchema from "../schemas/requirements.json";
import verifiedSchema from "../schemas/verified.json";
import { buildDocument, collectOverrides } from "../shared/compute";
import type { OverrideEntry, VerificationResult } from "../shared/types";

const verifiedFiles = import.meta.glob("../data/verified/**/*.json", { eager: true, import: "default" }) as Record<string, VerificationResult>;
const overrideFiles = import.meta.glob("../data/overrides/*.json", { eager: true, import: "default" }) as Record<string, OverrideEntry>;
const STAMP = /^\d{8}T\d{6}Z_/;

function validator() {
	const ajv = new Ajv({ strict: false, allErrors: true });
	addFormats(ajv);
	ajv.addSchema(requirementsSchema);
	ajv.addSchema(overridesSchema);
	ajv.addSchema(verifiedSchema);
	ajv.addSchema(compatibilitySchema);
	return ajv;
}

describe("data files", () => {
	it("every data/overrides entry matches its schema and is timestamped", () => {
		const ajv = validator();
		expect(Object.keys(overrideFiles).length).toBeGreaterThan(0);
		for (const [file, entry] of Object.entries(overrideFiles)) {
			const valid = ajv.validate(overridesSchema.$id, entry);
			expect(ajv.errors, `${file}: ${JSON.stringify(ajv.errors)}`).toBeNull();
			expect(valid).toBe(true);
			expect(file.split("/").pop()).toMatch(STAMP);
		}
	});

	it("every data/verified result file matches its schema and its path", () => {
		const ajv = validator();
		for (const [file, result] of Object.entries(verifiedFiles)) {
			const valid = ajv.validate(verifiedSchema.$id, result);
			expect(ajv.errors, `${file}: ${JSON.stringify(ajv.errors)}`).toBeNull();
			expect(valid).toBe(true);
			expect(file.startsWith(`../data/verified/${result.package}/`)).toBe(true);
			expect(file.split("/").pop()).toMatch(STAMP);
			expect(file.endsWith("_failure.json")).toBe(result.outcome === "failure");
		}
	});

	it("a built document matches the published document schema", () => {
		const document = buildDocument({
			generatedAt: new Date().toISOString(),
			toolchains: { xcode: [{ version: "26.3" }], cocoapods: [], compileSdk: [], buildTools: [], jdk: [], node: [] },
			packages: [
				{
					spec: { name: "@nativescript/ios", toolchains: ["xcode"], keep: 1 },
					document: { distTags: { latest: "9.1.0" }, manifests: [{ version: "9.1.0", requirements: { xcode: ">=16" } }] },
				},
			],
			overrides: collectOverrides(Object.values(overrideFiles)),
			verified: Object.values(verifiedFiles),
		});
		const ajv = validator();
		const valid = ajv.validate(compatibilitySchema.$id, document);
		expect(ajv.errors, JSON.stringify(ajv.errors)).toBeNull();
		expect(valid).toBe(true);
	});
});
