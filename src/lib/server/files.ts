import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { ValidationError } from './tasks';

// Extensions we accept. Everything is served with nosniff, and anything that
// isn't an image or PDF is forced to download rather than render.
const ALLOWED: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
	pdf: 'application/pdf',
	txt: 'text/plain',
	csv: 'text/csv',
	md: 'text/plain',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	odt: 'application/vnd.oasis.opendocument.text',
	ods: 'application/vnd.oasis.opendocument.spreadsheet',
	rtf: 'application/rtf',
	eml: 'message/rfc822',
	msg: 'application/vnd.ms-outlook',
	zip: 'application/zip'
};

export const ACCEPT_ATTR = Object.keys(ALLOWED)
	.map((e) => '.' + e)
	.join(',');

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);

export function attachmentsDir(): string {
	return path.join(config.dataDir, 'attachments');
}

function extOf(name: string): string {
	return path.extname(name).slice(1).toLowerCase();
}

export function sanitizeName(name: string): string {
	const base = path.basename(name).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').trim();
	return (base || 'file').slice(0, 200);
}

/** Validate and write an upload to disk; returns the metadata to store. */
export async function saveUpload(file: File, now: Date = new Date()) {
	if (!file || file.size === 0) throw new ValidationError('Empty file');
	const maxBytes = config.maxUploadMb * 1024 * 1024;
	if (file.size > maxBytes) throw new ValidationError(`${file.name} is larger than ${config.maxUploadMb} MB`);
	const ext = extOf(file.name);
	const mime = ALLOWED[ext];
	if (!mime) throw new ValidationError(`${file.name}: .${ext || '?'} files are not allowed`);

	const sub = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
	const storedName = path.posix.join(sub.split(path.sep).join('/'), `${randomUUID()}.${ext}`);
	const full = path.join(attachmentsDir(), storedName);
	await fs.mkdir(path.dirname(full), { recursive: true });
	await fs.writeFile(full, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
	return { originalName: sanitizeName(file.name), storedName, mime, size: file.size };
}

/** Resolve a stored name to an absolute path, refusing anything outside the attachments dir. */
export function resolveStored(storedName: string): string {
	const root = path.resolve(attachmentsDir());
	const full = path.resolve(root, storedName);
	if (!full.startsWith(root + path.sep)) throw new Error('Invalid attachment path');
	return full;
}

export function isInline(mime: string): boolean {
	return INLINE_TYPES.has(mime);
}
