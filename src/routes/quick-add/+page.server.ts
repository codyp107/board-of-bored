import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createTask, getWorkspaceBySlug, ValidationError } from '$lib/server/tasks';

// Without JavaScript, the form posts here and the load redirects back to the board.
export function load() {
	redirect(303, '/w/all');
}

export const actions = {
	default: async ({ request }) => {
		const db = getDb();
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim();
		const ws = getWorkspaceBySlug(db, String(f.get('workspace') ?? ''));
		if (!title) return fail(400, { error: 'Title is required' });
		if (!ws) return fail(400, { error: 'Pick a workspace' });
		try {
			const id = createTask(db, { workspaceId: ws.id, title });
			return { id, title };
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
