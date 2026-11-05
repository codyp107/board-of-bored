export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['open', 'in_progress', 'waiting', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High',
	urgent: 'Urgent'
};

export const STATUS_LABEL: Record<Status, string> = {
	open: 'Open',
	in_progress: 'In Progress',
	waiting: 'Waiting',
	done: 'Done'
};

export const DUE_FILTERS = {
	overdue: 'Overdue',
	today: 'Due today',
	week: 'Due this week',
	none: 'No due date'
} as const;
export type DueFilter = keyof typeof DUE_FILTERS;

export interface Workspace {
	id: number;
	slug: string;
	name: string;
	color: string;
	sort_order: number;
}

export interface Task {
	id: number;
	workspace_id: number;
	title: string;
	description: string | null;
	priority: Priority;
	status: Status;
	due_date: string | null;
	source: string | null;
	completion_notes: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	archived_at: string | null;
	workspace_slug: string;
	workspace_name: string;
	workspace_color: string;
}

export interface TaskLink {
	id: number;
	task_id: number;
	url: string;
	label: string | null;
	created_at: string;
}

export interface Attachment {
	id: number;
	task_id: number;
	original_name: string;
	stored_name: string;
	mime: string;
	size: number;
	created_at: string;
}

export interface HistoryEntry {
	id: number;
	task_id: number;
	at: string;
	action: string;
	field: string | null;
	old_value: string | null;
	new_value: string | null;
}
