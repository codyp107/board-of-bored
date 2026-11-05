import { describe, expect, it } from 'vitest';
import {
	addDays,
	endOfMonth,
	endOfWeek,
	formatDate,
	isDateStr,
	rangeToUtc,
	resolveRange,
	startOfWeek,
	todayIn,
	zonedMidnightUtc
} from '../src/lib/dates';

const TZ = 'America/Denver';

describe('calendar helpers', () => {
	it('validates date strings', () => {
		expect(isDateStr('2026-11-05')).toBe(true);
		expect(isDateStr('2026-02-30')).toBe(false);
		expect(isDateStr('11/05/2026')).toBe(false);
		expect(isDateStr(null)).toBe(false);
	});

	it('weeks run Sunday through Saturday', () => {
		// 2026-11-05 is a Thursday
		expect(startOfWeek('2026-11-05')).toBe('2026-11-01');
		expect(endOfWeek('2026-11-05')).toBe('2026-11-07');
		// Sunday and Saturday are their own week bounds
		expect(startOfWeek('2026-11-01')).toBe('2026-11-01');
		expect(endOfWeek('2026-11-07')).toBe('2026-11-07');
	});

	it('handles month ends and leap years', () => {
		expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
		expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('formats dates', () => {
		expect(formatDate('2026-11-05')).toBe('Nov 5, 2026');
		expect(formatDate(null)).toBe('');
	});
});

describe('resolveRange presets', () => {
	const today = '2026-11-05'; // Thursday, Q4

	it.each([
		['this_week', '2026-11-01', '2026-11-07'],
		['last_week', '2026-10-25', '2026-10-31'],
		['this_month', '2026-11-01', '2026-11-30'],
		['last_month', '2026-10-01', '2026-10-31'],
		['this_quarter', '2026-10-01', '2026-12-31'],
		['last_quarter', '2026-07-01', '2026-09-30'],
		['this_year', '2026-01-01', '2026-12-31'],
		['last_year', '2025-01-01', '2025-12-31']
	] as const)('%s', (preset, from, to) => {
		expect(resolveRange(preset, today)).toEqual({ from, to });
	});

	it('crosses year boundaries', () => {
		expect(resolveRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
		expect(resolveRange('last_quarter', '2026-02-01')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
		expect(resolveRange('last_week', '2026-01-02')).toEqual({ from: '2025-12-21', to: '2025-12-27' });
		expect(resolveRange('this_week', '2026-01-01')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
	});

	it('quarter edges', () => {
		expect(resolveRange('this_quarter', '2026-03-31')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
		expect(resolveRange('this_quarter', '2026-04-01')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
	});

	it('custom range validates and swaps reversed dates', () => {
		expect(resolveRange('custom', today, { from: '2026-03-01', to: '2026-03-15' })).toEqual({
			from: '2026-03-01',
			to: '2026-03-15'
		});
		expect(resolveRange('custom', today, { from: '2026-03-15', to: '2026-03-01' })).toEqual({
			from: '2026-03-01',
			to: '2026-03-15'
		});
		expect(resolveRange('custom', today, { from: 'garbage' })).toEqual({ from: '2026-11-01', to: today });
	});
});

describe('timezone conversion (America/Denver)', () => {
	it('today follows Mountain time, not UTC', () => {
		// 03:00 UTC Nov 6 is still 8 PM Nov 5 in Denver (MST, UTC-7)
		expect(todayIn(TZ, new Date('2026-11-06T03:00:00Z'))).toBe('2026-11-05');
	});

	it('local midnight in standard and daylight time', () => {
		expect(zonedMidnightUtc('2026-01-15', TZ).toISOString()).toBe('2026-01-15T07:00:00.000Z'); // MST
		expect(zonedMidnightUtc('2026-07-15', TZ).toISOString()).toBe('2026-07-15T06:00:00.000Z'); // MDT
	});

	it('handles DST transition days', () => {
		// DST starts 2026-03-08 at 2 AM; midnight is still MST
		expect(zonedMidnightUtc('2026-03-08', TZ).toISOString()).toBe('2026-03-08T07:00:00.000Z');
		expect(zonedMidnightUtc('2026-03-09', TZ).toISOString()).toBe('2026-03-09T06:00:00.000Z');
		// DST ends 2026-11-01 at 2 AM; midnight is still MDT
		expect(zonedMidnightUtc('2026-11-01', TZ).toISOString()).toBe('2026-11-01T06:00:00.000Z');
		expect(zonedMidnightUtc('2026-11-02', TZ).toISOString()).toBe('2026-11-02T07:00:00.000Z');
	});

	it('range bounds are half-open and cover the whole last day', () => {
		expect(rangeToUtc({ from: '2026-10-01', to: '2026-10-31' }, TZ)).toEqual({
			startIso: '2026-10-01T06:00:00.000Z',
			endIso: '2026-11-01T06:00:00.000Z'
		});
	});
});
