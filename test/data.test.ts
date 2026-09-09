import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import overrides from "../data/overrides.json";
import verified from "../data/verified.json";
import compatibilitySchema from "../schemas/compatibility.json";
import overridesSchema from "../schemas/overrides.json";
import requirementsSchema from "../schemas/requirements.json";
import verifiedSchema from "../schemas/verified.json";
import { buildDocument } from "../shared/compute";
import type { OverridesFile, VerifiedFile } from "../shared/types";

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
	it("data/overrides.json matches its schema", () => {
		const ajv = validator();
		const valid = ajv.validate(overridesSchema.$id, overrides);
		expect(ajv.errors, JSON.stringify(ajv.errors)).toBeNull();
		expect(valid).toBe(true);
	});

	it("data/verified.json matches its schema", () => {
		const ajv = validator();
		const valid = ajv.validate(verifiedSchema.$id, verified);
		expect(ajv.errors, JSON.stringify(ajv.errors)).toBeNull();
		expect(valid).toBe(true);
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
			overrides: overrides as OverridesFile,
			verified: verified as VerifiedFile,
		});
		const ajv = validator();
		const valid = ajv.validate(compatibilitySchema.$id, document);
		expect(ajv.errors, JSON.stringify(ajv.errors)).toBeNull();
		expect(valid).toBe(true);
	});
});
