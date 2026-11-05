import { error, fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { ACCEPT_ATTR, saveUpload } from '$lib/server/files';
import {
	addAttachment,
	addLink,
	archiveAttachment,
	archiveLink,
	archiveTask,
	completeTask,
	getTask,
	listAttachments,
	listHistory,
	listLinks,
	NotFoundError,
	reopenTask,
	restoreTask,
	updateTask,
	ValidationError
} from '$lib/server/tasks';

function taskId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Task not found');
	return id;
}

/** Run a mutation, turning validation problems into a 400 the page can show. */
async function attempt<T>(fn: () => T | Promise<T>) {
	try {
		await fn();
		return { ok: true };
	} catch (e) {
		if (e instanceof ValidationError) return fail(400, { error: e.message });
		if (e instanceof NotFoundError) error(404, 'Task not found');
		throw e;
	}
}

export function load({ params }) {
	const db = getDb();
	const id = taskId(params.id);
	const task = getTask(db, id);
	if (!task) error(404, 'Task not found');
	return {
		task,
		links: listLinks(db, id),
		attachments: listAttachments(db, id),
		history: listHistory(db, id),
		accept: ACCEPT_ATTR,
		maxUploadMb: config.maxUploadMb
	};
}

const str = (f: FormData, k: string) => (f.has(k) ? String(f.get(k)) : undefined);

export const actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		const patch: Record<string, unknown> = {};
		for (const k of ['title', 'description', 'priority', 'status', 'due_date', 'source', 'completion_notes']) {
			const v = str(f, k);
			if (v !== undefined) patch[k] = v;
		}
		const ws = str(f, 'workspace_id');
		if (ws !== undefined) patch.workspace_id = Number(ws);
		return attempt(() => updateTask(getDb(), taskId(params.id), patch));
	},

	complete: async ({ params, request }) => {
		const f = await request.formData();
		return attempt(() => completeTask(getDb(), taskId(params.id), str(f, 'notes') ?? null));
	},

	reopen: async ({ params }) => attempt(() => reopenTask(getDb(), taskId(params.id))),

	archive: async ({ params }) => attempt(() => archiveTask(getDb(), taskId(params.id))),

	restore: async ({ params }) => attempt(() => restoreTask(getDb(), taskId(params.id))),

	addLink: async ({ params, request }) => {
		const f = await request.formData();
		return attempt(() => addLink(getDb(), taskId(params.id), str(f, 'url') ?? '', str(f, 'label') ?? null));
	},

	removeLink: async ({ params, request }) => {
		const f = await request.formData();
		return attempt(() => archiveLink(getDb(), taskId(params.id), Number(str(f, 'link_id'))));
	},

	upload: async ({ params, request }) => {
		const id = taskId(params.id);
		const f = await request.formData();
		const files = f.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
		if (files.length === 0) return fail(400, { error: 'Choose at least one file' });
		return attempt(async () => {
			const db = getDb();
			if (!getTask(db, id)) throw new NotFoundError();
			for (const file of files) {
				const saved = await saveUpload(file);
				addAttachment(db, id, saved);
			}
		});
	},

	removeAttachment: async ({ params, request }) => {
		const f = await request.formData();
		return attempt(() => archiveAttachment(getDb(), taskId(params.id), Number(str(f, 'attachment_id'))));
	}
};
