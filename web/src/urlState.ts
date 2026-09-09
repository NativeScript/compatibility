import { useUrlSearchParams } from "@vueuse/core";
import { computed } from "vue";
import type { ToolchainKey } from "../../shared/types";

export interface OpenCell {
	pkg: string;
	version: string;
	key: ToolchainKey;
}

/**
 * Page state lives in the query string so a view can be shared or reloaded:
 *   ?q=9.1&pre=1&cell=@nativescript/ios@9.1.0/xcode&all=@nativescript/ios,nativescript
 */
export function useUrlState() {
	const params = useUrlSearchParams<{ q?: string; pre?: string; cell?: string; all?: string }>("history", {
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

	const expanded = computed<string[]>({
		get: () => (params.all ? params.all.split(",").filter(Boolean) : []),
		set: (value) => {
			params.all = value.length ? value.join(",") : undefined;
		},
	});

	return { query, showPrereleases, open, expanded };
}
