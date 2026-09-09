import compatibilitySchema from "../schemas/compatibility.json";
import overridesSchema from "../schemas/overrides.json";
import packageSchema from "../schemas/package.json";
import requirementsSchema from "../schemas/requirements.json";
import verifiedSchema from "../schemas/verified.json";
import { buildDocument, collectOverrides, matchingAdvisories, TRACKED_PACKAGES } from "../shared/compute";
import { fetchPackage } from "./sources/npm";
import { fetchToolchains } from "./sources/toolchains";
import type { CompatibilityDocument, OverrideEntry, ToolchainKey, VerificationResult } from "../shared/types";

// Data folders are bundled at build time: CI and maintainers only add files.
function sortedEntries<T>(modules: Record<string, unknown>): T[] {
	return Object.keys(modules)
		.sort()
		.map((file) => modules[file] as T);
}
const verified = sortedEntries<VerificationResult>(
	import.meta.glob("../data/verified/**/*.json", { eager: true, import: "default" }),
);
const overrides = collectOverrides(
	sortedEntries<OverrideEntry>(import.meta.glob("../data/overrides/*.json", { eager: true, import: "default" })),
);

const SCHEMAS: Record<string, unknown> = {
	"compatibility.json": compatibilitySchema,
	"requirements.json": requirementsSchema,
	"package.json": packageSchema,
	"overrides.json": overridesSchema,
	"verified.json": verifiedSchema,
};

const KV_KEY = "document:v1";
/** Served copies older than this are refreshed in the background. */
const STALE_AFTER_MS = 60 * 60 * 1000;
const KV_TTL_SECONDS = 7 * 24 * 60 * 60;

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		try {
			if (url.pathname === "/health") {
				return Response.json({ ok: true });
			}

			// Schemas are static and answer before any data is loaded.
			const schemaMatch = url.pathname.match(/^\/v1\/schemas\/([\w.-]+)$/);
			if (schemaMatch) {
				const schema = SCHEMAS[schemaMatch[1]];
				return schema
					? Response.json(schema, {
							headers: { "content-type": "application/schema+json", ...cacheHeaders() },
						})
					: Response.json({ error: "unknown schema" }, { status: 404 });
			}

			const document = await loadDocument(env, ctx);

			if (url.pathname === "/v1/compatibility.json") {
				return Response.json(document, { headers: cacheHeaders() });
			}

			// /v1/packages/@scope/name/1.2.3?xcode=26.2&jdk=21 → effective requirements plus matching advisories
			const match = url.pathname.match(/^\/v1\/packages\/((?:@[^/]+\/)?[^/]+)\/([^/]+)$/);
			if (match) {
				const [, name, version] = match.map(decodeURIComponent);
				const entry = document.packages[name]?.versions[version];
				if (!entry) {
					return Response.json({ error: "unknown package version" }, { status: 404 });
				}
				const toolchain: Partial<Record<ToolchainKey, string>> = {};
				for (const [key, value] of url.searchParams) {
					toolchain[key as ToolchainKey] = value;
				}
				return Response.json(
					{
						package: name,
						version,
						...entry,
						advisories: matchingAdvisories(document.advisories, name, version, toolchain),
					},
					{ headers: cacheHeaders() },
				);
			}

			return new Response("Not found", { status: 404 });
		} catch (err) {
			console.error(JSON.stringify({ event: "request_failed", path: url.pathname, error: String(err) }));
			return Response.json({ error: "internal error" }, { status: 500 });
		}
	},

	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(refresh(env));
	},
} satisfies ExportedHandler<Env>;

async function loadDocument(env: Env, ctx: ExecutionContext): Promise<CompatibilityDocument> {
	const cached = await env.COMPAT_KV.get<CompatibilityDocument>(KV_KEY, "json");
	if (cached) {
		if (Date.now() - Date.parse(cached.generatedAt) > STALE_AFTER_MS) {
			ctx.waitUntil(refresh(env));
		}
		return cached;
	}
	return refresh(env);
}

async function refresh(env: Env): Promise<CompatibilityDocument> {
	const started = Date.now();
	const [toolchains, packages] = await Promise.all([
		fetchToolchains(),
		Promise.all(
			TRACKED_PACKAGES.map(async (spec) => ({
				spec,
				document: await fetchPackage(env.NPM_REGISTRY, spec),
			})),
		),
	]);

	const document = buildDocument({
		schema: "https://compatibility.nativescript.org/v1/schemas/compatibility.json",
		generatedAt: new Date().toISOString(),
		toolchains,
		packages,
		overrides,
		verified,
	});

	await env.COMPAT_KV.put(KV_KEY, JSON.stringify(document), { expirationTtl: KV_TTL_SECONDS });
	console.log(JSON.stringify({ event: "document_refreshed", ms: Date.now() - started, packages: Object.keys(document.packages) }));
	return document;
}

function cacheHeaders(): Record<string, string> {
	return {
		"cache-control": "public, max-age=300, stale-while-revalidate=3600",
		"access-control-allow-origin": "*",
	};
}
