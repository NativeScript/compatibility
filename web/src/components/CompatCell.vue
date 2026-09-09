<script setup lang="ts">
import { computed } from "vue";
import type { CellSummary } from "../../../shared/compute";
import type { CellState } from "../../../shared/types";
import { STATE_HELP } from "../states";
import BetaChip from "./BetaChip.vue";
import StateIcon from "./StateIcon.vue";

const props = defineProps<{ summary: CellSummary; toolchain: string; open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

/**
 * The headline is the newest stable version that works; when the newest one
 * does not, it moves to a secondary line with its problem. Older versions
 * live in the timeline.
 */
const primary = computed(() => props.summary.latestSupported ?? props.summary.latest);
const secondary = computed(() => (props.summary.latestSupported ? props.summary.latest : undefined));
const state = computed<CellState>(() => primary.value?.cell.state ?? "unverified");
const SECONDARY_LABEL: Record<CellState, string> = {
	verified: "verified",
	declared: "declared",
	unverified: "unverified",
	advisory: "advisory",
	unsupported: "unsupported",
};
const flagged = computed(() => props.summary.advisories.length > 0);

const TEXT: Record<CellState, string> = {
	verified: "text-ok font-semibold",
	declared: "text-ok font-semibold",
	unverified: "text-unverified font-medium",
	advisory: "text-advisory font-semibold",
	unsupported: "text-bad font-semibold",
};

const background = computed(() => {
	if (props.open) {
		return "bg-sky-50 dark:bg-sky-900/35";
	}
	if (state.value === "unsupported") {
		return "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/25 dark:hover:bg-red-950/40";
	}
	if (state.value === "advisory" || flagged.value) {
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
		:title="`${STATE_HELP[state]} ${open ? 'Click to collapse.' : 'Click for details.'}`"
		@click="emit('toggle')"
		@keydown.enter.prevent="emit('toggle')"
		@keydown.space.prevent="emit('toggle')"
	>
		<StateIcon :state="state" :size="22" class="mx-auto" />
		<span class="mt-1 block tabular-nums" :class="TEXT[state]">{{ primary?.version ?? "No data" }}</span>
		<span
			v-if="secondary"
			class="mt-0.5 flex items-center justify-center gap-1 text-[11px] tabular-nums"
			:title="`${secondary.version}: ${secondary.cell.reason}`"
		>
			<StateIcon :state="secondary.cell.state" :size="12" />
			<span class="font-medium" :class="TEXT[secondary.cell.state]">{{ secondary.version }}</span>
			<span class="text-neutral-500 dark:text-neutral-400">{{ SECONDARY_LABEL[secondary.cell.state] }}</span>
		</span>
		<span
			v-if="summary.prerelease"
			class="mt-0.5 flex items-center justify-center gap-1 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400"
			:title="`${summary.prerelease.version} beta: ${summary.prerelease.cell.reason}`"
		>
			<StateIcon :state="summary.prerelease.cell.state" :size="12" />
			{{ summary.prerelease.version }}
			<BetaChip />
		</span>
		<span
			v-if="flagged"
			class="absolute top-1.5 right-2 flex items-center gap-0.5 text-xs font-bold text-advisory"
			:title="summary.advisories.map((a) => a.id).join(', ')"
		>
			<StateIcon state="advisory" :size="16" />
			<span v-if="summary.advisories.length > 1">{{ summary.advisories.length }}</span>
		</span>
		<span class="mt-0.5 block text-xs leading-none tracking-widest text-neutral-400" aria-hidden="true">···</span>
	</td>
</template>
