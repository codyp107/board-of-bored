<script lang="ts">
	let { form } = $props();
</script>

<svelte:head><title>Set up · Board of Bored</title></svelte:head>

<div class="mx-auto mt-12 max-w-sm px-4">
	<h1 class="text-2xl font-bold">Welcome to Board of Bored</h1>
	<p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
		Create your account. This is the only account, and this page goes away once it exists.
	</p>
	<form method="POST" class="card mt-6 space-y-4">
		{#if form?.error}<p class="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{form.error}</p>{/if}
		<div class="flex flex-col gap-1">
			<label for="username">Username</label>
			<input id="username" name="username" autocomplete="username" required value={form?.username ?? ''} />
		</div>
		<div class="flex flex-col gap-1">
			<label for="password">Password (10+ characters)</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
		</div>
		<div class="flex flex-col gap-1">
			<label for="confirm">Confirm password</label>
			<input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required />
		</div>
		<button class="btn-primary w-full">Create account</button>
	</form>
</div>
