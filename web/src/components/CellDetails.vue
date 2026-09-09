<script setup lang="ts">
import { computed } from "vue";
import type { CellSummary } from "../../../shared/compute";
import { TOOLCHAIN_LABELS, type CompatibilityDocument, type ToolchainKey } from "../../../shared/types";
import Timeline, { type TimelineItem } from "./Timeline.vue";

const props = defineProps<{ summary: CellSummary; toolchain: ToolchainKey; document: CompatibilityDocument }>();

const label = computed(() => TOOLCHAIN_LABELS[props.toolchain]);
const sourceText = computed(() =>
	props.summary.source === "manifest"
		? "published by the package"
		: props.summary.source === "override"
			? "maintainer override"
			: "nothing published",
);
const items = computed<TimelineItem[]>(() => {
	const dates = new Map(props.document.toolchains[props.toolchain].map((tool) => [tool.version, tool.date]));
	return props.summary.breakdown.map((item) => ({ ...item, date: dates.get(item.version) }));
});
</script>

<template>
	<div>
		<p class="text-sm">
			<strong>{{ label }}</strong>
			<template v-if="summary.rawRange">
				{{ " " }}declared <code>{{ summary.rawRange }}</code>
				<span class="text-neutral-500 dark:text-neutral-400"> ({{ sourceText }})</span>
			</template>
			<span v-else class="text-neutral-500 dark:text-neutral-400"> no requirement {{ sourceText === "nothing published" ? "published" : "found" }}</span>
			<span v-if="summary.verified.length" class="text-ok"> · verified by CI with {{ summary.verified.join(", ") }}</span>
		</p>

		<Timeline class="mt-4" :items="items" :label="label" />
	</div>
</template>
