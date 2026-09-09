<script setup lang="ts">
import { computed } from "vue";
import type { CellSummary } from "../../../shared/compute";
import { TOOLCHAIN_LABELS, type ToolchainKey } from "../../../shared/types";
import { STATE_HELP } from "../states";
import StateIcon from "./StateIcon.vue";

const props = defineProps<{ summary: CellSummary; toolchain: ToolchainKey; open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const flagged = computed(() => props.summary.advisories.length > 0);
const hasNotes = computed(() => flagged.value || props.summary.verified.length > 0 || props.summary.latestCovered === false);
const label = computed(() => TOOLCHAIN_LABELS[props.toolchain]);

const rangeColor = computed(() =>
	props.summary.state === "unverified" ? "text-unverified font-medium" : "text-ok font-semibold",
);
const background = computed(() => {
	if (props.open) {
		return "bg-sky-50 dark:bg-sky-900/35";
	}
	if (flagged.value) {
		return "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-900/20 dark:hover:bg-amber-900/35";
	}
	return "hover:bg-neutral-50 dark:hover:bg-neutral-800/70";
});
</script>

<template>
	<td
		class="relative cursor-pointer px-3 pt-3.5 pb-2.5 text-center align-top transition-colors outline-none focus-visible:ring-2 focus-visible:ring-declared/50 focus-visible:ring-inset"
		:class="background"
		tabindex="0"
		:title="`${STATE_HELP[summary.state]} ${open ? 'Click to collapse.' : 'Click for details.'}`"
		@click="emit('toggle')"
		@keydown.enter.prevent="emit('toggle')"
		@keydown.space.prevent="emit('toggle')"
	>
		<StateIcon :state="summary.state" :size="22" class="mx-auto" />
		<span class="mt-1 block tabular-nums" :class="rangeColor">{{ summary.range || "No data" }}</span>
		<span
			v-if="flagged"
			class="absolute top-1.5 right-2 flex items-center gap-0.5 text-xs font-bold text-advisory"
			:title="summary.advisories.map((a) => a.id).join(', ')"
		>
			<StateIcon state="advisory" :size="16" />
			<span v-if="summary.advisories.length > 1">{{ summary.advisories.length }}</span>
		</span>
		<span v-if="summary.latestCovered === false" class="mt-0.5 block text-[11px] text-advisory">newer {{ label }} unverified</span>
		<span v-if="hasNotes" class="mt-0.5 block text-xs leading-none tracking-widest text-neutral-400" aria-hidden="true">···</span>
		<span
			v-if="open"
			aria-hidden="true"
			class="absolute -bottom-[7px] left-1/2 z-10 size-3.5 -translate-x-1/2 rotate-45 border-t border-l border-neutral-200 bg-neutral-50 dark:border-neutral-700/80 dark:bg-neutral-900"
		></span>
	</td>
</template>
