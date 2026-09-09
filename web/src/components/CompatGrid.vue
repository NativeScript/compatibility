<script setup lang="ts">
import * as semver from "semver";
import { computed, watch } from "vue";
import { summarizeCell } from "../../../shared/compute";
import { TOOLCHAIN_LABELS, type CompatibilityDocument, type ToolchainKey } from "../../../shared/types";
import CellDetails from "./CellDetails.vue";
import CompatCell from "./CompatCell.vue";
import type { OpenCell } from "../urlState";

const INITIAL_ROWS = 5;

/** Every column the grid ever shows, in a fixed order, so widths never depend on the data. */
const COLUMNS: Array<{ platform: string; keys: ToolchainKey[] }> = [
	{ platform: "iOS", keys: ["xcode", "cocoapods"] },
	{ platform: "Android", keys: ["compileSdk", "buildTools", "jdk"] },
	{ platform: "CLI", keys: ["node"] },
];
const ALL_KEYS = COLUMNS.flatMap((group) => group.keys);

const props = defineProps<{ document: CompatibilityDocument; query: string; showPrereleases: boolean }>();

const open = defineModel<OpenCell | null>("open", { required: true });
const expanded = defineModel<string[]>("expanded", { required: true });
const normalizedQuery = computed(() => props.query.trim().toLowerCase());

interface Group {
	name: string;
	toolchains: Set<ToolchainKey>;
	tags: Map<string, string[]>;
	total: number;
	visible: string[];
}

const groups = computed<Group[]>(() =>
	Object.entries(props.document.packages).flatMap(([name, pkg]) => {
		const tags = new Map<string, string[]>();
		for (const [tag, version] of Object.entries(pkg.distTags)) {
			if (pkg.versions[version]) {
				tags.set(version, [...(tags.get(version) ?? []), tag]);
			}
		}
		const all = Object.keys(pkg.versions)
			.filter((version) => props.showPrereleases || !semver.prerelease(version))
			.sort(semver.rcompare);
		const query = normalizedQuery.value;
		const visible = query
			? all.filter((version) => `${name} ${version} ${(tags.get(version) ?? []).join(" ")}`.toLowerCase().includes(query))
			: expanded.value.includes(name)
				? all
				: all.slice(0, INITIAL_ROWS);
		return visible.length ? [{ name, toolchains: new Set(pkg.toolchains), tags, total: all.length, visible }] : [];
	}),
);

watch(groups, (list) => {
	const current = open.value;
	if (current && !list.some((group) => group.name === current.pkg && group.visible.includes(current.version))) {
		open.value = null;
	}
});

function summary(pkg: string, version: string, key: ToolchainKey) {
	return summarizeCell(props.document, pkg, version, key);
}

function isOpen(pkg: string, version: string, key?: ToolchainKey) {
	return open.value?.pkg === pkg && open.value.version === version && (key === undefined || open.value.key === key);
}

function toggle(pkg: string, version: string, key: ToolchainKey) {
	open.value = isOpen(pkg, version, key) ? null : { pkg, version, key };
}

function toggleExpanded(name: string) {
	expanded.value = expanded.value.includes(name)
		? expanded.value.filter((item) => item !== name)
		: [...expanded.value, name];
}

const border = "border-b border-r border-neutral-200 last:border-r-0 dark:border-neutral-700/80";
const headCell = `sticky z-10 bg-neutral-50 text-center font-semibold dark:bg-neutral-900 ${border}`;
</script>

<template>
	<div class="border-y border-neutral-200 dark:border-neutral-700/80">
		<table class="w-full min-w-[60rem] table-fixed border-separate border-spacing-0 text-sm">
			<colgroup>
				<col class="w-88" />
				<col v-for="key in ALL_KEYS" :key="key" />
			</colgroup>
			<thead>
				<tr>
					<th rowspan="2" :class="headCell" class="top-0 px-6 py-3 text-left align-bottom">Release</th>
					<th
						v-for="group in COLUMNS"
						:key="group.platform"
						:colspan="group.keys.length"
						:class="headCell"
						class="top-0 h-8 px-3 text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase dark:text-neutral-500"
					>
						{{ group.platform }}
					</th>
				</tr>
				<tr>
					<th v-for="key in ALL_KEYS" :key="key" :class="headCell" class="top-8 px-3 py-2.5">{{ TOOLCHAIN_LABELS[key] }}</th>
				</tr>
			</thead>
			<tbody v-for="group in groups" :key="group.name">
				<tr>
					<th
						:colspan="ALL_KEYS.length + 1"
						class="border-b border-neutral-200 bg-sky-50/70 px-6 py-2 text-left font-semibold dark:border-neutral-700/80 dark:bg-sky-900/25"
					>
						<code>{{ group.name }}</code>
						<span class="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">{{ group.total }} releases</span>
					</th>
				</tr>
				<template v-for="version in group.visible" :key="version">
					<tr class="group">
						<th
							scope="row"
							:class="border"
							class="px-6 py-3 text-left align-top font-medium group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/70"
						>
							<code>{{ version }}</code>
							<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
								<span
									v-for="tag in group.tags.get(version) ?? []"
									:key="tag"
									class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/60 dark:text-sky-300"
								>
									{{ tag }}
								</span>
							</div>
						</th>
						<template v-for="key in ALL_KEYS" :key="key">
							<CompatCell
								v-if="group.toolchains.has(key)"
								:summary="summary(group.name, version, key)"
								:toolchain="key"
								:open="isOpen(group.name, version, key)"
								:class="border"
								@toggle="toggle(group.name, version, key)"
							/>
							<td v-else :class="border" class="hatched" aria-label="Not applicable"></td>
						</template>
					</tr>
					<tr v-if="isOpen(group.name, version)">
						<td
							:colspan="ALL_KEYS.length + 1"
							class="border-b border-neutral-200 bg-neutral-50 px-6 py-5 dark:border-neutral-700/80 dark:bg-neutral-900"
						>
							<CellDetails :summary="summary(group.name, version, open!.key)" :toolchain="open!.key" :document="document" />
						</td>
					</tr>
				</template>
				<tr v-if="group.total > INITIAL_ROWS && !normalizedQuery">
					<th scope="row" :class="border" class="px-6 py-2 text-left">
						<button
							type="button"
							class="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
							@click="toggleExpanded(group.name)"
						>
							{{ expanded.includes(group.name) ? "Show less" : `Show ${group.total - INITIAL_ROWS} more` }}
						</button>
					</th>
					<td :colspan="ALL_KEYS.length" :class="border" class="bg-neutral-50/60 dark:bg-neutral-900/70"></td>
				</tr>
			</tbody>
		</table>
		<p v-if="!groups.length" class="px-6 py-4 text-neutral-500 dark:text-neutral-400">No releases match.</p>
	</div>
</template>
