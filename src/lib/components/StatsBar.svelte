<script lang="ts">
	let {
		counts,
		slug
	}: { counts: { open: number; dueThisWeek: number; overdue: number; completedThisMonth: number }; slug: string } =
		$props();

	const tiles = $derived([
		{ label: 'Open', value: counts.open, href: `/w/${slug}`, tone: '' },
		{ label: 'Due this week', value: counts.dueThisWeek, href: `/w/${slug}?due=week`, tone: '' },
		{
			label: 'Overdue',
			value: counts.overdue,
			href: `/w/${slug}?due=overdue`,
			tone: counts.overdue > 0 ? 'text-red-600 dark:text-red-400' : ''
		},
		{
			label: 'Done this month',
			value: counts.completedThisMonth,
			href: `/w/${slug}/completed`,
			tone: 'text-emerald-600 dark:text-emerald-400'
		}
	]);
</script>

<div class="grid grid-cols-4 gap-2">
	{#each tiles as t (t.label)}
		<a
			href={t.href}
			class="rounded-xl border border-slate-200 bg-white px-2 py-2 text-center shadow-sm hover:border-slate-300 sm:px-4 sm:py-3 sm:text-left dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
		>
			<div class="text-2xl font-bold tabular-nums {t.tone}">{t.value}</div>
			<div class="text-[11px] leading-tight text-slate-500 sm:text-xs">{t.label}</div>
		</a>
	{/each}
</div>
