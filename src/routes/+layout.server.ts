import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { listSources, listWorkspaces } from '$lib/server/tasks';
import { todayIn } from '$lib/dates';

export function load({ locals }) {
	if (!locals.user) return { user: null, workspaces: [], sources: [], tz: config.tz, today: todayIn(config.tz) };
	const db = getDb();
	return {
		user: locals.user,
		workspaces: listWorkspaces(db),
		sources: listSources(db),
		tz: config.tz,
		today: todayIn(config.tz)
	};
}
