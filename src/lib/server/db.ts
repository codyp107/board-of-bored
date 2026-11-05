import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { runMigrations } from './migrations';

export type DB = Database.Database;

export function openDb(file: string): DB {
	const db = new Database(file);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	runMigrations(db);
	return db;
}

let instance: DB | undefined;

/** The app's database, opened lazily so builds never touch disk. */
export function getDb(): DB {
	if (!instance) {
		fs.mkdirSync(config.dataDir, { recursive: true });
		instance = openDb(path.join(config.dataDir, 'board.db'));
	}
	return instance;
}
