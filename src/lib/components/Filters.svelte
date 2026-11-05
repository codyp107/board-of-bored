<script lang="ts">
	import { page } from '$app/state';
	import { DUE_FILTERS, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL } from '$lib/constants';

	let {
		filters,
		view
	}: {
		filters: { q: string; status: string; priority: string; due: string; source: string };
		view: 'active' | 'completed';
	} = $props();

	const extrasActive = $derived(!!(filters.status || filters.priority || filters.due || filters.source));
	const anyActive = $derived(extrasActive || !!filters.q);
	let showMore = $state(false);

	function submit(e: Event) {
		(e.currentTarget as HTMLInputElement).form?.requestSubmit();
	}
</script>

<form method="GET" class="space-y-2" data-sveltekit-keepfocus data-sveltekit-replacestate>
	<div class="flex gap-2">
		<input
			type="search"
			name="q"
			value={filters.q}
			placeholder="Search tasks…"
			aria-label="Search"
			class="min-w-0 flex-1"
		/>
		<button type="button" class="btn-secondary sm:hidden" onclick={() => (showMore = !showMore)} aria-expanded={showMore}>
			Filters{extrasActive ? ' •' : ''}
		</button>
		{#if anyActive}
			<a href={page.url.pathname} class="btn-secondary">Clear</a>
		{/if}
	</div>
	<div class="{showMore || extrasActive ? 'grid' : 'hidden'} grid-cols-2 gap-2 sm:grid sm:grid-cols-4">
		{#if view === 'active'}
			<select name="status" value={filters.status} onchange={submit} aria-label="Status">
				<option value="">Any status</option>
				<option value="open">{STATUS_LABEL.open}</option>
				<option value="in_progress">{STATUS_LABEL.in_progress}</option>
				<option value="waiting">{STATUS_LABEL.waiting}</option>
			</select>
		{/if}
		<select name="priority" value={filters.priority} onchange={submit} aria-label="Priority">
			<option value="">Any priority</option>
			{#each [...PRIORITIES].reverse() as p (p)}<option value={p}>{PRIORITY_LABEL[p]}</option>{/each}
		</select>
		<select name="due" value={filters.due} onchange={submit} aria-label="Due date">
			<option value="">Any due date</option>
			{#each Object.entries(DUE_FILTERS) as [k, label] (k)}
				{#if view === 'active' || k !== 'overdue'}<option value={k}>{label}</option>{/if}
			{/each}
		</select>
		<input
			name="source"
			value={filters.source}
			list="source-options"
			placeholder="Source"
			aria-label="Source"
			onchange={submit}
			autocomplete="off"
		/>
	</div>
</form>
