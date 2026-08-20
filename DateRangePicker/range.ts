/**
 * Date boundary and range rules, kept apart from the control so both the entry
 * point and the React component apply exactly one definition of "valid" — and
 * so the timezone handling below can be tested without a platform.
 */

/** Which rule a pair breaks, as a resource key suffix. `null` means valid. */
export type RangeProblem =
    | 'EndBeforeStart'
    | 'SameDayNotAllowed'
    | 'BeforeMin'
    | 'AfterMax'
    | null;

/**
 * A `Date` to the `yyyy-mm-dd` an `<input type="date">` expects, read from the
 * date's **local** components.
 *
 * Not `toISOString().slice(0, 10)`. That converts to UTC first, so it reports
 * the wrong calendar day whenever the local day and the UTC day differ — and
 * which values break depends on which side of UTC you are:
 *
 *   UTC+12  a DateOnly value at local midnight serialises a day early
 *   UTC-6   an evening UserLocal value serialises a day late
 *
 * A developer in one hemisphere therefore cannot reproduce the other's bug
 * report, which is most of why this one survives so long.
 *
 * All three named `Behavior` values (UserLocal, DateOnly, TimeZoneIndependent)
 * hand over a `Date` whose *local* components are the calendar date the user
 * means, so reading them locally is correct for every one of them.
 */
export function toInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * `yyyy-mm-dd` back to a `Date` at **local** midnight.
 *
 * Not `new Date(value)`. The spec parses a date-only ISO string as UTC
 * midnight, so reading it back with local getters loses a day for every user
 * west of UTC.
 */
export function fromInputValue(value: string): Date | null {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (parts === null) {
        return null;
    }

    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));

    // Rejects 2026-02-31, which the Date constructor would roll into March.
    return Number.isNaN(date.getTime()) || date.getDate() !== Number(parts[3]) ? null : date;
}

/**
 * The calendar day as a whole number, built as a UTC instant out of *local*
 * components. Subtracting two of these is DST-proof, where subtracting the
 * timestamps directly is off by an hour across a transition — enough to make
 * a `Math.round` of "days between" wrong at the boundary.
 */
function dayNumber(date: Date): number {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** Whole days from start to end. Same day is 0. */
export function daysBetween(start: Date, end: Date): number {
    return dayNumber(end) - dayNumber(start);
}

/** Whether two dates are the same calendar day, ignoring any time component. */
export function isSameDay(a: Date, b: Date): boolean {
    return dayNumber(a) === dayNumber(b);
}

export interface RangeRules {
    allowSameDay: boolean;
    min: Date | null;
    max: Date | null;
}

/**
 * The one definition of a valid pair.
 *
 * An incomplete pair is not a problem — a user filling in the first of two
 * fields has not made a mistake yet, and reporting one there would flash an
 * error at every keystroke. Requiredness is the platform's to enforce.
 */
export function validateRange(
    start: Date | null,
    end: Date | null,
    rules: RangeRules,
): RangeProblem {
    for (const date of [start, end]) {
        if (date === null) {
            continue;
        }

        if (rules.min !== null && dayNumber(date) < dayNumber(rules.min)) {
            return 'BeforeMin';
        }

        if (rules.max !== null && dayNumber(date) > dayNumber(rules.max)) {
            return 'AfterMax';
        }
    }

    if (start === null || end === null) {
        return null;
    }

    if (daysBetween(start, end) < 0) {
        return 'EndBeforeStart';
    }

    if (!rules.allowSameDay && isSameDay(start, end)) {
        return 'SameDayNotAllowed';
    }

    return null;
}
