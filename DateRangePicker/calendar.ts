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
    /**
     * The organisation's short time pattern in .NET's vocabulary — `h:mm tt`,
     * `HH:mm` — with the two designators it names. Measured off a real
     * organisation on 12 September 2026: every key of `dateFormattingInfo` is
     * present, and under two spellings (`shortTimePattern` and
     * `ShortTimePattern`); the camel-cased one is what the typings name.
     */
    shortTimePattern: string;
    amDesignator: string;
    pmDesignator: string;
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
    shortTimePattern: 'h:mm tt',
    amDesignator: 'AM',
    pmDesignator: 'PM',
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
        shortTimePattern:
            typeof source.shortTimePattern === 'string' && source.shortTimePattern.length > 0
                ? source.shortTimePattern
                : FALLBACK_LOCALE.shortTimePattern,
        amDesignator:
            typeof source.amDesignator === 'string' ? source.amDesignator : FALLBACK_LOCALE.amDesignator,
        pmDesignator:
            typeof source.pmDesignator === 'string' ? source.pmDesignator : FALLBACK_LOCALE.pmDesignator,
    };
}

/**
 * A wall-clock time in the organisation's short time pattern.
 *
 * The control's own, rather than `context.formatting`, and the reason is
 * measured rather than aesthetic: on a real form `formatDateShort(x, true)`
 * renders the *browser's* clock, `formatTime(x, 1)` the *Dataverse user's*,
 * and `formatTime(x, 3)` the UTC components — and every one of them renders
 * the date in front of the time, so none can label a time box. The control
 * already holds the wall clock as local components, so all that is left is
 * the pattern, and `dateFormattingInfo` supplies it.
 *
 * .NET's tokens, the ones a short time pattern uses: `h`/`hh` twelve-hour,
 * `H`/`HH` twenty-four, `m`/`mm`, `s`/`ss`, `t`/`tt` for the designator, and
 * anything in single quotes is literal. Every other character passes through,
 * which is what carries `:` and `.` and the space.
 */
export function formatTimeOfDay(date: Date, locale: CalendarLocale): string {
    const pattern = locale.shortTimePattern;
    const hours = date.getHours();
    const twelve = hours % 12 === 0 ? 12 : hours % 12;
    const designator = hours < 12 ? locale.amDesignator : locale.pmDesignator;
    const pad = (n: number): string => String(n).padStart(2, '0');

    let out = '';
    let i = 0;

    while (i < pattern.length) {
        const char = pattern[i];

        if (char === "'") {
            const close = pattern.indexOf("'", i + 1);
            const end = close === -1 ? pattern.length : close;

            out += pattern.slice(i + 1, end);
            i = end + 1;
            continue;
        }

        if ('hHmst'.includes(char)) {
            let run = 1;

            while (pattern[i + run] === char) {
                run += 1;
            }

            switch (char) {
                case 'h':
                    out += run >= 2 ? pad(twelve) : String(twelve);
                    break;
                case 'H':
                    out += run >= 2 ? pad(hours) : String(hours);
                    break;
                case 'm':
                    out += run >= 2 ? pad(date.getMinutes()) : String(date.getMinutes());
                    break;
                case 's':
                    out += run >= 2 ? pad(date.getSeconds()) : String(date.getSeconds());
                    break;
                default:
                    out += run >= 2 ? designator : designator.slice(0, 1);
            }

            i += run;
            continue;
        }

        out += char;
        i += 1;
    }

    return out;
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
 * Where the two-month window sits, and what the user is on inside it.
 *
 * Three fields a component would naturally hold as three separate states, kept
 * together because the bug they had was a *relationship* between two of them.
 * The month arrows moved the focused day so that the arrow keys would carry on
 * from a month still on screen — correct, and necessary — and the preview was
 * painted from that same focused day. Paging away from a half-made selection
 * therefore drew a range from the anchor to the same day-of-month in every
 * month paged through, with nobody having chosen an end date.
 *
 * As one value with the transitions below, `pointed` is simply **absent from
 * the paging step**, which is the difference between fixing the bug and
 * suppressing the symptom.
 */
export interface CalendarView {
    /** The month drawn on the left; the right-hand one is the month after it. */
    leftMonth: Date;
    /** The day the arrow keys are on, and the grid's single tab stop. */
    focusDay: Date;
    /**
     * The day the pointer is over, or that the keyboard was last deliberately
     * moved to — and `null` when it is neither, which is the state a freshly
     * anchored calendar is in and the one that must paint no range.
     */
    pointed: Date | null;
}

/** A month as one comparable number, so "is it on screen" is arithmetic. */
function monthNumber(date: Date): number {
    return date.getFullYear() * 12 + date.getMonth();
}

/**
 * Page the window by whole months.
 *
 * The focused day travels with it. Without that, a user who paged to December
 * and then pressed an arrow key would continue from wherever the focus was left
 * behind — and the window would snap back to that month, which reads as the
 * arrows being broken.
 *
 * `pointed` does not travel, and that is the point: the user moved the window,
 * not the pointer.
 */
export function pageWindow(view: CalendarView, months: number): CalendarView {
    return {
        leftMonth: addMonths(view.leftMonth, months),
        focusDay: addMonths(view.focusDay, months),
        pointed: view.pointed,
    };
}

/**
 * Move to a day, bringing the window with it when that day is off screen.
 *
 * This is the deliberate kind of movement — an arrow key, Home, PageDown — so
 * unlike paging it *is* what the preview follows.
 */
export function moveFocus(view: CalendarView, next: Date, months: 1 | 2 = 2): CalendarView {
    const left = monthNumber(view.leftMonth);
    const target = monthNumber(next);

    let leftMonth = view.leftMonth;

    if (target < left) {
        leftMonth = startOfMonth(next);
    } else if (target > left + months - 1) {
        // Every month in the window is on screen, so only stepping off the far
        // end of the *last* one pages; landing there leaves the window where
        // it is. With one month showing the last one is the first one.
        leftMonth = startOfMonth(addMonths(next, -(months - 1)));
    }

    return { leftMonth, focusDay: next, pointed: next };
}

/** Point at a day, or stop pointing at one. Nothing else moves. */
export function pointAt(view: CalendarView, date: Date | null): CalendarView {
    return { ...view, pointed: date };
}

/**
 * The pair the grid paints.
 *
 * The committed range normally; while a selection is in progress, the anchor
 * against whatever the user is pointing at. **When they are pointing at
 * nothing, the anchor alone** — that last clause is the whole of the fix. The
 * fallback used to be the focused day, which the month arrows move.
 */
export function rangeToPaint(
    view: CalendarView,
    anchor: Date | null,
    start: Date | null,
    end: Date | null,
): { start: Date | null; end: Date | null } {
    if (anchor === null) {
        return { start, end };
    }

    return { start: anchor, end: view.pointed ?? anchor };
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
