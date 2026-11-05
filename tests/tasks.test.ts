import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/lib/server/db';
import {
	addAttachment,
	addLink,
	archiveLink,
	archiveTask,
	completedBetween,
	completeTask,
	createTask,
	getCounts,
	getTask,
	listAttachments,
	listHistory,
	listLinks,
	listSources,
	listTasks,
	listWorkspaces,
	reopenTask,
	restoreTask,
	updateTask,
	ValidationError
} from '../src/lib/server/tasks';
import { rangeToUtc, resolveRange } from '../src/lib/dates';

const TZ = 'America/Denver';
const TODAY = '2026-11-05';
let db: DB;
let rise: number;
let home: number;

beforeEach(() => {
	db = openDb(':memory:');
	const ws = listWorkspaces(db);
	rise = ws.find((w) => w.slug === 'rise')!.id;
	home = ws.find((w) => w.slug === 'home')!.id;
});

describe('schema', () => {
	it('seeds the three workspaces in order', () => {
		expect(listWorkspaces(db).map((w) => w.name)).toEqual(['Rise Internet', 'Pitcher Technologies', 'Home']);
	});

	it('refuses to hard-delete tasks, links, attachments or history', () => {
		const id = createTask(db, { workspaceId: rise, title: 'Keep me' });
		addLink(db, id, 'example.com', null);
		addAttachment(db, id, { originalName: 'a.pdf', storedName: 'x/a.pdf', mime: 'application/pdf', size: 1 });
		expect(() => db.prepare('DELETE FROM tasks WHERE id = ?').run(id)).toThrow(/archive/);
		expect(() => db.prepare('DELETE FROM task_links').run()).toThrow(/archive/);
		expect(() => db.prepare('DELETE FROM attachments').run()).toThrow(/archive/);
		expect(() => db.prepare('DELETE FROM task_history').run()).toThrow(/append-only/);
		expect(() => db.prepare("UPDATE task_history SET action = 'x'").run()).toThrow(/append-only/);
	});
});

describe('createTask', () => {
	it('creates with defaults and logs history', () => {
		const id = createTask(db, { workspaceId: rise, title: '  Inspect tower 12  ' });
		const t = getTask(db, id)!;
		expect(t.title).toBe('Inspect tower 12');
		expect(t.priority).toBe('normal');
		expect(t.status).toBe('open');
		expect(t.workspace_slug).toBe('rise');
		expect(t.completed_at).toBeNull();
		expect(listHistory(db, id).map((h) => h.action)).toEqual(['created']);
	});

	it('validates input', () => {
		expect(() => createTask(db, { workspaceId: rise, title: '   ' })).toThrow(ValidationError);
		expect(() => createTask(db, { workspaceId: 999, title: 'x' })).toThrow(ValidationError);
		expect(() => createTask(db, { workspaceId: rise, title: 'x', priority: 'meh' })).toThrow(ValidationError);
		expect(() => createTask(db, { workspaceId: rise, title: 'x', dueDate: '2026-13-01' })).toThrow(ValidationError);
	});
});

describe('updateTask', () => {
	it('records one history row per changed field, nothing for unchanged ones', () => {
		const id = createTask(db, { workspaceId: rise, title: 'A', source: 'Bob' });
		updateTask(db, id, { title: 'A', priority: 'high', source: 'Bob', due_date: '2026-11-10' });
		const h = listHistory(db, id).filter((x) => x.action === 'updated');
		expect(h.map((x) => [x.field, x.old_value, x.new_value]).sort()).toEqual([
			['due_date', null, '2026-11-10'],
			['priority', 'normal', 'high']
		]);
	});

	it('logs workspace moves by name', () => {
		const id = createTask(db, { workspaceId: rise, title: 'Move me' });
		updateTask(db, id, { workspace_id: home });
		const h = listHistory(db, id)[0];
		expect([h.field, h.old_value, h.new_value]).toEqual(['workspace', 'Rise Internet', 'Home']);
	});

	it('treats empty strings as cleared values', () => {
		const id = createTask(db, { workspaceId: rise, title: 'x', source: 'Bob', dueDate: '2026-11-10' });
		const t = updateTask(db, id, { source: '', due_date: '' });
		expect(t.source).toBeNull();
		expect(t.due_date).toBeNull();
	});
});

describe('completion flow', () => {
	it('stamps completed_at and notes, and reopening clears it but keeps history', () => {
		const id = createTask(db, { workspaceId: rise, title: 'Audit' });
		const done = completeTask(db, id, 'Walked all 4 sites', new Date('2026-11-05T18:00:00Z'));
		expect(done.status).toBe('done');
		expect(done.completed_at).toBe('2026-11-05T18:00:00.000Z');
		expect(done.completion_notes).toBe('Walked all 4 sites');

		const reopened = reopenTask(db, id, new Date('2026-11-06T18:00:00Z'));
		expect(reopened.status).toBe('open');
		expect(reopened.completed_at).toBeNull();

		const actions = listHistory(db, id).map((h) => h.action);
		expect(actions).toContain('completed');
		expect(actions).toContain('reopened');

		const again = completeTask(db, id, 'Done for real', new Date('2026-11-07T18:00:00Z'));
		expect(again.completed_at).toBe('2026-11-07T18:00:00.000Z');
	});
});

describe('archive', () => {
	it('soft-deletes and restores, hiding from active and completed views', () => {
		const id = createTask(db, { workspaceId: rise, title: 'Oops' });
		archiveTask(db, id);
		expect(getTask(db, id)!.archived_at).not.toBeNull();
		expect(listTasks(db, { view: 'active' }, TODAY)).toHaveLength(0);
		expect(listTasks(db, { view: 'archived' }, TODAY).map((t) => t.id)).toEqual([id]);
		restoreTask(db, id);
		expect(listTasks(db, { view: 'active' }, TODAY).map((t) => t.id)).toEqual([id]);
		expect(listHistory(db, id).map((h) => h.action)).toEqual(['restored', 'archived', 'created']);
	});
});

describe('listTasks', () => {
	it('sorts overdue first, then priority, then due date, undated last', () => {
		const a = createTask(db, { workspaceId: rise, title: 'normal, due later', dueDate: '2026-11-20' });
		const b = createTask(db, { workspaceId: rise, title: 'urgent, no date', priority: 'urgent' });
		const c = createTask(db, { workspaceId: rise, title: 'low, overdue', priority: 'low', dueDate: '2026-11-01' });
		const d = createTask(db, { workspaceId: rise, title: 'normal, due soon', dueDate: '2026-11-06' });
		const e = createTask(db, { workspaceId: rise, title: 'normal, no date' });
		expect(listTasks(db, { view: 'active' }, TODAY).map((t) => t.id)).toEqual([c, b, d, a, e]);
	});

	it('filters by workspace, status, priority, due, source and text', () => {
		const a = createTask(db, { workspaceId: rise, title: 'Fix the router', source: 'Client email', priority: 'high' });
		const b = createTask(db, { workspaceId: home, title: 'Mow lawn', dueDate: TODAY, status: 'waiting' });
		createTask(db, { workspaceId: home, title: '100% done_thing', dueDate: '2026-11-01' });
		const ids = (f: Parameters<typeof listTasks>[1]) => listTasks(db, f, TODAY).map((t) => t.id);

		expect(ids({ view: 'active', workspaceId: rise })).toEqual([a]);
		expect(ids({ view: 'active', status: 'waiting' })).toEqual([b]);
		expect(ids({ view: 'active', priority: 'high' })).toEqual([a]);
		expect(ids({ view: 'active', due: 'today' })).toEqual([b]);
		expect(ids({ view: 'active', due: 'week' })).toEqual([b]);
		expect(ids({ view: 'active', due: 'none' })).toEqual([a]);
		expect(ids({ view: 'active', due: 'overdue' })).toHaveLength(1);
		expect(ids({ view: 'active', source: 'client EMAIL' })).toEqual([a]);
		expect(ids({ view: 'active', q: 'router' })).toEqual([a]);
		// LIKE wildcards in the search are literal
		expect(ids({ view: 'active', q: '%' })).toHaveLength(1);
		expect(ids({ view: 'active', q: 'e_t' })).toHaveLength(1);
	});

	it('completed view sorts newest completion first', () => {
		const a = createTask(db, { workspaceId: rise, title: 'first' });
		const b = createTask(db, { workspaceId: rise, title: 'second' });
		completeTask(db, a, null, new Date('2026-11-01T12:00:00Z'));
		completeTask(db, b, null, new Date('2026-11-03T12:00:00Z'));
		expect(listTasks(db, { view: 'completed' }, TODAY).map((t) => t.id)).toEqual([b, a]);
	});
});

describe('getCounts', () => {
	it('counts open, due this week, overdue, completed this month', () => {
		createTask(db, { workspaceId: rise, title: 'overdue', dueDate: '2026-11-02' });
		createTask(db, { workspaceId: rise, title: 'due Saturday', dueDate: '2026-11-07' });
		createTask(db, { workspaceId: home, title: 'due next week', dueDate: '2026-11-09' });
		const done = createTask(db, { workspaceId: rise, title: 'done' });
		completeTask(db, done, null, new Date('2026-11-01T07:30:00Z')); // Nov 1, 1:30 AM Mountain (MDT)
		const old = createTask(db, { workspaceId: rise, title: 'done last month' });
		completeTask(db, old, null, new Date('2026-11-01T05:30:00Z')); // Oct 31, 11:30 PM Mountain

		expect(getCounts(db, null, TODAY, TZ)).toEqual({ open: 3, dueThisWeek: 1, overdue: 1, completedThisMonth: 1 });
		expect(getCounts(db, home, TODAY, TZ)).toEqual({ open: 1, dueThisWeek: 0, overdue: 0, completedThisMonth: 0 });
	});
});

describe('sources, links, attachments', () => {
	it('suggests past sources, most used first', () => {
		createTask(db, { workspaceId: rise, title: 'a', source: 'Phone call' });
		createTask(db, { workspaceId: rise, title: 'b', source: 'Dana' });
		createTask(db, { workspaceId: rise, title: 'c', source: 'Dana' });
		expect(listSources(db)).toEqual(['Dana', 'Phone call']);
	});

	it('normalizes links, rejects unsafe schemes, archives instead of deleting', () => {
		const id = createTask(db, { workspaceId: rise, title: 'x' });
		addLink(db, id, 'example.com/path', 'Ex');
		expect(listLinks(db, id)[0].url).toBe('https://example.com/path');
		expect(() => addLink(db, id, 'javascript:alert(1)', null)).toThrow(ValidationError);
		archiveLink(db, id, listLinks(db, id)[0].id);
		expect(listLinks(db, id)).toHaveLength(0);
		expect(listHistory(db, id).map((h) => h.action)).toContain('link_removed');
	});

	it('records attachments', () => {
		const id = createTask(db, { workspaceId: rise, title: 'x' });
		addAttachment(db, id, { originalName: 'photo.jpg', storedName: '2026/11/u.jpg', mime: 'image/jpeg', size: 1234 });
		expect(listAttachments(db, id)[0].original_name).toBe('photo.jpg');
	});
});

describe('report query', () => {
	it('returns completed, non-archived tasks inside the Mountain-time range', () => {
		const inRange = createTask(db, { workspaceId: rise, title: 'October work' });
		completeTask(db, inRange, 'did it', new Date('2026-11-01T05:59:00Z')); // Oct 31 11:59 PM MDT
		const after = createTask(db, { workspaceId: rise, title: 'November work' });
		completeTask(db, after, null, new Date('2026-11-01T06:00:00Z')); // Nov 1 12:00 AM MDT
		const archived = createTask(db, { workspaceId: rise, title: 'archived' });
		completeTask(db, archived, null, new Date('2026-10-15T12:00:00Z'));
		archiveTask(db, archived);
		const otherWs = createTask(db, { workspaceId: home, title: 'home' });
		completeTask(db, otherWs, null, new Date('2026-10-15T12:00:00Z'));

		const { startIso, endIso } = rangeToUtc(resolveRange('last_month', TODAY), TZ);
		expect(completedBetween(db, startIso, endIso, [rise]).map((t) => t.id)).toEqual([inRange]);
		expect(completedBetween(db, startIso, endIso, [rise, home]).map((t) => t.id)).toEqual([inRange, otherWs]);
		expect(completedBetween(db, startIso, endIso, [])).toEqual([]);
	});
});
