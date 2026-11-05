<script lang="ts">
	import { PRIORITY_LABEL, STATUS_LABEL, type Task } from '$lib/constants';
	import { formatDate, formatInstantDate } from '$lib/dates';

	let {
		task,
		today,
		tz,
		showWorkspace,
		oncomplete
	}: {
		task: Task;
		today: string;
		tz: string;
		showWorkspace: boolean;
		oncomplete?: (t: Task) => void;
	} = $props();

	const done = $derived(task.status === 'done');
	const overdue = $derived(!done && !!task.due_date && task.due_date < today);
	const dueToday = $derived(!done && task.due_date === today);

	const PRIORITY_TONE: Record<string, string> = {
		urgent: 'bg-red-600 text-white',
		high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
		low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
	};
</script>

<li
	class="flex items-start gap-3 rounded-xl border border-l-4 p-3 shadow-sm {overdue
		? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
		: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}"
	style="border-left-color: {task.workspace_color}"
>
	{#if done}
		<span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" aria-label="Done">
			<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7" /></svg>
		</span>
	{:else}
		<button
			type="button"
			class="mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-600 dark:hover:bg-emerald-950"
			aria-label="Mark “{task.title}” done"
			title="Mark done"
			onclick={() => oncomplete?.(task)}
		></button>
	{/if}

	<div class="min-w-0 flex-1">
		<a href="/tasks/{task.id}" class="block font-medium break-words hover:underline">{task.title}</a>
		<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
			{#if showWorkspace}
				<span class="font-semibold" style="color: {task.workspace_color}">{task.workspace_name}</span>
			{/if}
			{#if task.priority !== 'normal'}
				<span class="rounded px-1.5 py-0.5 font-semibold {PRIORITY_TONE[task.priority]}">{PRIORITY_LABEL[task.priority]}</span>
			{/if}
			{#if !done && task.status !== 'open'}
				<span class="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
					>{STATUS_LABEL[task.status]}</span
				>
			{/if}
			{#if done}
				<span>Completed {formatInstantDate(task.completed_at, tz)}</span>
			{:else if overdue}
				<span class="font-semibold text-red-600 dark:text-red-400">Overdue · {formatDate(task.due_date)}</span>
			{:else if dueToday}
				<span class="font-semibold text-amber-600 dark:text-amber-400">Due today</span>
			{:else if task.due_date}
				<span>Due {formatDate(task.due_date)}</span>
			{/if}
			{#if task.source}<span>From {task.source}</span>{/if}
		</div>
		{#if done && task.completion_notes}
			<p class="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{task.completion_notes}</p>
		{/if}
	</div>
</li>
