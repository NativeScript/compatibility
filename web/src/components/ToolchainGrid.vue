<script setup lang="ts">
import { computed, watch } from "vue";
import { summarizeToolchain } from "../../../shared/compute";
import { TOOLCHAIN_LABELS, type CompatibilityDocument, type ToolchainKey, type ToolchainVersion } from "../../../shared/types";
import BetaChip from "./BetaChip.vue";
import Chip from "./Chip.vue";
import ToolchainCell from "./ToolchainCell.vue";
import ToolchainDetails from "./ToolchainDetails.vue";
import type { OpenToolchainCell } from "../urlState";

const INITIAL_ROWS = 5;

/** Every column the grid ever shows, in a fixed order, so widths never depend on the data. */
const COLUMNS: Array<{ platform: string; packages: string[] }> = [
	{ platform: "iOS", packages: ["@nativescript/ios", "@nativescript/visionos"] },
	{ platform: "Android", packages: ["@nativescript/android"] },
	{ platform: "CLI", packages: ["nativescript"] },
];
const ALL_PACKAGES = COLUMNS.flatMap((group) => group.packages);
const KEYS: ToolchainKey[] = ["xcode", "cocoapods", "compileSdk", "buildTools", "jdk", "node"];

const props = defineProps<{ document: CompatibilityDocument; query: string; showPrereleases: boolean }>();

const open = defineModel<OpenToolchainCell | null>("open", { required: true });
const expanded = defineModel<string[]>("expanded", { required: true });
const normalizedQuery = computed(() => props.query.trim().toLowerCase());

interface Group {
	key: ToolchainKey;
	label: string;
	/** Packages that build with this toolchain at all. */
	packages: Set<string>;
	total: number;
	visible: ToolchainVersion[];
}

const groups = computed<Group[]>(() =>
	KEYS.flatMap((key) => {
		const label = TOOLCHAIN_LABELS[key];
		const all = props.document.toolchains[key].filter((tool) => props.showPrereleases || !tool.prerelease);
		const query = normalizedQuery.value;
		const visible = query
			? all.filter((tool) => `${label} ${tool.version}${tool.lts ? " lts" : ""}${tool.prerelease ? " beta" : ""}`.toLowerCase().includes(query))
			: expanded.value.includes(key)
				? all
				: all.slice(0, INITIAL_ROWS);
		const packages = new Set(ALL_PACKAGES.filter((name) => props.document.packages[name]?.toolchains.includes(key)));
		return visible.length && packages.size ? [{ key, label, packages, total: all.length, visible }] : [];
	}),
);

watch(groups, (list) => {
	const current = open.value;
	if (current && !list.some((group) => group.key === current.key && group.visible.some((tool) => tool.version === current.version))) {
		open.value = null;
	}
});

function summary(key: ToolchainKey, version: string, pkg: string) {
	return summarizeToolchain(props.document, key, version, pkg);
}

/** The timeline follows the prerelease toggle; the cell text is computed from stable releases regardless. */
function detailsSummary(key: ToolchainKey, version: string, pkg: string) {
	const full = summary(key, version, pkg);
	return props.showPrereleases ? full : { ...full, releases: full.releases.filter((release) => !release.prerelease) };
}

function isOpen(key: ToolchainKey, version: string, pkg?: string) {
	return open.value?.key === key && open.value.version === version && (pkg === undefined || open.value.pkg === pkg);
}

function toggle(key: ToolchainKey, version: string, pkg: string) {
	open.value = isOpen(key, version, pkg) ? null : { key, version, pkg };
}

function toggleExpanded(key: string) {
	expanded.value = expanded.value.includes(key) ? expanded.value.filter((item) => item !== key) : [...expanded.value, key];
}

function shortDate(tool: ToolchainVersion): string {
	return tool.date ? tool.date.slice(0, 7) : "";
}

const border = "border-b border-r border-neutral-200 last:border-r-0 dark:border-neutral-700/80";
const headCell = `sticky z-10 bg-neutral-50 text-center font-semibold dark:bg-neutral-900 ${border}`;
</script>

<template>
	<div class="border-b border-neutral-200 dark:border-neutral-700/80">
		<table class="w-full min-w-(--grid-min-width) table-fixed border-separate border-spacing-0 text-sm">
			<colgroup>
				<col class="w-32 md:w-40 lg:w-88" />
				<col v-for="name in ALL_PACKAGES" :key="name" />
			</colgroup>
			<thead>
				<tr>
					<th rowspan="2" :class="headCell" class="top-0 left-0 z-20 px-4 py-3 text-left align-bottom md:px-6">Toolchain</th>
					<th
						v-for="group in COLUMNS"
						:key="group.platform"
						:colspan="group.packages.length"
						:class="headCell"
						class="top-0 h-8 px-3 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-500"
					>
						{{ group.platform }}
					</th>
				</tr>
				<tr>
					<th v-for="name in ALL_PACKAGES" :key="name" :class="headCell" class="top-8 px-3 py-2.5"><code>{{ name }}</code></th>
				</tr>
			</thead>
			<tbody v-for="group in groups" :key="group.key">
				<tr>
					<th
						:colspan="ALL_PACKAGES.length + 1"
						class="border-b border-neutral-200 bg-sky-50/70 py-2 text-left font-semibold dark:border-neutral-700/80 dark:bg-sky-900/25"
					>
						<div class="sticky left-0 inline-block px-4 md:px-6">
							{{ group.label }}
							<span class="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">{{ group.total }} versions</span>
						</div>
					</th>
				</tr>
				<template v-for="tool in group.visible" :key="tool.version">
					<tr class="group">
						<th
							scope="row"
							:class="border"
							class="sticky left-0 z-[1] bg-white px-4 py-3 text-left align-top font-medium group-hover:bg-neutral-50 md:px-6 dark:bg-neutral-950 dark:group-hover:bg-neutral-800"
						>
							<span class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<code>{{ tool.version }}</code>
								<BetaChip v-if="tool.prerelease" />
								<Chip v-else-if="tool.lts" :title="`${group.label} ${tool.version} is a long-term-support line`">LTS</Chip>
							</span>
							<span v-if="tool.date" class="mt-1 block text-[11px] text-neutral-500 tabular-nums dark:text-neutral-400">{{ shortDate(tool) }}</span>
						</th>
						<template v-for="name in ALL_PACKAGES" :key="name">
							<ToolchainCell
								v-if="group.packages.has(name)"
								:summary="summary(group.key, tool.version, name)"
								:open="isOpen(group.key, tool.version, name)"
								:class="border"
								@toggle="toggle(group.key, tool.version, name)"
							/>
							<td v-else :class="border" class="hatched" aria-label="Not applicable"></td>
						</template>
					</tr>
					<tr v-if="isOpen(group.key, tool.version)">
						<td
							:colspan="ALL_PACKAGES.length + 1"
							class="border-b border-neutral-200 bg-neutral-50 px-6 py-5 dark:border-neutral-700/80 dark:bg-neutral-900"
						>
							<ToolchainDetails
								:summary="detailsSummary(group.key, tool.version, open!.pkg)"
								:toolchain="group.key"
								:version="tool.version"
								:package-name="open!.pkg"
							/>
						</td>
					</tr>
				</template>
				<tr v-if="group.total > INITIAL_ROWS && !normalizedQuery">
					<th scope="row" :class="border" class="sticky left-0 z-[1] bg-white px-4 py-2 text-left md:px-6 dark:bg-neutral-950">
						<button
							type="button"
							class="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
							@click="toggleExpanded(group.key)"
						>
							{{ expanded.includes(group.key) ? "Show less" : `Show ${group.total - INITIAL_ROWS} more` }}
						</button>
					</th>
					<td :colspan="ALL_PACKAGES.length" :class="border" class="bg-neutral-50/60 dark:bg-neutral-900/70"></td>
				</tr>
			</tbody>
		</table>
		<p v-if="!groups.length" class="sticky left-0 max-w-[100cqw] px-6 py-4 text-neutral-500 dark:text-neutral-400">No toolchains match.</p>
	</div>
</template>
