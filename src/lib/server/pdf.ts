import PdfPrinter from 'pdfmake';
import { config } from './config';
import type { Report } from './reports';
import { formatDate, formatInstantDate, todayIn } from '../dates';

const printer = new PdfPrinter({
	Helvetica: {
		normal: 'Helvetica',
		bold: 'Helvetica-Bold',
		italics: 'Helvetica-Oblique',
		bolditalics: 'Helvetica-BoldOblique'
	}
});

const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e2e8f0';

export function reportPdf(report: Report, author: string): Promise<Buffer> {
	const tz = config.tz;
	const rangeText = `${formatDate(report.range.from)} – ${formatDate(report.range.to)}`;
	const wsText =
		report.workspaces.length === report.allWorkspaces.length
			? 'All workspaces'
			: report.workspaces.map((w) => w.name).join(', ');

	const content: unknown[] = [
		{
			columns: [
				{
					stack: [
						{ text: 'Completed Work Report', style: 'title' },
						{ text: rangeText, style: 'subtitle' }
					]
				},
				{
					width: 'auto',
					stack: [
						{ text: String(report.total), style: 'total', alignment: 'right' },
						{ text: report.total === 1 ? 'task completed' : 'tasks completed', style: 'meta', alignment: 'right' }
					]
				}
			]
		},
		{
			margin: [0, 8, 0, 0],
			table: {
				widths: ['auto', '*'],
				body: [
					...(author ? [[{ text: 'Prepared by', style: 'label' }, { text: author, style: 'meta' }]] : []),
					[{ text: 'Workspaces', style: 'label' }, { text: wsText, style: 'meta' }],
					[{ text: 'Generated', style: 'label' }, { text: formatDate(todayIn(tz)), style: 'meta' }]
				]
			},
			layout: 'noBorders'
		},
		{ canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 1.5, lineColor: INK }], margin: [0, 0, 0, 12] }
	];

	if (report.groups.length === 0) {
		content.push({ text: 'No completed tasks in this period.', style: 'meta', margin: [0, 20, 0, 0] });
	}

	for (const g of report.groups) {
		content.push({
			margin: [0, 10, 0, 6],
			columns: [
				{ width: 4, canvas: [{ type: 'rect', x: 0, y: 1, w: 4, h: 14, color: g.workspace.color }] },
				{ text: g.workspace.name, style: 'h2', margin: [8, 0, 0, 0] },
				{ width: 'auto', text: `${g.tasks.length} completed`, style: 'meta', margin: [0, 2, 0, 0] }
			]
		});

		const body: unknown[][] = [
			[
				{ text: 'Task', style: 'th' },
				{ text: 'Source', style: 'th' },
				{ text: 'Created', style: 'th' },
				{ text: 'Completed', style: 'th' }
			]
		];
		for (const t of g.tasks) {
			const cell: unknown[] = [{ text: t.title, bold: true }];
			if (t.completion_notes) cell.push({ text: t.completion_notes, style: 'notes', margin: [0, 2, 0, 0] });
			body.push([
				{ stack: cell },
				{ text: t.source ?? '—', style: 'cell' },
				{ text: formatInstantDate(t.created_at, tz), style: 'cell', noWrap: true },
				{ text: formatInstantDate(t.completed_at, tz), style: 'cell', noWrap: true }
			]);
		}
		content.push({
			table: { headerRows: 1, dontBreakRows: true, widths: ['*', 90, 62, 62], body },
			layout: {
				hLineWidth: (i: number) => (i === 1 ? 1 : 0.5),
				vLineWidth: () => 0,
				hLineColor: (i: number) => (i === 1 ? INK : RULE),
				paddingTop: () => 5,
				paddingBottom: () => 5,
				paddingLeft: () => 4,
				paddingRight: () => 4
			}
		});
	}

	const doc = {
		pageSize: 'LETTER',
		pageMargins: [48, 48, 48, 56],
		info: { title: `Completed Work Report ${rangeText}`, author },
		defaultStyle: { font: 'Helvetica', fontSize: 9.5, color: INK, lineHeight: 1.2 },
		styles: {
			title: { fontSize: 20, bold: true },
			subtitle: { fontSize: 12, color: MUTED, margin: [0, 2, 0, 0] },
			total: { fontSize: 24, bold: true },
			label: { fontSize: 9, bold: true, color: MUTED },
			meta: { fontSize: 9, color: MUTED },
			h2: { fontSize: 13, bold: true },
			th: { fontSize: 8.5, bold: true, color: MUTED },
			cell: { fontSize: 9 },
			notes: { fontSize: 9, color: '#334155', italics: true }
		},
		footer: (page: number, pages: number) => ({
			margin: [48, 16, 48, 0],
			columns: [
				{ text: `Completed Work Report · ${rangeText}`, style: 'meta' },
				{ text: `Page ${page} of ${pages}`, style: 'meta', alignment: 'right' }
			]
		}),
		content
	};

	return new Promise((resolve, reject) => {
		const pdf = printer.createPdfKitDocument(doc);
		const chunks: Buffer[] = [];
		pdf.on('data', (c: Buffer) => chunks.push(c));
		pdf.on('end', () => resolve(Buffer.concat(chunks)));
		pdf.on('error', reject);
		pdf.end();
	});
}
