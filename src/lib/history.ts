import { PRIORITY_LABEL, STATUS_LABEL, type HistoryEntry, type Priority, type Status } from './constants';
import { formatDate } from './dates';

const FIELD_LABEL: Record<string, string> = {
	title: 'Title',
	description: 'Description',
	priority: 'Priority',
	status: 'Status',
	due_date: 'Due date',
	source: 'Source',
	completion_notes: 'Completion notes',
	workspace: 'Workspace'
};

function show(field: string | null, v: string | null): string {
	if (v === null || v === '') return '(empty)';
	if (field === 'priority') return PRIORITY_LABEL[v as Priority] ?? v;
	if (field === 'status') return STATUS_LABEL[v as Status] ?? v;
	if (field === 'due_date') return formatDate(v);
	return v;
}

/** Fields whose values are long enough to show as a before/after block instead of inline. */
export function isLongField(field: string | null): boolean {
	return field === 'description' || field === 'completion_notes';
}

export function describeHistory(h: HistoryEntry): string {
	switch (h.action) {
		case 'created':
			return 'Created';
		case 'completed':
			return 'Marked done';
		case 'reopened':
			return `Reopened as ${show('status', h.new_value)}`;
		case 'status':
			return `Status ${show('status', h.old_value)} → ${show('status', h.new_value)}`;
		case 'archived':
			return 'Archived';
		case 'restored':
			return 'Restored from archive';
		case 'link_added':
			return `Added link ${h.new_value}`;
		case 'link_removed':
			return `Removed link ${h.old_value}`;
		case 'attachment_added':
			return `Attached ${h.new_value}`;
		case 'attachment_removed':
			return `Removed attachment ${h.old_value}`;
		case 'updated': {
			const label = FIELD_LABEL[h.field ?? ''] ?? h.field ?? 'Field';
			if (isLongField(h.field)) return `${label} edited`;
			return `${label}: ${show(h.field, h.old_value)} → ${show(h.field, h.new_value)}`;
		}
		default:
			return h.action;
	}
}
