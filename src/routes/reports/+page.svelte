<script lang="ts">
	import { page } from '$app/state';
	import { formatDate, formatInstantDate, RANGE_PRESETS, type RangePreset } from '$lib/dates';

	let { data } = $props();

	const report = $derived(data.report);
	const tz = $derived(page.data.tz as string);
	let preset = $state<RangePreset>('this_month');
	$effect.pre(() => {
		preset = data.report.preset;
	});

	const selected = $derived(new Set(report.workspaces.map((w) => w.slug)));
	const pdfHref = $derived(`/reports/pdf?${page.url.searchParams.toString()}`);
</script>

<svelte:head><title>Reports · Board of Bored</title></svelte:head>

<h1 class="text-xl font-bold">Reports</h1>
<p class="mt-1 text-sm text-slate-500">Everything you finished in a period, grouped by workspace.</p>

<form method="GET" class="card mt-4 space-y-4">
	<div class="grid gap-3 sm:grid-cols-3">
		<div class="flex flex-col gap-1">
			<label for="preset">Period</label>
			<select id="preset" name="preset" bind:value={preset}>
				{#each Object.entries(RANGE_PRESETS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
			</select>
		</div>
		{#if preset === 'custom'}
			<div class="flex flex-col gap-1">
				<label for="from">From</label>
				<input id="from" name="from" type="date" value={report.range.from} required />
			</div>
			<div class="flex flex-col gap-1">
				<label for="to">To</label>
				<input id="to" name="to" type="date" value={report.range.to} required />
			</div>
		{/if}
	</div>
	<fieldset class="flex flex-wrap gap-x-5 gap-y-2">
		<legend class="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Workspaces</legend>
		{#each report.allWorkspaces as ws (ws.slug)}
			<label class="flex items-center gap-2">
				<input type="checkbox" name="ws" value={ws.slug} checked={selected.has(ws.slug)} />
				<span class="inline-block h-2.5 w-2.5 rounded-full" style="background: {ws.color}"></span>
				{ws.name}
			</label>
		{/each}
	</fieldset>
	<div class="flex flex-wrap gap-2">
		<button class="btn-primary">Run report</button>
		<a href={pdfHref} class="btn-secondary" data-sveltekit-reload>Export PDF</a>
	</div>
</form>

<section class="mt-6">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-bold">{formatDate(report.range.from)} – {formatDate(report.range.to)}</h2>
		<div class="text-sm text-slate-500">
			<span class="text-2xl font-bold text-slate-900 dark:text-slate-100">{report.total}</span>
			{report.total === 1 ? 'task' : 'tasks'} completed
		</div>
	</div>

	{#if report.groups.length === 0}
		<div class="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
			Nothing completed in this period.
		</div>
	{/if}

	{#each report.groups as g (g.workspace.slug)}
		<div class="mt-5">
			<h3 class="mb-2 flex items-center gap-2 font-semibold">
				<span class="inline-block h-4 w-1.5 rounded" style="background: {g.workspace.color}"></span>
				{g.workspace.name}
				<span class="text-sm font-normal text-slate-500">· {g.tasks.length}</span>
			</h3>
			<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-slate-200 text-xs text-slate-500 uppercase dark:border-slate-800">
						<tr>
							<th class="px-3 py-2">Task</th>
							<th class="px-3 py-2">Source</th>
							<th class="px-3 py-2 whitespace-nowrap">Created</th>
							<th class="px-3 py-2 whitespace-nowrap">Completed</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each g.tasks as t (t.id)}
							<tr class="align-top">
								<td class="min-w-[14rem] px-3 py-2">
									<a href="/tasks/{t.id}" class="font-medium hover:underline">{t.title}</a>
									{#if t.completion_notes}
										<p class="mt-1 whitespace-pre-wrap text-slate-600 italic dark:text-slate-400">{t.completion_notes}</p>
									{/if}
								</td>
								<td class="px-3 py-2 text-slate-600 dark:text-slate-400">{t.source ?? '—'}</td>
								<td class="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatInstantDate(t.created_at, tz)}</td>
								<td class="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatInstantDate(t.completed_at, tz)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/each}
</section>
