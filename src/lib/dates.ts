// Pure date helpers. Calendar dates are 'YYYY-MM-DD' strings in the app's timezone;
// instants (created_at, completed_at) are UTC ISO strings. Weeks run Sunday–Saturday.

export type DateStr = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(v: unknown): v is DateStr {
	if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
	return fmt(toUTC(v)) === v;
}

function toUTC(d: DateStr): Date {
	const [y, m, day] = d.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, day));
}

function fmt(d: Date): DateStr {
	return d.toISOString().slice(0, 10);
}

/** Calendar date in `tz` at the given instant. */
export function todayIn(tz: string, now: Date = new Date()): DateStr {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function addDays(d: DateStr, n: number): DateStr {
	const x = toUTC(d);
	x.setUTCDate(x.getUTCDate() + n);
	return fmt(x);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(d: DateStr): number {
	return toUTC(d).getUTCDay();
}

export function startOfWeek(d: DateStr): DateStr {
	return addDays(d, -dayOfWeek(d));
}

export function endOfWeek(d: DateStr): DateStr {
	return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: DateStr): DateStr {
	return d.slice(0, 8) + '01';
}

export function endOfMonth(d: DateStr): DateStr {
	const [y, m] = d.split('-').map(Number);
	return fmt(new Date(Date.UTC(y, m, 0)));
}

export function startOfQuarter(d: DateStr): DateStr {
	const [y, m] = d.split('-').map(Number);
	const qm = Math.floor((m - 1) / 3) * 3 + 1;
	return `${y}-${String(qm).padStart(2, '0')}-01`;
}

export function endOfQuarter(d: DateStr): DateStr {
	return endOfMonth(addMonths(startOfQuarter(d), 2));
}

/** Shift by whole months from the 1st of the month (only used on month starts). */
function addMonths(firstOfMonth: DateStr, n: number): DateStr {
	const [y, m] = firstOfMonth.split('-').map(Number);
	return fmt(new Date(Date.UTC(y, m - 1 + n, 1)));
}

export const RANGE_PRESETS = {
	this_week: 'This week',
	last_week: 'Last week',
	this_month: 'This month',
	last_month: 'Last month',
	this_quarter: 'This quarter',
	last_quarter: 'Last quarter',
	this_year: 'This year',
	last_year: 'Last year',
	custom: 'Custom'
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export function isRangePreset(v: unknown): v is RangePreset {
	return typeof v === 'string' && v in RANGE_PRESETS;
}

export interface DateRange {
	from: DateStr;
	to: DateStr; // inclusive
}

/** Resolve a preset to an inclusive calendar-date range relative to `today`. */
export function resolveRange(
	preset: RangePreset,
	today: DateStr,
	custom?: Partial<DateRange>
): DateRange {
	switch (preset) {
		case 'this_week':
			return { from: startOfWeek(today), to: endOfWeek(today) };
		case 'last_week': {
			const s = addDays(startOfWeek(today), -7);
			return { from: s, to: addDays(s, 6) };
		}
		case 'this_month':
			return { from: startOfMonth(today), to: endOfMonth(today) };
		case 'last_month': {
			const s = addMonths(startOfMonth(today), -1);
			return { from: s, to: endOfMonth(s) };
		}
		case 'this_quarter':
			return { from: startOfQuarter(today), to: endOfQuarter(today) };
		case 'last_quarter': {
			const s = addMonths(startOfQuarter(today), -3);
			return { from: s, to: endOfQuarter(s) };
		}
		case 'this_year':
			return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
		case 'last_year': {
			const y = Number(today.slice(0, 4)) - 1;
			return { from: `${y}-01-01`, to: `${y}-12-31` };
		}
		case 'custom': {
			let from = isDateStr(custom?.from) ? custom.from : startOfMonth(today);
			let to = isDateStr(custom?.to) ? custom.to : today;
			if (from > to) [from, to] = [to, from];
			return { from, to };
		}
	}
}

/** Milliseconds that `tz` is ahead of UTC at `instant`. */
function tzOffsetMs(tz: string, instant: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(instant);
	const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
	const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
	return asUTC - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which calendar date `d` begins in `tz`. */
export function zonedMidnightUtc(d: DateStr, tz: string): Date {
	const guess = toUTC(d).getTime();
	const off1 = tzOffsetMs(tz, new Date(guess));
	let t = guess - off1;
	const off2 = tzOffsetMs(tz, new Date(t));
	if (off2 !== off1) t = guess - off2;
	return new Date(t);
}

/** Half-open UTC ISO bounds [start, end) covering an inclusive date range in `tz`. */
export function rangeToUtc(range: DateRange, tz: string): { startIso: string; endIso: string } {
	return {
		startIso: zonedMidnightUtc(range.from, tz).toISOString(),
		endIso: zonedMidnightUtc(addDays(range.to, 1), tz).toISOString()
	};
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Nov 5, 2026' */
export function formatDate(d: DateStr | null | undefined): string {
	if (!d) return '';
	const [y, m, day] = d.split('-').map(Number);
	return `${MONTHS[m - 1]} ${day}, ${y}`;
}

/** Local calendar date of a UTC instant, formatted. */
export function formatInstantDate(iso: string | null | undefined, tz: string): string {
	if (!iso) return '';
	return formatDate(todayIn(tz, new Date(iso)));
}

export function formatInstant(iso: string | null | undefined, tz: string): string {
	if (!iso) return '';
	return new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(new Date(iso));
}
