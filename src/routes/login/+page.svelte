<script lang="ts">
	let { form } = $props();
</script>

<svelte:head><title>Sign in · Board of Bored</title></svelte:head>

<div class="mx-auto mt-16 max-w-sm px-4">
	<div class="flex items-center gap-3">
		<img src="/icon-192.png" alt="" class="h-10 w-10 rounded-xl" />
		<h1 class="text-2xl font-bold">Board of Bored</h1>
	</div>
	<form method="POST" class="card mt-6 space-y-4">
		{#if form?.error}<p class="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{form.error}</p>{/if}
		<div class="flex flex-col gap-1">
			<label for="username">Username</label>
			<input id="username" name="username" autocomplete="username" autocapitalize="none" required value={form?.username ?? ''} />
		</div>
		<div class="flex flex-col gap-1">
			<label for="password">Password</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
		</div>
		<label class="flex items-center gap-2">
			<input type="checkbox" name="remember" checked />
			Keep me signed in for 90 days
		</label>
		<button class="btn-primary w-full">Sign in</button>
	</form>
</div>
