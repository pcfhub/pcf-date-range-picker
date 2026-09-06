/**
 * Month grids and quick ranges, kept apart from React so the arithmetic can be
 * asserted without rendering anything — and so there is exactly one place that
 * knows a week can start on any of seven days.
 *
 * Every date here is built from **local** components, never parsed from a
 * string and never routed through `toISOString()`. `range.ts` explains why at
 * length; the short version is that a calendar built on UTC instants shows the
 * wrong month to half the planet on the first and last day of it.
 */

import { dayNumber, isSameDay } from './range';

/** Sunday is 0, matching `UserSettings.dateFormattingInfo.firstDayOfWeek`. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The parts of the host's date formatting this control actually uses.
 *
 * Narrower than `ComponentFramework.UserSettingApi.DateFormattingInfo` on
 * purpose: the component takes what it needs, so the smoke host can supply
 * these three fields without standing in for forty.
 */
export interface CalendarLocale {
    firstDayOfWeek: DayOfWeek;
    /** Sunday-first, as the platform hands it over. Rotated on the way out. */
    shortestDayNames: string[];
    /** Sunday-first. Used only for the day-header `title`, never for parsing. */
    dayNames: string[];
}

/**
 * What a host that publishes no `dateFormattingInfo` gets.
 *
 * English and Sunday-first, which is a guess — but it is the same guess the
 * platform's own default culture makes, and the alternative is a calendar with
 * no column headers at all. Every host that *does* publish overrides it whole.
 */
export const FALLBACK_LOCALE: CalendarLocale = {
    firstDayOfWeek: 0,
    shortestDayNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/**
 * Reads a locale off whatever the host supplied, field by field.
 *
 * Field by field rather than all-or-nothing because the three are independent:
 * a host can know its first day of the week and still hand over a short array
 * of day names. A wrong-length array would otherwise index into `undefined` and
 * render the string "undefined" as a column header.
 */
export function toCalendarLocale(info: unknown): CalendarLocale {
    const source = (info ?? {}) as Partial<CalendarLocale>;
    const first = source.firstDayOfWeek;

    return {
        firstDayOfWeek:
            typeof first === 'number' && first >= 0 && first <= 6
                ? (Math.floor(first) as DayOfWeek)
                : FALLBACK_LOCALE.firstDayOfWeek,
        shortestDayNames:
            Array.isArray(source.shortestDayNames) && source.shortestDayNames.length === 7
                ? source.shortestDayNames
                : FALLBACK_LOCALE.shortestDayNames,
        dayNames:
            Array.isArray(source.dayNames) && source.dayNames.length === 7
                ? source.dayNames
                : FALLBACK_LOCALE.dayNames,
    };
}

/** The seven column headers, rotated so the locale's first day comes first. */
export function weekdayHeaders(locale: CalendarLocale): { short: string; full: string }[] {
    const headers = [];

    for (let offset = 0; offset < 7; offset += 1) {
        const index = (locale.firstDayOfWeek + offset) % 7;

        headers.push({ short: locale.shortestDayNames[index], full: locale.dayNames[index] });
    }

    return headers;
}

/** A date `days` later, at local midnight. Negative counts go backwards. */
export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * A date `months` later, clamped to the end of the target month.
 *
 * `new Date(2026, 0, 31 + 1 month)` is 3 March, because the constructor rolls
 * an out-of-range day forward rather than complaining. Paging a calendar from
 * 31 January would therefore skip February entirely.
 */
export function addMonths(date: Date, months: number): Date {
    const year = date.getFullYear();
    const month = date.getMonth() + months;
    const lastDay = new Date(year, month + 1, 0).getDate();

    return new Date(year, month, Math.min(date.getDate(), lastDay));
}

export function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** The first day of the week `date` falls in, under this locale. */
export function startOfWeek(date: Date, locale: CalendarLocale): Date {
    const shift = (date.getDay() - locale.firstDayOfWeek + 7) % 7;

    return addDays(date, -shift);
}

export interface CalendarDay {
    date: Date;
    /** False for the leading and trailing days borrowed from the neighbours. */
    inMonth: boolean;
}

/**
 * One month as **six** rows of seven days, leading and trailing days included.
 *
 * Always six, never five: a grid that grows a row for a 31-day month starting
 * on a Saturday makes the popover jump by a row's height as the user pages
 * through it, and the button under the pointer moves out from under it.
 */
export function buildMonth(month: Date, locale: CalendarLocale): CalendarDay[][] {
    const first = startOfMonth(month);
    const monthIndex = first.getMonth();
    const cursor = startOfWeek(first, locale);
    const weeks: CalendarDay[][] = [];

    for (let week = 0; week < 6; week += 1) {
        const row: CalendarDay[] = [];

        for (let day = 0; day < 7; day += 1) {
            const date = addDays(cursor, week * 7 + day);

            row.push({ date, inMonth: date.getMonth() === monthIndex });
        }

        weeks.push(row);
    }

    return weeks;
}

/** Whether `date` falls inside the closed interval, either bound optional. */
export function withinBounds(date: Date, min: Date | null, max: Date | null): boolean {
    const day = dayNumber(date);

    return (
        (min === null || day >= dayNumber(min)) && (max === null || day <= dayNumber(max))
    );
}

/**
 * Where a day sits relative to a range, as one word.
 *
 * A single answer rather than four booleans because the states are exclusive
 * and the CSS needs exactly one class: a one-day range is `single`, not `start`
 * and `end` fighting over the same corner radii.
 */
export type DayPosition = 'none' | 'single' | 'start' | 'end' | 'between';

export function positionInRange(
    date: Date,
    start: Date | null,
    end: Date | null,
): DayPosition {
    if (start === null || end === null) {
        const only = start ?? end;

        return only !== null && isSameDay(date, only) ? 'single' : 'none';
    }

    const [from, to] = dayNumber(start) <= dayNumber(end) ? [start, end] : [end, start];

    if (isSameDay(from, to)) {
        return isSameDay(date, from) ? 'single' : 'none';
    }

    if (isSameDay(date, from)) {
        return 'start';
    }

    if (isSameDay(date, to)) {
        return 'end';
    }

    const day = dayNumber(date);

    return day > dayNumber(from) && day < dayNumber(to) ? 'between' : 'none';
}

/**
 * The quick ranges, in the order they are offered.
 *
 * Past- and future-facing tokens both, because the same control records a
 * booking window and reports on a period already elapsed. The maker chooses
 * which of them appear; this list is only what a token is allowed to be.
 */
export const PRESET_TOKENS = [
    'today',
    'thisWeek',
    'last7',
    'last30',
    'thisMonth',
    'lastMonth',
    'thisYear',
    'next7',
    'next30',
    'nextMonth',
] as const;

export type PresetToken = (typeof PRESET_TOKENS)[number];

/**
 * The maker's list, cleaned up.
 *
 * Unknown tokens are dropped rather than thrown: the property is text, a canvas
 * formula can put anything in it, and a typo should cost one button rather than
 * the control. Duplicates collapse, and the declared order is preserved rather
 * than the maker's, so two configurations of the same set look the same.
 */
export function parsePresets(raw: string | null): PresetToken[] {
    if (raw === null) {
        return [];
    }

    const asked = new Set(
        raw
            .split(',')
            .map((token) => token.trim())
            .filter((token) => token !== ''),
    );

    return PRESET_TOKENS.filter((token) => asked.has(token));
}

/**
 * A token to the pair it means, relative to `today`.
 *
 * `today` is a parameter rather than `new Date()` so the caller decides what
 * "now" is — which is what lets the smoke suite assert these at all, and what
 * keeps a control rendered at 23:59 from disagreeing with itself a minute
 * later.
 *
 * Every range is inclusive of both ends, because that is what the duration line
 * and the columns mean: "last 7 days" is today and the six before it, not today
 * and the seven before it.
 */
export function resolvePreset(
    token: PresetToken,
    today: Date,
    locale: CalendarLocale,
): { start: Date; end: Date } {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    switch (token) {
        case 'today':
            return { start: day, end: day };
        case 'thisWeek': {
            const from = startOfWeek(day, locale);

            return { start: from, end: addDays(from, 6) };
        }
        case 'last7':
            return { start: addDays(day, -6), end: day };
        case 'last30':
            return { start: addDays(day, -29), end: day };
        case 'thisMonth':
            return { start: startOfMonth(day), end: endOfMonth(day) };
        case 'lastMonth': {
            const previous = addMonths(startOfMonth(day), -1);

            return { start: previous, end: endOfMonth(previous) };
        }
        case 'thisYear':
            return {
                start: new Date(day.getFullYear(), 0, 1),
                end: new Date(day.getFullYear(), 11, 31),
            };
        case 'next7':
            return { start: day, end: addDays(day, 6) };
        case 'next30':
            return { start: day, end: addDays(day, 29) };
        case 'nextMonth': {
            const next = addMonths(startOfMonth(day), 1);

            return { start: next, end: endOfMonth(next) };
        }
        default:
            // Unreachable through `parsePresets`, which filters against the same
            // list. Present so adding a token to PRESET_TOKENS without teaching
            // this function about it fails to compile rather than at runtime.
            return { start: day, end: day };
    }
}

/** Whether a pair is exactly what a token would produce, for `aria-pressed`. */
export function matchesPreset(
    token: PresetToken,
    start: Date | null,
    end: Date | null,
    today: Date,
    locale: CalendarLocale,
): boolean {
    if (start === null || end === null) {
        return false;
    }

    const preset = resolvePreset(token, today, locale);

    return isSameDay(preset.start, start) && isSameDay(preset.end, end);
}
