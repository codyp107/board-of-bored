import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './db';
import { ValidationError } from './tasks';

export const SESSION_COOKIE = 'bob_session';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const SHORT_SESSION_MS = 12 * HOUR;
export const REMEMBER_SESSION_MS = 90 * DAY;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_USER = 5;
const MAX_FAILS_PER_IP = 10;

// OWASP-recommended argon2id parameters (argon2id is the library default).
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export interface SessionUser {
	id: number;
	username: string;
}

export function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON_OPTS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	try {
		return await verify(passwordHash, password);
	} catch {
		return false;
	}
}

export function hasUsers(db: DB): boolean {
	return !!db.prepare('SELECT 1 FROM users LIMIT 1').get();
}

export function validateNewCredentials(username: string, password: string): void {
	if (!/^[A-Za-z0-9._@-]{3,64}$/.test(username))
		throw new ValidationError('Username must be 3–64 characters: letters, numbers, . _ @ -');
	if (password.length < 10) throw new ValidationError('Password must be at least 10 characters');
	if (password.length > 256) throw new ValidationError('Password is too long');
}

export async function createUser(db: DB, username: string, password: string): Promise<number> {
	validateNewCredentials(username, password);
	const passwordHash = await hashPassword(password);
	const r = db
		.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
		.run(username, passwordHash, new Date().toISOString());
	return Number(r.lastInsertRowid);
}

let dummyHash: Promise<string> | undefined;

/** Check credentials; always spends the same hashing time whether or not the user exists. */
export async function authenticate(db: DB, username: string, password: string): Promise<SessionUser | null> {
	const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
		| { id: number; username: string; password_hash: string }
		| undefined;
	if (!row) {
		dummyHash ??= hashPassword('not-a-real-password-' + randomBytes(8).toString('hex'));
		await verifyPassword(await dummyHash, password);
		return null;
	}
	return (await verifyPassword(row.password_hash, password)) ? { id: row.id, username: row.username } : null;
}

export async function changePassword(db: DB, userId: number, password: string): Promise<void> {
	if (password.length < 10) throw new ValidationError('Password must be at least 10 characters');
	const passwordHash = await hashPassword(password);
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
	db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ---------- sessions ----------

export function sessionCookieOptions(url: URL, expiresAt: number | null) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		// Only mark Secure on HTTPS, or the browser drops the cookie on plain LAN HTTP.
		secure: url.protocol === 'https:',
		...(expiresAt ? { expires: new Date(expiresAt) } : {})
	};
}

function tokenId(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: DB, userId: number, remember: boolean, now = Date.now()) {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = now + (remember ? REMEMBER_SESSION_MS : SHORT_SESSION_MS);
	db.prepare('INSERT INTO sessions (id, user_id, expires_at, remember, created_at) VALUES (?, ?, ?, ?, ?)').run(
		tokenId(token),
		userId,
		expiresAt,
		remember ? 1 : 0,
		new Date(now).toISOString()
	);
	return { token, expiresAt };
}

export interface ValidSession {
	user: SessionUser;
	remember: boolean;
	expiresAt: number;
	/** true when the expiry was pushed out and the cookie should be re-sent */
	renewed: boolean;
}

/** Look up a session; sliding expiry renews it once it is past half its lifetime. */
export function validateSession(db: DB, token: string, now = Date.now()): ValidSession | null {
	const id = tokenId(token);
	const row = db
		.prepare(
			`SELECT s.expires_at, s.remember, u.id AS user_id, u.username
			 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
		)
		.get(id) as { expires_at: number; remember: number; user_id: number; username: string } | undefined;
	if (!row) return null;
	if (row.expires_at <= now) {
		db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
		return null;
	}
	const remember = row.remember === 1;
	const lifetime = remember ? REMEMBER_SESSION_MS : SHORT_SESSION_MS;
	let expiresAt = row.expires_at;
	let renewed = false;
	if (expiresAt - now < lifetime / 2) {
		expiresAt = now + lifetime;
		renewed = true;
		db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, id);
	}
	return { user: { id: row.user_id, username: row.username }, remember, expiresAt, renewed };
}

export function deleteSession(db: DB, token: string): void {
	db.prepare('DELETE FROM sessions WHERE id = ?').run(tokenId(token));
}

export function pruneSessions(db: DB, now = Date.now()): void {
	db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

// ---------- login rate limiting ----------

export function isLoginBlocked(db: DB, ip: string, username: string, now = Date.now()): boolean {
	const since = now - LOGIN_WINDOW_MS;
	const fails = (sql: string, v: string) =>
		(
			db
				.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE success = 0 AND attempted_at > ? AND ${sql}`)
				.get(since, v) as { n: number }
		).n;
	return fails('ip = ?', ip) >= MAX_FAILS_PER_IP || fails('username = ?', username.toLowerCase()) >= MAX_FAILS_PER_USER;
}

export function recordLoginAttempt(db: DB, ip: string, username: string, success: boolean, now = Date.now()): void {
	const user = username.toLowerCase();
	db.prepare('INSERT INTO login_attempts (ip, username, attempted_at, success) VALUES (?, ?, ?, ?)').run(
		ip,
		user,
		now,
		success ? 1 : 0
	);
	if (success) db.prepare('DELETE FROM login_attempts WHERE success = 0 AND (username = ? OR ip = ?)').run(user, ip);
	db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(now - DAY);
}
