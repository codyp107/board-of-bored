<script lang="ts">
	import { page } from '$app/state';
	import type { Task, Workspace } from '$lib/constants';
	import CompleteDialog from './CompleteDialog.svelte';
	import Filters from './Filters.svelte';
	import StatsBar from './StatsBar.svelte';
	import TaskRow from './TaskRow.svelte';

	let {
		ws,
		view,
		tasks,
		counts,
		filters
	}: {
		ws: Workspace | null;
		view: 'active' | 'completed';
		tasks: Task[];
		counts: { open: number; dueThisWeek: number; overdue: number; completedThisMonth: number };
		filters: { q: string; status: string; priority: string; due: string; source: string };
	} = $props();

	let completing = $state<Task | null>(null);
	const filtered = $derived(Object.values(filters).some(Boolean));
</script>

<StatsBar {counts} slug={ws?.slug ?? 'all'} />

<div class="mt-4">
	<Filters {filters} {view} />
</div>

<h2 class="mt-4 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
	{view === 'completed' ? 'Completed' : 'Open tasks'} · {tasks.length}
</h2>

{#if tasks.length === 0}
	<div class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
		{#if filtered}
			Nothing matches these filters.
		{:else if view === 'completed'}
			Nothing completed yet. It'll show up here once you finish something.
		{:else}
			All clear. Add a task in the box above.
		{/if}
	</div>
{:else}
	<ul class="space-y-2">
		{#each tasks as task (task.id)}
			<TaskRow
				{task}
				today={page.data.today}
				tz={page.data.tz}
				showWorkspace={!ws}
				oncomplete={(t) => (completing = t)}
			/>
		{/each}
	</ul>
{/if}

<CompleteDialog task={completing} onclose={() => (completing = null)} />
