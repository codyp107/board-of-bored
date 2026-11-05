import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { parseFilters, resolveWorkspace } from '$lib/server/filters';
import { getCounts, listTasks } from '$lib/server/tasks';
import { todayIn } from '$lib/dates';

export function load({ params, url }) {
	const db = getDb();
	const ws = resolveWorkspace(db, params.ws);
	const today = todayIn(config.tz);
	const filters = parseFilters(url.searchParams);
	return {
		ws,
		view: 'completed' as const,
		filters,
		counts: getCounts(db, ws?.id ?? null, today, config.tz),
		tasks: listTasks(
			db,
			{ ...filters, status: null, due: filters.due || null, workspaceId: ws?.id, view: 'completed' },
			today
		)
	};
}
