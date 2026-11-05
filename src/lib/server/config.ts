import path from 'node:path';

export const config = {
	dataDir: process.env.DATA_DIR || path.resolve('data'),
	tz: process.env.APP_TIMEZONE || 'America/Denver',
	maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 25),
	reportAuthor: process.env.REPORT_AUTHOR || ''
};
