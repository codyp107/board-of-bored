// Consistent online copy of the SQLite database (safe while the app is running).
// Usage (inside the container): node scripts/db-backup.mjs /data/.backup/board.db
import Database from 'better-sqlite3';
import path from 'node:path';

const dest = process.argv[2];
if (!dest) {
	console.error('usage: node scripts/db-backup.mjs <destination.db>');
	process.exit(1);
}
const src = path.join(process.env.DATA_DIR || '/data', 'board.db');
const db = new Database(src, { fileMustExist: true });
await db.backup(dest);
db.close();
console.log(`backed up ${src} -> ${dest}`);
