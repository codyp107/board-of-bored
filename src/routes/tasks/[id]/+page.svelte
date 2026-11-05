<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import CompleteDialog from '$lib/components/CompleteDialog.svelte';
	import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '$lib/constants';
	import { formatDate, formatInstant } from '$lib/dates';
	import { describeHistory, isLongField } from '$lib/history';

	let { data, form } = $props();

	const task = $derived(data.task);
	const tz = $derived(page.data.tz as string);
	const today = $derived(page.data.today as string);
	const done = $derived(task.status === 'done');
	const overdue = $derived(!done && !!task.due_date && task.due_date < today);

	// Editable copy of status so the form can reveal completion notes when "Done" is picked.
	let status = $state(untrack(() => data.task.status));
	$effect.pre(() => {
		status = data.task.status;
	});
	let completing = $state<{ id: number; title: string } | null>(null);
	let saved = $state(false);

	function fmtSize(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}

	// Keep the form values the user typed (no reset) and flash "Saved".
	const keep: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				saved = true;
				setTimeout(() => (saved = false), 2000);
			}
		};
	};
</script>

<svelte:head><title>{task.title} · Board of Bored</title></svelte:head>

<div class="mb-3 flex items-center justify-between gap-2 text-sm">
	<a href="/w/{task.workspace_slug}{done ? '/completed' : ''}" class="text-slate-500 hover:underline">
		← {task.workspace_name}
	</a>
	<span class="text-xs text-slate-400">#{task.id}</span>
</div>

{#if task.archived_at}
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
		<span>Archived {formatInstant(task.archived_at, tz)}. It's hidden from boards and reports.</span>
		<form method="POST" action="?/restore" use:enhance>
			<button class="btn-secondary">Restore</button>
		</form>
	</div>
{/if}

{#if form?.error}
	<p class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{form.error}</p>
{/if}

<div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
	<div class="space-y-4">
		<!-- Completion -->
		<section
			class="card flex flex-wrap items-center justify-between gap-3 border-l-4"
			style="border-left-color: {task.workspace_color}"
		>
			<div class="min-w-0">
				{#if done}
					<div class="font-semibold text-emerald-700 dark:text-emerald-400">Done · {formatInstant(task.completed_at, tz)}</div>
				{:else if overdue}
					<div class="font-semibold text-red-600 dark:text-red-400">Overdue · was due {formatDate(task.due_date)}</div>
				{:else}
					<div class="font-semibold">{STATUS_LABEL[task.status]}{task.due_date ? ` · due ${formatDate(task.due_date)}` : ''}</div>
				{/if}
				<div class="text-xs text-slate-500">Created {formatInstant(task.created_at, tz)} · Updated {formatInstant(task.updated_at, tz)}</div>
			</div>
			{#if done}
				<form method="POST" action="?/reopen" use:enhance>
					<button class="btn-secondary">Reopen</button>
				</form>
			{:else}
				<button type="button" class="btn bg-emerald-600 text-white hover:bg-emerald-500" onclick={() => (completing = task)}>
					Mark done
				</button>
			{/if}
		</section>

		<!-- Edit -->
		<form method="POST" action="?/save" class="card space-y-4" use:enhance={keep}>
			<div class="flex flex-col gap-1">
				<label for="title">Title</label>
				<input id="title" name="title" value={task.title} required maxlength="300" />
			</div>

			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="flex flex-col gap-1">
					<label for="workspace_id">Workspace</label>
					<select id="workspace_id" name="workspace_id" value={task.workspace_id}>
						{#each page.data.workspaces as ws (ws.id)}<option value={ws.id}>{ws.name}</option>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="priority">Priority</label>
					<select id="priority" name="priority" value={task.priority}>
						{#each PRIORITIES as p (p)}<option value={p}>{PRIORITY_LABEL[p]}</option>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="status">Status</label>
					<select id="status" name="status" bind:value={status}>
						{#each STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="due_date">Due date</label>
					<input id="due_date" name="due_date" type="date" value={task.due_date ?? ''} />
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<label for="source">Source / assigned by</label>
				<input
					id="source"
					name="source"
					value={task.source ?? ''}
					list="source-options"
					autocomplete="off"
					placeholder="e.g. a person, client email, phone call"
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label for="description">Description</label>
				<textarea id="description" name="description" rows="5">{task.description ?? ''}</textarea>
			</div>

			{#if status === 'done'}
				<div class="flex flex-col gap-1">
					<label for="completion_notes">What did you do?</label>
					<textarea id="completion_notes" name="completion_notes" rows="4">{task.completion_notes ?? ''}</textarea>
				</div>
			{/if}

			<div class="flex items-center justify-end gap-3">
				{#if saved}<span class="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>{/if}
				<button class="btn-primary">Save changes</button>
			</div>
		</form>

		<!-- Links -->
		<section class="card space-y-3">
			<h2 class="font-semibold">Links</h2>
			{#if data.links.length}
				<ul class="divide-y divide-slate-100 dark:divide-slate-800">
					{#each data.links as link (link.id)}
						<li class="flex items-center gap-2 py-2">
							<a
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								class="min-w-0 flex-1 truncate text-indigo-600 hover:underline dark:text-indigo-400"
								>{link.label || link.url}</a
							>
							<form method="POST" action="?/removeLink" use:enhance>
								<input type="hidden" name="link_id" value={link.id} />
								<button class="text-xs text-slate-400 hover:text-red-600" aria-label="Remove link">Remove</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			<form method="POST" action="?/addLink" class="flex flex-col gap-2 sm:flex-row" use:enhance>
				<input name="url" type="text" inputmode="url" placeholder="https://…" required class="min-w-0 flex-1" aria-label="URL" />
				<input name="label" placeholder="Label (optional)" class="sm:w-48" aria-label="Label" />
				<button class="btn-secondary">Add link</button>
			</form>
		</section>

		<!-- Attachments -->
		<section class="card space-y-3">
			<h2 class="font-semibold">Attachments</h2>
			{#if data.attachments.length}
				<ul class="grid gap-2 sm:grid-cols-2">
					{#each data.attachments as a (a.id)}
						<li class="flex items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
							{#if a.mime.startsWith('image/') && a.mime !== 'image/heic' && a.mime !== 'image/heif'}
								<a href="/files/{a.id}" target="_blank"><img src="/files/{a.id}" alt="" class="h-12 w-12 rounded object-cover" /></a>
							{:else}
								<span class="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-500 uppercase dark:bg-slate-800"
									>{a.original_name.split('.').pop()}</span
								>
							{/if}
							<div class="min-w-0 flex-1">
								<a href="/files/{a.id}" target="_blank" class="block truncate text-sm font-medium hover:underline">{a.original_name}</a>
								<div class="text-xs text-slate-500">{fmtSize(a.size)}</div>
							</div>
							<form method="POST" action="?/removeAttachment" use:enhance>
								<input type="hidden" name="attachment_id" value={a.id} />
								<button class="text-xs text-slate-400 hover:text-red-600" aria-label="Remove attachment">Remove</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			<form method="POST" action="?/upload" enctype="multipart/form-data" class="flex flex-col gap-2 sm:flex-row sm:items-center" use:enhance>
				<input type="file" name="files" multiple accept={data.accept} required class="min-w-0 flex-1 text-sm" aria-label="Files" />
				<button class="btn-secondary">Upload</button>
			</form>
			<p class="text-xs text-slate-500">Photos, PDFs, Office docs. Up to {data.maxUploadMb} MB each.</p>
		</section>
	</div>

	<aside class="space-y-4">
		<section class="card">
			<h2 class="mb-3 font-semibold">History</h2>
			<ol class="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
				{#each data.history as h (h.id)}
					<li class="relative">
						<span class="absolute top-1.5 -left-[1.4rem] h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
						<div class="text-sm break-words">{describeHistory(h)}</div>
						{#if h.action === 'updated' && isLongField(h.field)}
							<details class="text-xs text-slate-500">
								<summary class="cursor-pointer">Show change</summary>
								<div class="mt-1 rounded bg-red-50 p-2 whitespace-pre-wrap line-through dark:bg-red-950/50">{h.old_value ?? '(empty)'}</div>
								<div class="mt-1 rounded bg-emerald-50 p-2 whitespace-pre-wrap dark:bg-emerald-950/50">{h.new_value ?? '(empty)'}</div>
							</details>
						{/if}
						<div class="text-xs text-slate-500">{formatInstant(h.at, tz)}</div>
					</li>
				{/each}
			</ol>
		</section>

		{#if !task.archived_at}
			<form
				method="POST"
				action="?/archive"
				use:enhance={({ cancel }) => {
					if (!confirm('Archive this task? It stays recoverable from the Archive page.')) cancel();
				}}
			>
				<button class="btn-danger w-full">Archive task</button>
			</form>
		{/if}
	</aside>
</div>

<CompleteDialog task={completing} onclose={() => (completing = null)} />
