import type Database from 'better-sqlite3';

// Append-only list. Each entry runs once, tracked by PRAGMA user_version.
// Never edit an entry that has shipped; add a new one instead.
export const migrations: string[] = [
	/* 1: initial schema */ `
	CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		created_at TEXT NOT NULL
	);

	CREATE TABLE sessions (
		id TEXT PRIMARY KEY,                 -- sha256 of the cookie token
		user_id INTEGER NOT NULL REFERENCES users(id),
		expires_at INTEGER NOT NULL,         -- epoch ms
		remember INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	);

	CREATE TABLE login_attempts (
		id INTEGER PRIMARY KEY,
		ip TEXT NOT NULL,
		username TEXT NOT NULL,
		attempted_at INTEGER NOT NULL,       -- epoch ms
		success INTEGER NOT NULL
	);
	CREATE INDEX login_attempts_time ON login_attempts(attempted_at);

	CREATE TABLE workspaces (
		id INTEGER PRIMARY KEY,
		slug TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		color TEXT NOT NULL,
		sort_order INTEGER NOT NULL DEFAULT 0
	);
	INSERT INTO workspaces (slug, name, color, sort_order) VALUES
		('rise', 'Rise Internet', '#2563eb', 1),
		('pitcher', 'Pitcher Technologies', '#059669', 2),
		('home', 'Home', '#d97706', 3);

	CREATE TABLE tasks (
		id INTEGER PRIMARY KEY,
		workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
		title TEXT NOT NULL CHECK (length(trim(title)) > 0),
		description TEXT,
		priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
		status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','done')),
		due_date TEXT,                       -- YYYY-MM-DD, app timezone
		source TEXT,
		completion_notes TEXT,
		created_at TEXT NOT NULL,            -- UTC ISO
		updated_at TEXT NOT NULL,
		completed_at TEXT,
		archived_at TEXT
	);
	CREATE INDEX tasks_ws_status ON tasks(workspace_id, status);
	CREATE INDEX tasks_completed ON tasks(completed_at);

	CREATE TABLE task_links (
		id INTEGER PRIMARY KEY,
		task_id INTEGER NOT NULL REFERENCES tasks(id),
		url TEXT NOT NULL,
		label TEXT,
		created_at TEXT NOT NULL,
		archived_at TEXT
	);
	CREATE INDEX task_links_task ON task_links(task_id);

	CREATE TABLE attachments (
		id INTEGER PRIMARY KEY,
		task_id INTEGER NOT NULL REFERENCES tasks(id),
		original_name TEXT NOT NULL,
		stored_name TEXT NOT NULL,           -- path relative to the attachments dir
		mime TEXT NOT NULL,
		size INTEGER NOT NULL,
		created_at TEXT NOT NULL,
		archived_at TEXT
	);
	CREATE INDEX attachments_task ON attachments(task_id);

	CREATE TABLE task_history (
		id INTEGER PRIMARY KEY,
		task_id INTEGER NOT NULL REFERENCES tasks(id),
		at TEXT NOT NULL,
		action TEXT NOT NULL,
		field TEXT,
		old_value TEXT,
		new_value TEXT
	);
	CREATE INDEX task_history_task ON task_history(task_id);

	-- Paper-trail guarantees: nothing here is ever hard-deleted or rewritten.
	CREATE TRIGGER tasks_no_delete BEFORE DELETE ON tasks
		BEGIN SELECT RAISE(ABORT, 'tasks are never deleted; archive instead'); END;
	CREATE TRIGGER task_links_no_delete BEFORE DELETE ON task_links
		BEGIN SELECT RAISE(ABORT, 'links are never deleted; archive instead'); END;
	CREATE TRIGGER attachments_no_delete BEFORE DELETE ON attachments
		BEGIN SELECT RAISE(ABORT, 'attachments are never deleted; archive instead'); END;
	CREATE TRIGGER task_history_no_update BEFORE UPDATE ON task_history
		BEGIN SELECT RAISE(ABORT, 'task history is append-only'); END;
	CREATE TRIGGER task_history_no_delete BEFORE DELETE ON task_history
		BEGIN SELECT RAISE(ABORT, 'task history is append-only'); END;
	`
];

export function runMigrations(db: Database.Database): void {
	const current = db.pragma('user_version', { simple: true }) as number;
	for (let i = current; i < migrations.length; i++) {
		db.transaction(() => {
			db.exec(migrations[i]);
			db.pragma(`user_version = ${i + 1}`);
		})();
	}
}
