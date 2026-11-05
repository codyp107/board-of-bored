import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { reportPdf } from '$lib/server/pdf';
import { buildReport } from '$lib/server/reports';

export async function GET({ url, locals }) {
	const report = buildReport(getDb(), url.searchParams);
	const pdf = await reportPdf(report, config.reportAuthor || locals.user?.username || '');
	const name = `completed-work_${report.range.from}_to_${report.range.to}.pdf`;
	return new Response(new Uint8Array(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'no-store'
		}
	});
}
