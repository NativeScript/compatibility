<script setup lang="ts">
import { ref } from "vue";
import type { CellState } from "../../../shared/types";
import { STATE_HELP, STATE_LABELS } from "../states";
import StateIcon from "./StateIcon.vue";

const props = defineProps<{ state: CellState }>();
const id = `legend-${props.state}`;

const POPOVER_WIDTH = 256;
const MARGIN = 8;

const button = ref<HTMLElement | null>(null);
// Right-anchored while hidden so the invisible panel never widens the page; placed properly on hover.
const align = ref<"center" | "left" | "right">("right");

/** Keeps the popover inside the viewport by anchoring it to whichever edge has room. */
function place() {
	const rect = button.value?.getBoundingClientRect();
	if (!rect) {
		return;
	}
	const center = rect.left + rect.width / 2;
	if (center + POPOVER_WIDTH / 2 > window.innerWidth - MARGIN) {
		align.value = "right";
	} else if (center - POPOVER_WIDTH / 2 < MARGIN) {
		align.value = "left";
	} else {
		align.value = "center";
	}
}

const PANEL: Record<typeof align.value, string> = {
	center: "left-1/2 -translate-x-1/2",
	left: "left-0",
	right: "right-0",
};
const ARROW: Record<typeof align.value, string> = {
	center: "left-1/2 -translate-x-1/2",
	left: "left-4",
	right: "right-4",
};
</script>

<template>
	<li class="group relative">
		<button
			ref="button"
			type="button"
			class="flex cursor-help items-center gap-1.5 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-declared/50"
			:aria-describedby="id"
			@mouseenter="place"
			@focus="place"
		>
			<StateIcon :state="state" :size="16" />
			<span>{{ STATE_LABELS[state] }}</span>
		</button>
		<div
			:id="id"
			role="tooltip"
			:class="PANEL[align]"
			class="pointer-events-none invisible absolute top-full z-20 mt-2 w-64 rounded-lg border border-neutral-200 bg-white p-3 text-left text-sm opacity-0 shadow-lg transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:border-neutral-700 dark:bg-neutral-900"
		>
			<span
				:class="ARROW[align]"
				class="absolute -top-1.5 size-3 rotate-45 border-t border-l border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
			></span>
			<p class="flex items-center gap-1.5 font-semibold">
				<StateIcon :state="state" :size="16" />
				{{ STATE_LABELS[state] }}
			</p>
			<p class="mt-1 text-neutral-600 dark:text-neutral-400">{{ STATE_HELP[state] }}</p>
		</div>
	</li>
</template>
