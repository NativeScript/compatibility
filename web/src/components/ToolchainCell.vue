<script setup lang="ts">
import { computed } from "vue";
import type { ToolchainSummary } from "../../../shared/compute";
import type { CellState } from "../../../shared/types";
import { STATE_HELP } from "../states";
import StateIcon from "./StateIcon.vue";

const props = defineProps<{ summary: ToolchainSummary; open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const TEXT: Record<CellState, string> = {
	verified: "text-ok font-semibold",
	declared: "text-ok font-semibold",
	unverified: "text-unverified font-medium",
	advisory: "text-advisory font-semibold",
	unsupported: "text-bad font-semibold",
};

const headline = computed(
	() => props.summary.text || (props.summary.state === "unsupported" ? "unsupported" : "unverified"),
);
/** The declared start leads; when CI proof begins later, it gets its own line. */
const verifiedLater = computed(
	() => props.summary.verifiedSince && props.summary.verifiedSince !== props.summary.since?.version,
);

const background = computed(() => {
	if (props.open) {
		return "bg-sky-50 dark:bg-sky-900/35";
	}
	if (props.summary.state === "unsupported") {
		return "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/25 dark:hover:bg-red-950/40";
	}
	if (props.summary.state === "advisory") {
		return "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-900/20 dark:hover:bg-amber-900/35";
	}
	return "hover:bg-neutral-50 dark:hover:bg-neutral-800/70";
});
</script>

<template>
	<td
		class="relative cursor-pointer px-3 pt-3.5 pb-6 text-center align-top transition-colors outline-none focus-visible:ring-2 focus-visible:ring-declared/50 focus-visible:ring-inset"
		:class="background"
		tabindex="0"
		:title="`${STATE_HELP[summary.state]} ${open ? 'Click to collapse.' : 'Click for details.'}`"
		@click="emit('toggle')"
		@keydown.enter.prevent="emit('toggle')"
		@keydown.space.prevent="emit('toggle')"
	>
		<div class="@container">
			<StateIcon :state="summary.state" :size="22" class="mx-auto" />
			<span class="mt-1 block tabular-nums" :class="TEXT[summary.state]">{{ headline }}</span>
			<span
				v-if="verifiedLater"
				class="mt-0.5 flex items-center justify-center gap-1 text-[11px] tabular-nums"
				:title="`Verified by CI from ${summary.verifiedSince} on`"
			>
				<StateIcon state="verified" :size="12" />
				<span class="font-medium text-ok">{{ summary.verifiedSince }}+</span>
				<span class="text-neutral-500 @max-[7rem]:hidden dark:text-neutral-400">verified</span>
			</span>
		</div>
		<span class="absolute inset-x-0 bottom-2 block text-xs leading-none tracking-widest text-neutral-400" aria-hidden="true">···</span>
	</td>
</template>
