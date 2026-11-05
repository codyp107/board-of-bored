import { getDb } from '$lib/server/db';

export function GET() {
	getDb().prepare('SELECT 1').get();
	return new Response('ok', { headers: { 'cache-control': 'no-store' } });
}
