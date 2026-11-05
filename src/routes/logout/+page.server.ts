import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { deleteSession, SESSION_COOKIE } from '$lib/server/auth';

export function load() {
	redirect(303, '/');
}

export const actions = {
	default: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) deleteSession(getDb(), token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
