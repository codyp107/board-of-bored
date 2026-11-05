import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	createUser,
	hasUsers,
	pruneSessions,
	SESSION_COOKIE,
	sessionCookieOptions,
	validateSession
} from '$lib/server/auth';

const PUBLIC_PATHS = new Set(['/login', '/healthz']);

let bootstrapped = false;

async function bootstrap() {
	if (bootstrapped) return;
	bootstrapped = true;
	const db = getDb();
	pruneSessions(db);
	// Optional first-run admin from env; otherwise the /setup page handles it.
	const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
	if (!hasUsers(db) && ADMIN_USERNAME && ADMIN_PASSWORD) {
		await createUser(db, ADMIN_USERNAME, ADMIN_PASSWORD);
		console.log(`[board-of-bored] Created admin user "${ADMIN_USERNAME}" from environment.`);
		console.log('[board-of-bored] You can now remove ADMIN_PASSWORD from .env.');
	}
}

function redirectTo(location: string) {
	return new Response(null, { status: 303, headers: { location } });
}

export const handle: Handle = async ({ event, resolve }) => {
	await bootstrap();
	const db = getDb();
	const path = event.url.pathname;

	event.locals.user = null;
	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const s = validateSession(db, token);
		if (s) {
			event.locals.user = s.user;
			if (s.renewed && s.remember) event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url, s.expiresAt));
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	if (path !== '/healthz') {
		if (!hasUsers(db)) {
			if (path !== '/setup') return redirectTo('/setup');
		} else if (!event.locals.user && !PUBLIC_PATHS.has(path)) {
			const next = path === '/' ? '' : `?next=${encodeURIComponent(path + event.url.search)}`;
			return redirectTo(`/login${next}`);
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
