<script lang="ts">
	let dark = $state(false);

	$effect(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggle() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('theme', dark ? 'dark' : 'light');
		} catch {
			// storage unavailable; the choice just won't persist
		}
	}
</script>

<button
	type="button"
	onclick={toggle}
	class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
	title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	aria-label="Toggle dark mode"
>
	{#if dark}
		<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
			><circle cx="12" cy="12" r="4" /><path
				d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
			/></svg
		>
	{:else}
		<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
			><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg
		>
	{/if}
</button>
