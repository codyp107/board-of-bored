import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { authenticate, createSession, isLoginBlocked, recordLoginAttempt, SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth';

function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/w/all';
}

export function load({ locals, url }) {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
}

export const actions = {
	default: async (event) => {
		const db = getDb();
		const f = await event.request.formData();
		const username = String(f.get('username') ?? '').trim();
		const password = String(f.get('password') ?? '');
		const remember = f.get('remember') === 'on';
		const ip = event.getClientAddress();

		if (isLoginBlocked(db, ip, username)) {
			return fail(429, { username, error: 'Too many failed attempts. Try again in 15 minutes.' });
		}
		const user = await authenticate(db, username, password);
		recordLoginAttempt(db, ip, username, !!user);
		if (!user) return fail(400, { username, error: 'Incorrect username or password' });

		const s = createSession(db, user.id, remember);
		// Without "remember me" the cookie lasts until the browser closes.
		event.cookies.set(SESSION_COOKIE, s.token, sessionCookieOptions(event.url, remember ? s.expiresAt : null));
		redirect(303, safeNext(event.url.searchParams.get('next')));
	}
};
