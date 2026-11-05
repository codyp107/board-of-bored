import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createSession, createUser, hasUsers, SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth';
import { ValidationError } from '$lib/server/tasks';

// The setup page only exists until the first (and only) account is created.
export function load() {
	if (hasUsers(getDb())) error(404, 'Not found');
}

export const actions = {
	default: async (event) => {
		const db = getDb();
		if (hasUsers(db)) error(404, 'Not found');
		const f = await event.request.formData();
		const username = String(f.get('username') ?? '').trim();
		const password = String(f.get('password') ?? '');
		const confirm = String(f.get('confirm') ?? '');
		if (password !== confirm) return fail(400, { username, error: 'Passwords do not match' });
		let userId: number;
		try {
			userId = await createUser(db, username, password);
		} catch (e) {
			if (e instanceof ValidationError) return fail(400, { username, error: e.message });
			throw e;
		}
		const s = createSession(db, userId, true);
		event.cookies.set(SESSION_COOKIE, s.token, sessionCookieOptions(event.url, s.expiresAt));
		redirect(303, '/w/all');
	}
};
