import type { DB } from './db';
import { config } from './config';
import { completedBetween, listWorkspaces } from './tasks';
import type { Task, Workspace } from '../constants';
import { isRangePreset, rangeToUtc, resolveRange, todayIn, type DateRange, type RangePreset } from '../dates';

export interface ReportGroup {
	workspace: Workspace;
	tasks: Task[];
}

export interface Report {
	preset: RangePreset;
	range: DateRange;
	workspaces: Workspace[]; // selected
	allWorkspaces: Workspace[];
	groups: ReportGroup[];
	total: number;
}

/** Build a report from query params: preset, from, to, ws (repeatable slug). */
export function buildReport(db: DB, params: URLSearchParams, now: Date = new Date()): Report {
	const preset = isRangePreset(params.get('preset')) ? (params.get('preset') as RangePreset) : 'this_month';
	const today = todayIn(config.tz, now);
	const range = resolveRange(preset, today, {
		from: params.get('from') ?? undefined,
		to: params.get('to') ?? undefined
	});

	const allWorkspaces = listWorkspaces(db);
	const wanted = new Set(params.getAll('ws'));
	const workspaces = wanted.size ? allWorkspaces.filter((w) => wanted.has(w.slug)) : allWorkspaces;

	const { startIso, endIso } = rangeToUtc(range, config.tz);
	const tasks = completedBetween(
		db,
		startIso,
		endIso,
		workspaces.map((w) => w.id)
	);
	const groups = workspaces
		.map((workspace) => ({ workspace, tasks: tasks.filter((t) => t.workspace_id === workspace.id) }))
		.filter((g) => g.tasks.length > 0);

	return { preset, range, workspaces, allWorkspaces, groups, total: tasks.length };
}
