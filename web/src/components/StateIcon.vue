<script setup lang="ts">
import type { CellState } from "../../../shared/types";
import { STATE_LABELS } from "../states";

withDefaults(defineProps<{ state: CellState; size?: number }>(), { size: 18 });

const COLOR: Record<CellState, string> = {
	verified: "text-ok",
	declared: "text-ok",
	unverified: "text-unverified",
	advisory: "text-advisory",
	unsupported: "text-bad",
};
</script>

<template>
	<svg
		class="shrink-0"
		:class="COLOR[state]"
		:width="size"
		:height="size"
		viewBox="0 0 20 20"
		role="img"
		:aria-label="STATE_LABELS[state]"
	>
		<template v-if="state === 'verified'">
			<circle cx="10" cy="10" r="9" fill="currentColor" />
			<path d="M6 10.4l2.6 2.6L14.2 7.4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
		</template>
		<template v-else-if="state === 'declared'">
			<circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6" />
			<path d="M6.3 10.4l2.5 2.5 5.1-5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</template>
		<template v-else-if="state === 'unverified'">
			<circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6" />
			<path d="M7.6 7.9a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			<circle cx="10" cy="14.4" r="1.1" fill="currentColor" />
		</template>
		<template v-else-if="state === 'advisory'">
			<path d="M10 2.2 18.7 17.3H1.3Z" fill="currentColor" />
			<path d="M10 7.4v4.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" />
			<circle cx="10" cy="14.6" r="1.15" fill="#fff" />
		</template>
		<template v-else>
			<circle cx="10" cy="10" r="9" fill="currentColor" />
			<path d="M7 7l6 6M13 7l-6 6" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" />
		</template>
	</svg>
</template>
