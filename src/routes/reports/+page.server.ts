import { getDb } from '$lib/server/db';
import { buildReport } from '$lib/server/reports';

export function load({ url }) {
	return { report: buildReport(getDb(), url.searchParams) };
}
