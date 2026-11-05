<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let {
		task,
		onclose
	}: { task: { id: number; title: string } | null; onclose: () => void } = $props();

	let dialog = $state<HTMLDialogElement>();
	let busy = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (task && !dialog.open) dialog.showModal();
		else if (!task && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	{onclose}
	class="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl bg-white p-0 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100"
>
	{#if task}
		<form
			method="POST"
			action="/tasks/{task.id}?/complete"
			class="space-y-3 p-5"
			use:enhance={() => {
				busy = true;
				return async ({ result }) => {
					busy = false;
					if (result.type === 'success' || result.type === 'redirect') {
						dialog?.close();
						await invalidateAll();
					} else {
						await applyAction(result);
					}
				};
			}}
		>
			<h2 class="text-lg font-bold">Mark done</h2>
			<p class="text-sm text-slate-600 dark:text-slate-400">{task.title}</p>
			<div class="flex flex-col gap-1">
				<label for="completion-notes">What did you do?</label>
				<!-- svelte-ignore a11y_autofocus -->
				<textarea id="completion-notes" name="notes" rows="4" autofocus placeholder="Optional, but your future self will thank you"
				></textarea>
			</div>
			<div class="flex justify-end gap-2">
				<button type="button" class="btn-secondary" onclick={() => dialog?.close()}>Cancel</button>
				<button class="btn bg-emerald-600 text-white hover:bg-emerald-500" disabled={busy}>Mark done</button>
			</div>
		</form>
	{/if}
</dialog>
