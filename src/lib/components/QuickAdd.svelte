<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { Workspace } from '$lib/constants';

	let { workspaces, currentSlug }: { workspaces: Workspace[]; currentSlug: string | null } = $props();

	let selected = $state('');
	let title = $state('');
	let busy = $state(false);
	let added = $state<{ id: number; title: string } | null>(null);
	let error = $state('');
	let input = $state<HTMLInputElement>();

	function lastUsed(): string | null {
		try {
			return localStorage.getItem('quickadd-ws');
		} catch {
			return null;
		}
	}

	// Default to the current tab's workspace; on "All", fall back to the last one used.
	$effect(() => {
		const slugs = workspaces.map((w) => w.slug);
		if (currentSlug && slugs.includes(currentSlug)) {
			selected = currentSlug;
		} else if (!untrack(() => selected)) {
			const last = lastUsed();
			selected = last && slugs.includes(last) ? last : (slugs[0] ?? '');
		}
	});

	const color = $derived(workspaces.find((w) => w.slug === selected)?.color ?? '#64748b');
</script>

<form
	method="POST"
	action="/quick-add"
	class="flex items-center gap-2 pb-2"
	use:enhance={() => {
		busy = true;
		error = '';
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success') {
				added = result.data as { id: number; title: string };
				title = '';
				try {
					localStorage.setItem('quickadd-ws', selected);
				} catch {
					// ignore
				}
				await invalidateAll();
				input?.focus();
			} else if (result.type === 'failure') {
				error = (result.data?.error as string) ?? 'Could not add task';
			} else {
				await applyAction(result);
			}
		};
	}}
>
	<div class="flex min-w-0 flex-1 items-center rounded-lg border-2 bg-white dark:bg-slate-900" style="border-color: {color}">
		<input
			bind:this={input}
			bind:value={title}
			name="title"
			required
			maxlength="300"
			autocomplete="off"
			enterkeyhint="done"
			placeholder="Add a task…"
			aria-label="New task title"
			class="min-w-0 flex-1 border-0 bg-transparent focus:ring-0 focus:outline-none"
		/>
		<select
			name="workspace"
			bind:value={selected}
			aria-label="Workspace"
			class="max-w-[9rem] border-0 bg-transparent pr-1 text-sm font-semibold focus:outline-none sm:max-w-none"
			style="color: {color}"
		>
			{#each workspaces as ws (ws.slug)}
				<option value={ws.slug}>{ws.name}</option>
			{/each}
		</select>
	</div>
	<button class="btn-primary shrink-0 px-3 py-2.5" disabled={busy || !title.trim()} aria-label="Add task">
		<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
	</button>
</form>
{#if error}
	<p class="pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
{:else if added}
	<p class="pb-2 text-sm text-slate-600 dark:text-slate-400">
		Added “{added.title}” ·
		<a href="/tasks/{added.id}" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">add details</a>
		<button type="button" class="ml-1 text-slate-400" onclick={() => (added = null)} aria-label="Dismiss">✕</button>
	</p>
{/if}
