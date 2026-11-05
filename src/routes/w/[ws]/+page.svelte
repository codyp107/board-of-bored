<script lang="ts">
	import TaskBoard from '$lib/components/TaskBoard.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{data.ws?.name ?? 'All'} · Board of Bored</title></svelte:head>

<TaskBoard ws={data.ws} view={data.view} tasks={data.tasks} counts={data.counts} filters={data.filters} />
