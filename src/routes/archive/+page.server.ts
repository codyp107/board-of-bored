import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { listTasks } from '$lib/server/tasks';
import { todayIn } from '$lib/dates';

export function load({ url }) {
	return {
		q: url.searchParams.get('q') ?? '',
		tasks: listTasks(getDb(), { view: 'archived', q: url.searchParams.get('q') }, todayIn(config.tz))
	};
}
