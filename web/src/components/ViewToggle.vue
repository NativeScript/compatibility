<script setup lang="ts">
const byToolchain = defineModel<boolean>({ required: true });

const OPTIONS: Array<{ value: boolean; label: string; title: string }> = [
	{ value: false, label: "By release", title: "Rows are releases; cells show how each fares with the newest toolchain" },
	{ value: true, label: "By toolchain", title: "Rows are toolchain versions; cells show which releases support them" },
];
</script>

<template>
	<div class="inline-flex rounded-lg border border-neutral-300 bg-neutral-100 p-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-800" role="radiogroup" aria-label="View">
		<button
			v-for="option in OPTIONS"
			:key="option.label"
			type="button"
			role="radio"
			:aria-checked="byToolchain === option.value"
			:title="option.title"
			class="rounded-md px-2.5 py-1 transition-colors"
			:class="byToolchain === option.value ? 'bg-white font-medium shadow-sm dark:bg-neutral-700' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'"
			@click="byToolchain = option.value"
		>
			{{ option.label }}
		</button>
	</div>
</template>
