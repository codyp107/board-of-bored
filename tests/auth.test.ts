import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/lib/server/db';
import {
	authenticate,
	createSession,
	createUser,
	deleteSession,
	hasUsers,
	isLoginBlocked,
	recordLoginAttempt,
	REMEMBER_SESSION_MS,
	SHORT_SESSION_MS,
	validateSession
} from '../src/lib/server/auth';
import { ValidationError } from '../src/lib/server/tasks';

let db: DB;
beforeEach(() => {
	db = openDb(':memory:');
});

describe('users', () => {
	it('stores an argon2id hash and authenticates', async () => {
		expect(hasUsers(db)).toBe(false);
		await createUser(db, 'cody', 'correct horse battery');
		expect(hasUsers(db)).toBe(true);
		const row = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
		expect(row.password_hash).toMatch(/^\$argon2id\$/);
		expect(await authenticate(db, 'cody', 'correct horse battery')).toMatchObject({ username: 'cody' });
		expect(await authenticate(db, 'CODY', 'correct horse battery')).not.toBeNull();
		expect(await authenticate(db, 'cody', 'wrong password!')).toBeNull();
		expect(await authenticate(db, 'nobody', 'correct horse battery')).toBeNull();
	});

	it('rejects weak credentials', async () => {
		await expect(createUser(db, 'cody', 'short')).rejects.toThrow(ValidationError);
		await expect(createUser(db, 'a b', 'long enough password')).rejects.toThrow(ValidationError);
	});
});

describe('sessions', () => {
	it('creates, validates, slides, expires and deletes', async () => {
		const uid = await createUser(db, 'cody', 'correct horse battery');
		const t0 = 1_800_000_000_000;
		const s = createSession(db, uid, true, t0);
		expect(validateSession(db, s.token, t0)).toMatchObject({ user: { username: 'cody' }, renewed: false });

		// past half its life → renewed
		const later = t0 + REMEMBER_SESSION_MS * 0.6;
		const v = validateSession(db, s.token, later)!;
		expect(v.renewed).toBe(true);
		expect(v.expiresAt).toBe(later + REMEMBER_SESSION_MS);

		expect(validateSession(db, 'not-a-token', t0)).toBeNull();
		deleteSession(db, s.token);
		expect(validateSession(db, s.token, t0)).toBeNull();

		const short = createSession(db, uid, false, t0);
		expect(validateSession(db, short.token, t0 + SHORT_SESSION_MS + 1)).toBeNull();
	});

	it('stores only a hash of the token', async () => {
		const uid = await createUser(db, 'cody', 'correct horse battery');
		const s = createSession(db, uid, false);
		const row = db.prepare('SELECT id FROM sessions').get() as { id: string };
		expect(row.id).not.toBe(s.token);
		expect(row.id).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('login rate limiting', () => {
	it('blocks a username after 5 failures in 15 minutes, then recovers', () => {
		const t0 = 1_800_000_000_000;
		for (let i = 0; i < 5; i++) recordLoginAttempt(db, `10.0.0.${i}`, 'cody', false, t0 + i);
		expect(isLoginBlocked(db, '10.0.0.99', 'Cody', t0 + 10)).toBe(true);
		expect(isLoginBlocked(db, '10.0.0.99', 'cody', t0 + 16 * 60 * 1000)).toBe(false);
	});

	it('blocks an IP after 10 failures across usernames', () => {
		const t0 = 1_800_000_000_000;
		for (let i = 0; i < 10; i++) recordLoginAttempt(db, '10.0.0.5', `user${i}`, false, t0 + i);
		expect(isLoginBlocked(db, '10.0.0.5', 'someone', t0 + 20)).toBe(true);
		expect(isLoginBlocked(db, '10.0.0.6', 'someone', t0 + 20)).toBe(false);
	});

	it('a successful login clears earlier failures', () => {
		const t0 = 1_800_000_000_000;
		for (let i = 0; i < 4; i++) recordLoginAttempt(db, '10.0.0.5', 'cody', false, t0 + i);
		recordLoginAttempt(db, '10.0.0.5', 'cody', true, t0 + 10);
		recordLoginAttempt(db, '10.0.0.5', 'cody', false, t0 + 11);
		expect(isLoginBlocked(db, '10.0.0.5', 'cody', t0 + 12)).toBe(false);
	});
});
