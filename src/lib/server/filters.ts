import { error } from '@sveltejs/kit';
import { DUE_FILTERS, type DueFilter, type Workspace } from '../constants';
import type { DB } from './db';
import { getWorkspaceBySlug } from './tasks';

export interface FilterParams {
	q: string;
	status: string;
	priority: string;
	due: DueFilter | '';
	source: string;
}

export function parseFilters(sp: URLSearchParams): FilterParams {
	const due = sp.get('due') ?? '';
	return {
		q: sp.get('q') ?? '',
		status: sp.get('status') ?? '',
		priority: sp.get('priority') ?? '',
		due: due in DUE_FILTERS ? (due as DueFilter) : '',
		source: sp.get('source') ?? ''
	};
}

/** 'all' → null; a known slug → that workspace; anything else → 404. */
export function resolveWorkspace(db: DB, slug: string): Workspace | null {
	if (slug === 'all') return null;
	const ws = getWorkspaceBySlug(db, slug);
	if (!ws) error(404, 'Workspace not found');
	return ws;
}
