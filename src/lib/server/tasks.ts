import type { DB } from './db';
import {
	PRIORITIES,
	STATUSES,
	type Attachment,
	type DueFilter,
	type HistoryEntry,
	type Priority,
	type Status,
	type Task,
	type TaskLink,
	type Workspace
} from '../constants';
import { endOfWeek, isDateStr, startOfMonth, zonedMidnightUtc, type DateStr } from '../dates';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

const TASK_SELECT = `
	SELECT t.*, w.slug AS workspace_slug, w.name AS workspace_name, w.color AS workspace_color
	FROM tasks t JOIN workspaces w ON w.id = t.workspace_id`;

const PRIORITY_ORDER = `CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;

function clean(v: unknown): string | null {
	if (v === undefined || v === null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
}

function iso(now: Date): string {
	return now.toISOString();
}

// ---------- workspaces ----------

export function listWorkspaces(db: DB): Workspace[] {
	return db.prepare('SELECT * FROM workspaces ORDER BY sort_order, id').all() as Workspace[];
}

export function getWorkspaceBySlug(db: DB, slug: string): Workspace | undefined {
	return db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as Workspace | undefined;
}

function workspaceName(db: DB, id: number | null): string | null {
	if (id === null) return null;
	const row = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(id) as { name: string } | undefined;
	return row?.name ?? String(id);
}

// ---------- history ----------

function logHistory(
	db: DB,
	taskId: number,
	at: string,
	action: string,
	field: string | null = null,
	oldValue: unknown = null,
	newValue: unknown = null
): void {
	db.prepare(
		'INSERT INTO task_history (task_id, at, action, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
	).run(
		taskId,
		at,
		action,
		field,
		oldValue === null ? null : String(oldValue),
		newValue === null ? null : String(newValue)
	);
}

export function listHistory(db: DB, taskId: number): HistoryEntry[] {
	return db
		.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY at DESC, id DESC')
		.all(taskId) as HistoryEntry[];
}

// ---------- tasks ----------

export interface NewTask {
	workspaceId: number;
	title: string;
	description?: string | null;
	priority?: string | null;
	status?: string | null;
	dueDate?: string | null;
	source?: string | null;
}

function checkPriority(v: unknown): Priority {
	if (!PRIORITIES.includes(v as Priority)) throw new ValidationError(`Invalid priority: ${v}`);
	return v as Priority;
}

function checkStatus(v: unknown): Status {
	if (!STATUSES.includes(v as Status)) throw new ValidationError(`Invalid status: ${v}`);
	return v as Status;
}

function checkDue(v: unknown): string | null {
	const s = clean(v);
	if (s === null) return null;
	if (!isDateStr(s)) throw new ValidationError(`Invalid due date: ${s}`);
	return s;
}

export function createTask(db: DB, input: NewTask, now: Date = new Date()): number {
	const title = clean(input.title);
	if (!title) throw new ValidationError('Title is required');
	if (!db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(input.workspaceId))
		throw new ValidationError('Unknown workspace');
	const priority = checkPriority(clean(input.priority) ?? 'normal');
	const status = checkStatus(clean(input.status) ?? 'open');
	const due = checkDue(input.dueDate);
	const ts = iso(now);

	return db.transaction(() => {
		const r = db
			.prepare(
				`INSERT INTO tasks (workspace_id, title, description, priority, status, due_date, source,
					created_at, updated_at, completed_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				input.workspaceId,
				title,
				clean(input.description),
				priority,
				status,
				due,
				clean(input.source),
				ts,
				ts,
				status === 'done' ? ts : null
			);
		const id = Number(r.lastInsertRowid);
		logHistory(db, id, ts, 'created', null, null, title);
		return id;
	})();
}

export function getTask(db: DB, id: number): Task | undefined {
	return db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as Task | undefined;
}

export type TaskPatch = Partial<{
	workspace_id: number;
	title: string;
	description: string | null;
	priority: string;
	status: string;
	due_date: string | null;
	source: string | null;
	completion_notes: string | null;
}>;

const EDITABLE = [
	'workspace_id',
	'title',
	'description',
	'priority',
	'status',
	'due_date',
	'source',
	'completion_notes'
] as const;
type Editable = (typeof EDITABLE)[number];

function normalizeField(db: DB, field: Editable, value: unknown): string | number | null {
	switch (field) {
		case 'workspace_id': {
			const id = Number(value);
			if (!db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(id)) throw new ValidationError('Unknown workspace');
			return id;
		}
		case 'title': {
			const t = clean(value);
			if (!t) throw new ValidationError('Title is required');
			return t;
		}
		case 'priority':
			return checkPriority(clean(value));
		case 'status':
			return checkStatus(clean(value));
		case 'due_date':
			return checkDue(value);
		default:
			return clean(value);
	}
}

/**
 * Apply a patch and record one history row per changed field, atomically.
 * Moving into 'done' stamps completed_at; moving out of 'done' clears it
 * (the history keeps the earlier completion).
 */
export function updateTask(db: DB, id: number, patch: TaskPatch, now: Date = new Date()): Task {
	return db.transaction(() => {
		const cur = getTask(db, id);
		if (!cur) throw new NotFoundError(`Task ${id} not found`);

		const changes: { field: Editable; from: string | number | null; to: string | number | null }[] = [];
		for (const field of EDITABLE) {
			if (!(field in patch)) continue;
			const to = normalizeField(db, field, patch[field]);
			const from = cur[field] as string | number | null;
			if (to !== from) changes.push({ field, from, to });
		}
		if (changes.length === 0) return cur;

		const ts = iso(now);
		const sets: string[] = [];
		const params: (string | number | null)[] = [];
		for (const c of changes) {
			sets.push(`${c.field} = ?`);
			params.push(c.to);
		}

		const statusChange = changes.find((c) => c.field === 'status');
		if (statusChange) {
			if (statusChange.to === 'done') {
				sets.push('completed_at = ?');
				params.push(ts);
			} else if (statusChange.from === 'done') {
				sets.push('completed_at = NULL');
			}
		}
		sets.push('updated_at = ?');
		params.push(ts);
		db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);

		for (const c of changes) {
			if (c.field === 'status') {
				const action = c.to === 'done' ? 'completed' : c.from === 'done' ? 'reopened' : 'status';
				logHistory(db, id, ts, action, 'status', c.from, c.to);
			} else if (c.field === 'workspace_id') {
				logHistory(db, id, ts, 'updated', 'workspace', workspaceName(db, c.from as number), workspaceName(db, c.to as number));
			} else {
				logHistory(db, id, ts, 'updated', c.field, c.from, c.to);
			}
		}
		return getTask(db, id)!;
	})();
}

export function completeTask(db: DB, id: number, notes: string | null, now: Date = new Date()): Task {
	return updateTask(db, id, { status: 'done', completion_notes: notes }, now);
}

export function reopenTask(db: DB, id: number, now: Date = new Date()): Task {
	return updateTask(db, id, { status: 'open' }, now);
}

export function archiveTask(db: DB, id: number, now: Date = new Date()): void {
	db.transaction(() => {
		const cur = getTask(db, id);
		if (!cur) throw new NotFoundError(`Task ${id} not found`);
		if (cur.archived_at) return;
		const ts = iso(now);
		db.prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
		logHistory(db, id, ts, 'archived');
	})();
}

export function restoreTask(db: DB, id: number, now: Date = new Date()): void {
	db.transaction(() => {
		const cur = getTask(db, id);
		if (!cur) throw new NotFoundError(`Task ${id} not found`);
		if (!cur.archived_at) return;
		const ts = iso(now);
		db.prepare('UPDATE tasks SET archived_at = NULL, updated_at = ? WHERE id = ?').run(ts, id);
		logHistory(db, id, ts, 'restored');
	})();
}

// ---------- listing ----------

export type TaskView = 'active' | 'completed' | 'archived';

export interface TaskFilters {
	workspaceId?: number | null;
	view: TaskView;
	status?: string | null;
	priority?: string | null;
	due?: DueFilter | null;
	source?: string | null;
	q?: string | null;
}

export function listTasks(db: DB, f: TaskFilters, today: DateStr): Task[] {
	const where: string[] = [];
	const params: (string | number)[] = [];

	where.push(f.view === 'archived' ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL');
	if (f.view === 'active') where.push(`t.status <> 'done'`);
	if (f.view === 'completed') where.push(`t.status = 'done'`);

	if (f.workspaceId) {
		where.push('t.workspace_id = ?');
		params.push(f.workspaceId);
	}
	if (f.status && STATUSES.includes(f.status as Status)) {
		where.push('t.status = ?');
		params.push(f.status);
	}
	if (f.priority && PRIORITIES.includes(f.priority as Priority)) {
		where.push('t.priority = ?');
		params.push(f.priority);
	}
	switch (f.due) {
		case 'overdue':
			where.push(`t.due_date < ? AND t.status <> 'done'`);
			params.push(today);
			break;
		case 'today':
			where.push('t.due_date = ?');
			params.push(today);
			break;
		case 'week':
			where.push('t.due_date BETWEEN ? AND ?');
			params.push(today, endOfWeek(today));
			break;
		case 'none':
			where.push('t.due_date IS NULL');
			break;
	}
	const source = clean(f.source);
	if (source) {
		where.push('t.source = ? COLLATE NOCASE');
		params.push(source);
	}
	const q = clean(f.q);
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
		where.push(
			`(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR t.source LIKE ? ESCAPE '\\' OR t.completion_notes LIKE ? ESCAPE '\\')`
		);
		params.push(like, like, like, like);
	}

	let order: string;
	if (f.view === 'completed') {
		order = 't.completed_at DESC, t.id DESC';
	} else if (f.view === 'archived') {
		order = 't.archived_at DESC, t.id DESC';
	} else {
		// overdue → priority → due date (undated last) → newest
		order = `CASE WHEN t.due_date IS NOT NULL AND t.due_date < ? THEN 0 ELSE 1 END,
			${PRIORITY_ORDER}, t.due_date IS NULL, t.due_date, t.created_at DESC`;
		params.push(today);
	}

	return db
		.prepare(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}`)
		.all(...params) as Task[];
}

export interface Counts {
	open: number;
	dueThisWeek: number;
	overdue: number;
	completedThisMonth: number;
}

export function getCounts(db: DB, workspaceId: number | null, today: DateStr, tz: string): Counts {
	const ws = workspaceId ? ' AND workspace_id = ?' : '';
	const wsp = workspaceId ? [workspaceId] : [];
	const active = `archived_at IS NULL AND status <> 'done'`;
	const n = (sql: string, ...p: (string | number)[]) =>
		(db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${sql}${ws}`).get(...p, ...wsp) as { n: number }).n;

	return {
		open: n(active),
		dueThisWeek: n(`${active} AND due_date BETWEEN ? AND ?`, today, endOfWeek(today)),
		overdue: n(`${active} AND due_date < ?`, today),
		completedThisMonth: n(
			`archived_at IS NULL AND status = 'done' AND completed_at >= ?`,
			zonedMidnightUtc(startOfMonth(today), tz).toISOString()
		)
	};
}

/** Past sources, most used first, for autocomplete. */
export function listSources(db: DB): string[] {
	return (
		db
			.prepare(
				`SELECT source, COUNT(*) AS c FROM tasks WHERE source IS NOT NULL AND source <> ''
				 GROUP BY source COLLATE NOCASE ORDER BY c DESC, source LIMIT 100`
			)
			.all() as { source: string }[]
	).map((r) => r.source);
}

/** Completed (non-archived) tasks with completed_at in [startIso, endIso). */
export function completedBetween(db: DB, startIso: string, endIso: string, workspaceIds: number[]): Task[] {
	if (workspaceIds.length === 0) return [];
	return db
		.prepare(
			`${TASK_SELECT}
			 WHERE t.archived_at IS NULL AND t.status = 'done'
			   AND t.completed_at >= ? AND t.completed_at < ?
			   AND t.workspace_id IN (${workspaceIds.map(() => '?').join(',')})
			 ORDER BY w.sort_order, t.completed_at`
		)
		.all(startIso, endIso, ...workspaceIds) as Task[];
}

// ---------- links ----------

export function normalizeUrl(raw: string): string {
	let s = raw.trim();
	if (!s) throw new ValidationError('URL is required');
	if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
	let u: URL;
	try {
		u = new URL(s);
	} catch {
		throw new ValidationError('That does not look like a valid URL');
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ValidationError('Only http and https links are allowed');
	return u.toString();
}

export function addLink(db: DB, taskId: number, url: string, label: string | null, now: Date = new Date()): number {
	const clean_url = normalizeUrl(url);
	return db.transaction(() => {
		if (!getTask(db, taskId)) throw new NotFoundError(`Task ${taskId} not found`);
		const ts = iso(now);
		const r = db
			.prepare('INSERT INTO task_links (task_id, url, label, created_at) VALUES (?, ?, ?, ?)')
			.run(taskId, clean_url, clean(label), ts);
		logHistory(db, taskId, ts, 'link_added', 'link', null, clean_url);
		return Number(r.lastInsertRowid);
	})();
}

export function listLinks(db: DB, taskId: number): TaskLink[] {
	return db
		.prepare('SELECT * FROM task_links WHERE task_id = ? AND archived_at IS NULL ORDER BY id')
		.all(taskId) as TaskLink[];
}

export function archiveLink(db: DB, taskId: number, linkId: number, now: Date = new Date()): void {
	db.transaction(() => {
		const link = db
			.prepare('SELECT * FROM task_links WHERE id = ? AND task_id = ? AND archived_at IS NULL')
			.get(linkId, taskId) as TaskLink | undefined;
		if (!link) return;
		const ts = iso(now);
		db.prepare('UPDATE task_links SET archived_at = ? WHERE id = ?').run(ts, linkId);
		logHistory(db, taskId, ts, 'link_removed', 'link', link.url, null);
	})();
}

// ---------- attachments ----------

export function addAttachment(
	db: DB,
	taskId: number,
	a: { originalName: string; storedName: string; mime: string; size: number },
	now: Date = new Date()
): number {
	return db.transaction(() => {
		if (!getTask(db, taskId)) throw new NotFoundError(`Task ${taskId} not found`);
		const ts = iso(now);
		const r = db
			.prepare(
				'INSERT INTO attachments (task_id, original_name, stored_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run(taskId, a.originalName, a.storedName, a.mime, a.size, ts);
		logHistory(db, taskId, ts, 'attachment_added', 'attachment', null, a.originalName);
		return Number(r.lastInsertRowid);
	})();
}

export function listAttachments(db: DB, taskId: number): Attachment[] {
	return db
		.prepare('SELECT * FROM attachments WHERE task_id = ? AND archived_at IS NULL ORDER BY id')
		.all(taskId) as Attachment[];
}

export function getAttachment(db: DB, id: number): Attachment | undefined {
	return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment | undefined;
}

export function archiveAttachment(db: DB, taskId: number, attachmentId: number, now: Date = new Date()): void {
	db.transaction(() => {
		const a = db
			.prepare('SELECT * FROM attachments WHERE id = ? AND task_id = ? AND archived_at IS NULL')
			.get(attachmentId, taskId) as Attachment | undefined;
		if (!a) return;
		const ts = iso(now);
		db.prepare('UPDATE attachments SET archived_at = ? WHERE id = ?').run(ts, attachmentId);
		logHistory(db, taskId, ts, 'attachment_removed', 'attachment', a.original_name, null);
	})();
}
