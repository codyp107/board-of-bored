import { error } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import { getDb } from '$lib/server/db';
import { isInline, resolveStored } from '$lib/server/files';
import { getAttachment } from '$lib/server/tasks';

// Authenticated by hooks.server.ts like every non-public route.
export async function GET({ params }) {
	const id = Number(params.id);
	const a = Number.isInteger(id) ? getAttachment(getDb(), id) : undefined;
	if (!a) error(404, 'File not found');

	let body: Buffer;
	try {
		body = await fs.readFile(resolveStored(a.stored_name));
	} catch {
		error(404, 'File is missing from disk');
	}

	const inline = isInline(a.mime);
	const ascii = a.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
	const headers: Record<string, string> = {
		'content-type': a.mime,
		'content-length': String(body.length),
		'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.original_name)}`,
		'cache-control': 'private, max-age=3600',
		'x-content-type-options': 'nosniff'
	};
	// Downloads get a locked-down CSP; inline images/PDFs can't (Chrome's PDF viewer refuses to run sandboxed).
	if (!inline) headers['content-security-policy'] = "default-src 'none'; sandbox";
	return new Response(new Uint8Array(body), { headers });
}
