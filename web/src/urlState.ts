import { useUrlSearchParams } from "@vueuse/core";
import { computed } from "vue";
import type { ToolchainKey } from "../../shared/types";

export interface OpenCell {
	pkg: string;
	version: string;
	key: ToolchainKey;
}

/** A cell of the toolchain-first view: one toolchain version crossed with one package. */
export interface OpenToolchainCell {
	key: ToolchainKey;
	version: string;
	pkg: string;
}

/**
 * Page state lives in the query string so a view can be shared or reloaded:
 *   ?q=9.1&pre=1&cell=@nativescript/ios@9.1.0/xcode&all=@nativescript/ios,nativescript
 *   ?view=toolchain&tc=xcode@26.4/@nativescript/ios&all=xcode
 */
export function useUrlState() {
	const params = useUrlSearchParams<{ q?: string; pre?: string; cell?: string; all?: string; view?: string; tc?: string }>("history", {
		removeNullishValues: true,
		removeFalsyValues: true,
		write: true,
	});

	const query = computed({
		get: () => params.q ?? "",
		set: (value) => {
			params.q = value.trim() ? value : undefined;
		},
	});

	const showPrereleases = computed({
		get: () => params.pre === "1",
		set: (value) => {
			params.pre = value ? "1" : undefined;
		},
	});

	const open = computed<OpenCell | null>({
		get: () => {
			const match = params.cell?.match(/^(.+)@([^@/]+)\/([a-zA-Z]+)$/);
			return match ? { pkg: match[1], version: match[2], key: match[3] as ToolchainKey } : null;
		},
		set: (value) => {
			params.cell = value ? `${value.pkg}@${value.version}/${value.key}` : undefined;
		},
	});

	const byToolchain = computed({
		get: () => params.view === "toolchain",
		set: (value) => {
			params.view = value ? "toolchain" : undefined;
		},
	});

	const openToolchain = computed<OpenToolchainCell | null>({
		get: () => {
			const match = params.tc?.match(/^([a-zA-Z]+)@([^/]+)\/(.+)$/);
			return match ? { key: match[1] as ToolchainKey, version: match[2], pkg: match[3] } : null;
		},
		set: (value) => {
			params.tc = value ? `${value.key}@${value.version}/${value.pkg}` : undefined;
		},
	});

	const expanded = computed<string[]>({
		get: () => (params.all ? params.all.split(",").filter(Boolean) : []),
		set: (value) => {
			params.all = value.length ? value.join(",") : undefined;
		},
	});

	return { query, showPrereleases, open, expanded, byToolchain, openToolchain };
}
