<script setup lang="ts">
withDefaults(defineProps<{ tone?: "info" | "beta" }>(), { tone: "info" });

const TONES = {
	info: "border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-600/50 dark:bg-sky-950/40 dark:text-sky-300",
	beta: "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-300",
};
</script>

<template>
	<span class="inline-flex items-center rounded-md border px-1.5 py-px text-[10px] leading-4 font-medium" :class="TONES[tone]">
		<slot />
	</span>
</template>
