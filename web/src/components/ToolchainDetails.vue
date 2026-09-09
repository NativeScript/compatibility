<script setup lang="ts">
import { computed } from "vue";
import type { ToolchainSummary } from "../../../shared/compute";
import { TOOLCHAIN_LABELS, type ToolchainKey } from "../../../shared/types";
import Timeline from "./Timeline.vue";

const props = defineProps<{ summary: ToolchainSummary; toolchain: ToolchainKey; version: string; packageName: string }>();

const label = computed(() => `${TOOLCHAIN_LABELS[props.toolchain]} ${props.version}`);
/** Support may well predate the oldest release the document tracks. */
const sinceIsOldest = computed(() => {
	const stable = props.summary.releases.filter((release) => !release.prerelease);
	return !!props.summary.since && stable[stable.length - 1]?.version === props.summary.since.version;
});
</script>

<template>
	<div>
		<p class="text-sm">
			<strong><code>{{ packageName }}</code></strong>
			{{ " " }}with {{ label }}:
			<template v-if="summary.since">
				supported since <code>{{ summary.since.version }}</code>
				<span v-if="sinceIsOldest" class="text-neutral-500 dark:text-neutral-400"> (the oldest tracked release)</span>
				<template v-if="summary.until">
					{{ " " }}until <code>{{ summary.until.version }}</code>
					<span class="text-neutral-500 dark:text-neutral-400"> (newer releases dropped it)</span>
				</template>
				<span v-if="summary.verifiedSince" class="text-ok"> · verified by CI since {{ summary.verifiedSince }}</span>
			</template>
			<span v-else-if="summary.state === 'unsupported'" class="text-bad">no tracked release supports it</span>
			<span v-else class="text-neutral-500 dark:text-neutral-400">no tracked release is known to support it</span>
		</p>

		<Timeline class="mt-4" :items="summary.releases" :label="packageName" />
	</div>
</template>
