<script setup lang="ts">
import { computed, ref } from "vue";
import type { Cell } from "../../../shared/compute";
import type { CellState } from "../../../shared/types";
import { STATE_HELP } from "../states";
import BetaChip from "./BetaChip.vue";
import Chip from "./Chip.vue";
import StateIcon from "./StateIcon.vue";

export interface TimelineItem {
	version: string;
	prerelease?: boolean;
	lts?: boolean;
	tags?: string[];
	/** ISO date; only the month is shown. */
	date?: string;
	cell: Cell;
}

const INITIAL_NODES = 5;

/** Items newest first, as the document lists them; `label` names what the versions are versions of. */
const props = defineProps<{ items: TimelineItem[]; label: string }>();

const showAll = ref(false);

/** Oldest first, so time runs left to right; the newest few unless expanded. */
const nodes = computed(() => {
	const all = [...props.items].reverse();
	return showAll.value ? all : all.slice(-INITIAL_NODES);
});
const hiddenCount = computed(() => Math.max(0, props.items.length - INITIAL_NODES));

/** Only nodes that need an explanation; plain declared, verified and unknown states speak for themselves. */
const notes = computed(() =>
	[...nodes.value].reverse().filter((item) => {
		switch (item.cell.state) {
			case "declared":
				return false;
			case "verified":
				return item.cell.reason !== "verified by CI";
			case "unverified":
				return item.cell.reason !== "no requirement published" && item.cell.reason !== "no data";
			default:
				return true;
		}
	}),
);

const SEGMENT: Record<CellState, string> = {
	verified: "bg-ok/55",
	declared: "bg-ok/55",
	unverified: "bg-unverified/40",
	advisory: "bg-advisory/60",
	unsupported: "bg-bad/55",
};
const LABEL: Record<CellState, string> = {
	verified: "text-ok",
	declared: "",
	unverified: "",
	advisory: "text-advisory",
	unsupported: "text-bad",
};

function shortDate(item: TimelineItem): string {
	return item.date ? item.date.slice(0, 7) : "";
}
</script>

<template>
	<!-- isolate: the icons are raised above the track, and that must not reach the grid's sticky headers. -->
	<div class="isolate">
		<div class="flex items-stretch" role="list">
			<div v-if="hiddenCount" class="mr-3 flex shrink-0 flex-col items-center" role="presentation">
				<span class="h-6"></span>
				<span class="flex h-6 items-center">
					<button
						type="button"
						class="rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
						@click="showAll = !showAll"
					>
						{{ showAll ? "Hide older" : `${hiddenCount} older` }}
					</button>
				</span>
				<span class="h-5"></span>
			</div>
			<div
				v-for="(item, index) in nodes"
				:key="item.version"
				class="flex min-w-0 flex-1 flex-col items-center text-center"
				role="listitem"
				:title="`${label} ${item.version}: ${STATE_HELP[item.cell.state]} ${item.cell.reason}`"
			>
				<span class="flex h-6 items-center gap-1 text-sm leading-6 font-semibold tabular-nums whitespace-nowrap" :class="LABEL[item.cell.state]">
					{{ item.version }}
					<BetaChip v-if="item.prerelease" />
					<Chip v-else-if="item.lts" :title="`${label} ${item.version} is a long-term-support line`">LTS</Chip>
					<Chip v-for="tag in item.tags ?? []" :key="tag">{{ tag }}</Chip>
				</span>
				<span class="relative flex h-6 w-full items-center justify-center">
					<span
						class="absolute top-1/2 h-1 -translate-y-1/2"
						:class="[SEGMENT[item.cell.state], index === 0 ? 'left-1/2 rounded-l-full' : 'left-0', index === nodes.length - 1 ? 'right-1/2 rounded-r-full' : 'right-0']"
					></span>
					<StateIcon
						:state="item.cell.state"
						:size="16"
						class="relative z-10 rounded-full bg-white ring-[3px] ring-white dark:bg-neutral-950 dark:ring-neutral-950"
					/>
				</span>
				<span class="h-5 text-[11px] leading-5 text-neutral-500 dark:text-neutral-400 tabular-nums">{{ shortDate(item) }}</span>
			</div>
		</div>

		<ul v-if="notes.length" class="mt-4 max-w-4xl space-y-1.5 text-[13px]">
			<li v-for="item in notes" :key="item.version" class="flex items-start gap-2">
				<StateIcon :state="item.cell.state" :size="14" class="mt-0.5" />
				<span>
					<strong :class="LABEL[item.cell.state]">{{ label }} {{ item.version }}<template v-if="item.prerelease"> beta</template></strong>
					<span class="text-neutral-500 dark:text-neutral-400"> · </span>
					<template v-if="item.cell.advisory">
						{{ item.cell.advisory.message }}
						<em v-if="item.cell.advisory.fix" class="ml-1">{{ item.cell.advisory.fix }}</em>
						<a v-if="item.cell.advisory.url" :href="item.cell.advisory.url" class="ml-1 text-declared hover:underline">details</a>
						<code class="ml-2 text-[11px] text-neutral-400">{{ item.cell.advisory.id }}</code>
					</template>
					<template v-else>{{ item.cell.reason }}</template>
				</span>
			</li>
		</ul>
	</div>
</template>
