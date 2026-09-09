<script setup lang="ts">
import { useColorMode } from "@vueuse/core";

/** Stored in localStorage on purpose: a theme is a device preference, not part of a shareable view. */
const mode = useColorMode({ emitAuto: true, storageKey: "ns-compat-theme" });

const OPTIONS: Array<{ value: "auto" | "light" | "dark"; label: string; icon: string }> = [
	{ value: "auto", label: "Auto", icon: "M10 3a7 7 0 1 0 0 14V3Z" },
	{ value: "light", label: "Light", icon: "M10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-4v2m0 12v2M2 10h2m12 0h2M4.2 4.2l1.4 1.4m8.8 8.8 1.4 1.4m0-11.6-1.4 1.4M5.6 14.4l-1.4 1.4" },
	{ value: "dark", label: "Dark", icon: "M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z" },
];
</script>

<template>
	<div class="inline-flex rounded-lg border border-neutral-300 bg-neutral-100 p-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-800" role="radiogroup" aria-label="Theme">
		<button
			v-for="option in OPTIONS"
			:key="option.value"
			type="button"
			role="radio"
			:aria-checked="mode === option.value"
			:title="`${option.label} theme`"
			class="flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
			:class="mode === option.value ? 'bg-white shadow-sm dark:bg-neutral-700' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'"
			@click="mode = option.value"
		>
			<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle v-if="option.value === 'auto'" cx="10" cy="10" r="7" />
				<path :d="option.icon" :fill="option.value === 'auto' ? 'currentColor' : 'none'" />
			</svg>
			{{ option.label }}
		</button>
	</div>
</template>
