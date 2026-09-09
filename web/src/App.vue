<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { CellState, CompatibilityDocument } from "../../shared/types";
import { TOOLCHAIN_LABELS, type ToolchainKey } from "../../shared/types";
import CompatGrid from "./components/CompatGrid.vue";
import LegendItem from "./components/LegendItem.vue";
import StateIcon from "./components/StateIcon.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { useUrlState } from "./urlState";

const STATES: CellState[] = ["verified", "declared", "unverified", "advisory", "unsupported"];

const document = ref<CompatibilityDocument | null>(null);
const error = ref<string | null>(null);
const { query, showPrereleases, open, expanded } = useUrlState();

onMounted(async () => {
	try {
		const res = await fetch("/v1/compatibility.json");
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		document.value = await res.json();
	} catch (err) {
		error.value = String(err);
	}
});

const generated = computed(() =>
	document.value
		? new Date(document.value.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
		: "",
);

function label(key: string): string {
	return TOOLCHAIN_LABELS[key as ToolchainKey] ?? key;
}
</script>

<template>
	<header class="px-6 pt-6 pb-5">
		<div class="flex items-start justify-between gap-4">
			<h1 class="text-2xl font-semibold tracking-tight">NativeScript compatibility</h1>
			<ThemeToggle />
		</div>
		<p class="mt-1 max-w-3xl text-neutral-600 dark:text-neutral-400">
			Which toolchains each runtime and CLI release supports, from published package metadata, CI
			verification runs and maintainer advisories. Click a cell for the version-by-version picture.
		</p>
		<nav class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
			<a class="text-declared hover:underline" href="https://github.com/NativeScript/compatibility/issues/new">Report a problem</a>
			<a class="text-declared hover:underline" href="https://github.com/NativeScript/compatibility">Data on GitHub</a>
			<a class="text-declared hover:underline" href="/v1/compatibility.json">JSON</a>
			<a class="text-declared hover:underline" href="/v1/schemas/package.json">Schema</a>
			<span v-if="generated" class="text-neutral-500">Updated {{ generated }}</span>
		</nav>
		<div class="mt-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
			<div class="flex flex-wrap items-center gap-5">
				<input
					v-model="query"
					type="search"
					placeholder="Filter by package, version or tag…"
					aria-label="Filter releases"
					class="w-80 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-declared focus:ring-2 focus:ring-declared/30 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
				/>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input v-model="showPrereleases" type="checkbox" class="size-4 accent-declared" />
					Show prereleases
				</label>
			</div>
			<ul class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
				<LegendItem v-for="state in STATES" :key="state" :state="state" />
			</ul>
		</div>
	</header>

	<main>
		<p v-if="error" class="px-6 text-bad">Could not load compatibility data: {{ error }}</p>
		<p v-else-if="!document" class="px-6 text-neutral-500">Loading…</p>
		<template v-else>
			<CompatGrid v-model:open="open" v-model:expanded="expanded" :document="document" :query="query" :show-prereleases="showPrereleases" />

			<section v-if="document.advisories.length" class="px-6 pt-10">
				<h2 class="text-base font-semibold">Advisories</h2>
				<ul class="mt-3 space-y-4 text-sm">
					<li v-for="advisory in document.advisories" :key="advisory.id" class="flex gap-2.5">
						<StateIcon :state="advisory.severity === 'error' ? 'unsupported' : 'advisory'" :size="16" class="mt-0.5" />
						<div>
							<p>
								<strong :class="advisory.severity === 'error' ? 'text-bad' : 'text-advisory'">
									<code>{{ advisory.package }}</code> {{ advisory.affects }}
								</strong>
								<span class="text-neutral-500"> when </span>
								<span v-for="(range, key, index) in advisory.when" :key="key">
									<template v-if="index > 0">, </template>{{ label(key) }} <code>{{ range }}</code>
								</span>
							</p>
							<p class="mt-0.5 text-neutral-700 dark:text-neutral-300">
								{{ advisory.message }}
								<em v-if="advisory.fix" class="ml-1">{{ advisory.fix }}</em>
								<a v-if="advisory.url" :href="advisory.url" class="ml-1 text-declared hover:underline">details</a>
							</p>
						</div>
					</li>
				</ul>
			</section>
		</template>
	</main>
</template>
