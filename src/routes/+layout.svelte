<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	const wsSlug = $derived(page.params.ws ?? 'all');
	const inCompleted = $derived(path.startsWith('/w/') && path.endsWith('/completed'));
	const onBoard = $derived(path.startsWith('/w/'));
	const tabs = $derived([{ slug: 'all', name: 'All', color: '#64748b' }, ...data.workspaces]);

	const nav = $derived([
		{ href: `/w/${wsSlug}`, label: 'Board', active: onBoard && !inCompleted },
		{ href: `/w/${wsSlug}/completed`, label: 'Completed', active: inCompleted },
		{ href: '/reports', label: 'Reports', active: path.startsWith('/reports') },
		{ href: '/archive', label: 'Archive', active: path.startsWith('/archive') }
	]);
</script>

{#if data.user}
	<header
		class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
	>
		<div class="mx-auto max-w-5xl px-3 sm:px-4">
			<div class="flex items-center gap-2 py-2">
				<a href="/w/all" class="flex shrink-0 items-center gap-2 font-bold">
					<img src="/icon-192.png" alt="" class="h-7 w-7 rounded-lg" />
					<span class="hidden sm:inline">Board of Bored</span>
				</a>
				<nav class="flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm">
					{#each nav as item (item.label)}
						<a
							href={item.href}
							class="shrink-0 rounded-lg px-3 py-1.5 font-medium {item.active
								? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
								: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}">{item.label}</a
						>
					{/each}
				</nav>
				<ThemeToggle />
				<form method="POST" action="/logout">
					<button
						class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
						title="Sign out"
						aria-label="Sign out"
					>
						<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
							><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg
						>
					</button>
				</form>
			</div>

			<QuickAdd workspaces={data.workspaces} currentSlug={wsSlug === 'all' ? null : wsSlug} />

			{#if onBoard}
				<div class="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0">
					{#each tabs as tab (tab.slug)}
						{@const active = tab.slug === wsSlug}
						<a
							href="/w/{tab.slug}{inCompleted ? '/completed' : ''}"
							class="shrink-0 border-b-[3px] px-3 py-2 text-sm font-semibold {active
								? 'text-slate-900 dark:text-white'
								: 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}"
							style={active ? `border-color: ${tab.color}` : ''}
						>
							<span class="mr-1 inline-block h-2 w-2 rounded-full" style="background: {tab.color}"></span>
							{tab.name}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</header>

	<datalist id="source-options">
		{#each data.sources as s (s)}<option value={s}></option>{/each}
	</datalist>

	<main class="mx-auto max-w-5xl px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:px-4">
		{@render children()}
	</main>
{:else}
	<main>{@render children()}</main>
{/if}
