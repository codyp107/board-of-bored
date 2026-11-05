<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { STATUS_LABEL } from '$lib/constants';
	import { formatInstantDate } from '$lib/dates';

	let { data } = $props();
</script>

<svelte:head><title>Archive · Board of Bored</title></svelte:head>

<h1 class="text-xl font-bold">Archive</h1>
<p class="mt-1 text-sm text-slate-500">Archived tasks are hidden from boards and reports but never deleted. Restore any of them here.</p>

<form method="GET" class="mt-4 flex gap-2" data-sveltekit-keepfocus>
	<input type="search" name="q" value={data.q} placeholder="Search archive…" class="min-w-0 flex-1" aria-label="Search archive" />
	<button class="btn-secondary">Search</button>
</form>

{#if data.tasks.length === 0}
	<div class="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
		Nothing archived{data.q ? ' matches that search' : ''}.
	</div>
{:else}
	<ul class="mt-4 space-y-2">
		{#each data.tasks as task (task.id)}
			<li
				class="flex items-center gap-3 rounded-xl border border-l-4 border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
				style="border-left-color: {task.workspace_color}"
			>
				<div class="min-w-0 flex-1">
					<a href="/tasks/{task.id}" class="block font-medium break-words hover:underline">{task.title}</a>
					<div class="text-xs text-slate-500">
						<span style="color: {task.workspace_color}" class="font-semibold">{task.workspace_name}</span>
						· {STATUS_LABEL[task.status]} · archived {formatInstantDate(task.archived_at, page.data.tz)}
					</div>
				</div>
				<form
					method="POST"
					action="/tasks/{task.id}?/restore"
					use:enhance={() =>
						async () => {
							await invalidateAll();
						}}
				>
					<button class="btn-secondary">Restore</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
