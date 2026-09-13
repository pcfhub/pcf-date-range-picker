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
 * Whether a column's `Behavior` means the platform keeps the day itself rather
 * than an instant.
 *
 * `2` is DateOnly and `3` is TimeZoneIndependent — both documented as stored
 * *without conversion to UTC*. `1` is UserLocal, which is stored as UTC and is
 * therefore a real instant. `0` is None, and an absent `attributes` is canvas,
 * where there is no column at all; both fall to the instant reading, because
 * that is the one that cannot be wrong about a value it was never told about.
 */
function storesTheDayItself(behavior: number | undefined): boolean {
    return behavior === 2 || behavior === 3;
}

/**
 * The calendar day a bound value means, as a `Date` at **local midnight**.
 *
 * This exists because `context.parameters.x.raw` and
 * `Xrm.Page.getAttribute(...).getValue()` do not agree, which is not something
 * any documentation says out loud. Measured on a real form, one column, one
 * moment, the same stored day:
 *
 *     attribute API   2026-09-18T06:00:00.000Z   local midnight
 *     PCF raw         2026-09-18T00:00:00.000Z   UTC midnight
 *
 * Read with local components in a UTC-6 browser, the second is **17
 * September**. Every part of the control agreed on the wrong day — the grid,
 * the typed inputs and the trigger all read local components — which is what
 * finally distinguished this from the formatting bug that came before it: a
 * mis-*formatted* value would have disagreed with the typed inputs, and this
 * did not.
 *
 * So for a behaviour that stores the day itself, the day is in the **UTC**
 * components, and reading it locally shifts it for everyone west of UTC. For
 * UserLocal the value is a genuine instant and the local components are right,
 * which is what the rest of this file has always assumed.
 *
 * The whole control works in local-midnight days behind this. Converting once,
 * here, is what keeps `toInputValue`, `dayNumber` and the calendar grid free of
 * any of it.
 */
export function dayFromPlatform(value: Date | null, behavior: number | undefined): Date | null {
    if (value === null) {
        return null;
    }

    return storesTheDayItself(behavior)
        ? new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
        : new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * The same day on the way back out, in whichever shape the column expects.
 *
 * Midday in both cases, never midnight, so that neither side's conversion can
 * push the date across a boundary — `atMidday` explains why at length. The
 * difference is only *which* midday: a column that stores the day itself is
 * read back through UTC, so the anchor has to be UTC midday for the round trip
 * to land on the same date.
 */
export function dayToPlatform(value: Date | null, behavior: number | undefined): Date | null {
    if (value === null) {
        return null;
    }

    return storesTheDayItself(behavior)
        ? new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12))
        : atMidday(value);
}

/**
 * The same calendar day, at **midday** rather than at midnight.
 *
 * This is what the control hands the platform, and the reason is that a
 * date-only value does not always stay a date.
 *
 * `DateTimeFieldBehavior` (the platform's own typings) has three live values,
 * and they do not agree with each other:
 *
 *   1 UserLocal            dates stored as UTC
 *   2 DateOnly             stored as midnight, no conversion to UTC
 *   3 TimeZoneIndependent  stored without conversion to UTC
 *
 * Only **1** converts, and a column can be *formatted* Date Only while
 * *behaving* as UserLocal — a common and invisible misconfiguration. On such a
 * column the value is an instant, and the day it reads back as depends on the
 * timezone it is read in. Anchored at midnight, that breaks at the very first
 * hour of difference between the browser and the Dataverse user's timezone:
 * a day picked at 00:00 in a UTC-6 browser is 06:00Z, which is still the
 * *previous* day for every viewer west of UTC-6.
 *
 * Reported from a real form: a range picked as 6 Sep – 31 Oct came back as
 * 5 Sep – 30 Oct, both ends exactly one day early.
 *
 * Midday moves the anchor to the middle of the day, so the same value survives
 * roughly twelve hours of disagreement in either direction instead of none.
 * It is what `pcfhub.json`'s demo presets have always used — every date in
 * them is written `…T12:00:00` — so this only brings the control into line
 * with its own fixtures.
 *
 * **It is not a guarantee.** A mismatch beyond about twelve hours still shifts
 * the day, and nothing a control can do from inside the browser fixes a column
 * that stores a day as an instant. Give both columns the **Date Only**
 * behaviour; docs/limitations.md says so for this reason.
 *
 * Behaviour 2 and 3 do not convert at all, so the time of day is discarded and
 * midday costs them nothing.
 */
export function atMidday(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/**
 * The calendar day as a whole number, built as a UTC instant out of *local*
 * components. Subtracting two of these is DST-proof, where subtracting the
 * timestamps directly is off by an hour across a transition — enough to make
 * a `Math.round` of "days between" wrong at the boundary.
 *
 * Exported so `calendar.ts` builds its grids and its presets on this one
 * definition rather than on a second copy that drifts from it.
 */
export function dayNumber(date: Date): number {
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
    /**
     * Whether a same-day pair is also ordered by its times. True only when
     * **both** columns carry a time; a whole day on either side has no moment
     * to be before or after.
     */
    byInstant: boolean;
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

    // Same day, both carrying a time: the order of the two moments matters.
    // With one side a whole day there is no moment to compare against, so the
    // day rule above is the whole rule.
    if (rules.byInstant && end.getTime() < start.getTime()) {
        return 'EndBeforeStart';
    }

    return null;
}

/* ------------------------------------------------------------- with a time */

/**
 * What the control needs to know about a bound column to move a value across
 * the platform boundary in either direction: its `Behavior`, and whether the
 * column carries a time at all.
 *
 * `hasTime` is decided in `index.ts` — from `attributes.Format` on a form,
 * from the `time` input on canvas — and everything below branches on it before
 * it branches on the behaviour, because a whole day and a moment are shaped
 * differently on both sides of the boundary.
 */
export interface ColumnShape {
    behavior: number | undefined;
    hasTime: boolean;
}

/**
 * The Dataverse user's offset from UTC, in minutes, **ahead** of UTC — the
 * platform's sign, which is the opposite of `Date.prototype.getTimezoneOffset`.
 * Measured on a real form in a UTC-6 browser: the browser says `360`, the
 * platform says `-360`.
 *
 * Takes the date being converted because the answer depends on it: the same
 * user is at `-360` in January and `-300` in July, and the platform's
 * no-argument call answers the *standard* offset rather than today's. `null`
 * is a host that has no such setting — canvas — where the browser's own zone
 * is the only clock there is.
 */
export type OffsetFor = (date: Date) => number | null;

/**
 * The wall-clock value a bound column means, as a `Date` whose **local**
 * components are that wall clock.
 *
 * This is the representation the whole control works in, and it is the one
 * the platform *writes* in — see `toPlatform`. For a whole day it is local
 * midnight, exactly as `dayFromPlatform` has always produced. For a moment it
 * is the day and the time as the user's form would show them, and where that
 * comes from depends on the behaviour, measured on 12 September 2026 against
 * two Date and Time columns on one record:
 *
 *   UserLocal (1)             `raw` is the true instant — `2026-09-18T13:30:45Z`,
 *                             and the Web API holds the same. The wall clock is
 *                             that instant in the *Dataverse user's* zone, not
 *                             the browser's: the two differed by an hour on the
 *                             form this was measured on, and the native field
 *                             showed the user's (`8:30 AM`, not `7:30 AM`).
 *   TimeZoneIndependent (3)   `raw` carries the wall clock in its **UTC**
 *                             components — `2026-09-18T08:30:45Z` for half past
 *                             eight — the same shape a DateOnly column keeps its
 *                             day in. `getAttribute().getValue()` disagrees by
 *                             the browser's offset, as it does for DateOnly.
 *   DateOnly (2)              cannot carry a time; the day branch handles it.
 *   absent (canvas)           no column and no user zone: the instant, read in
 *                             the browser's clock, is the only reading there is.
 */
export function fromPlatform(
    value: Date | null,
    shape: ColumnShape,
    offsetFor: OffsetFor,
): Date | null {
    if (value === null) {
        return null;
    }

    if (!shape.hasTime) {
        return dayFromPlatform(value, shape.behavior);
    }

    if (storesTheDayItself(shape.behavior)) {
        return fromUTCComponents(value);
    }

    const offset = shape.behavior === 1 ? offsetFor(value) : null;

    if (offset === null) {
        return new Date(
            value.getFullYear(),
            value.getMonth(),
            value.getDate(),
            value.getHours(),
            value.getMinutes(),
            value.getSeconds(),
        );
    }

    // Slide the instant to the user's clock, then read it as UTC components:
    // that is the wall clock with no browser zone in it.
    return fromUTCComponents(new Date(value.getTime() + offset * 60_000));
}

/**
 * The same value on the way out.
 *
 * For a moment this is the wall-clock `Date` **verbatim**, and the reason is
 * the finding that decided 0.3.0: **the platform never reads the instant a
 * control hands it.** It reads the `Date`'s browser-local components and
 * treats them as the wall clock — then a UserLocal column converts that wall
 * clock out of the *user's* zone to UTC, and a TimeZoneIndependent column
 * stores it as it is. Measured: `2026-09-18T14:30:45Z` handed over from a
 * UTC-6 browser (local components `08:30:45`) was stored as `13:30:45Z` by a
 * UserLocal column — half past eight in the user's UTC-5 — and as `08:30:45Z`
 * by a TimeZoneIndependent one.
 *
 * So there is nothing to convert. A `Date` whose local components are the
 * wall clock is already the shape the platform wants, for every behaviour, and
 * anything done to it here — an offset, a midday anchor — would be undone or
 * doubled on the other side. The seconds go too: the column keeps them.
 *
 * A whole day keeps `dayToPlatform`'s midday write, which is measured to land
 * the right day and has twelve hours to spare.
 */
export function toPlatform(value: Date | null, shape: ColumnShape): Date | null {
    if (value === null) {
        return null;
    }

    if (!shape.hasTime) {
        return dayToPlatform(value, shape.behavior);
    }

    return new Date(value.getTime());
}

/** A `Date` whose local components are the given one's UTC components. */
function fromUTCComponents(value: Date): Date {
    return new Date(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        value.getUTCHours(),
        value.getUTCMinutes(),
        value.getUTCSeconds(),
    );
}

/** Hours, minutes and seconds of a wall-clock `Date`. */
export interface TimeOfDay {
    hours: number;
    minutes: number;
    seconds: number;
}

export function timeOf(date: Date): TimeOfDay {
    return { hours: date.getHours(), minutes: date.getMinutes(), seconds: date.getSeconds() };
}

/** The given calendar day, at the given time of day. Midnight when no time. */
export function withTime(day: Date, time: TimeOfDay | null): Date {
    return new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        time?.hours ?? 0,
        time?.minutes ?? 0,
        time?.seconds ?? 0,
    );
}

/**
 * A wall-clock `Date` to the `HH:mm` an `<input type="time">` expects, from
 * its local components — the same rule as `toInputValue`, for the same reason.
 *
 * Minutes only. The column keeps seconds and so does the value; the box shows
 * what the form's own field shows, and a time typed into it starts a fresh
 * minute. The seconds are kept until the user changes the time, which is what
 * keeps a reload from looking like an edit.
 */
export function toTimeInputValue(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** `HH:mm` or `HH:mm:ss` back to a time of day, or `null` for anything else. */
export function fromTimeInputValue(value: string): TimeOfDay | null {
    const parts = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);

    if (parts === null) {
        return null;
    }

    const hours = Number(parts[1]);
    const minutes = Number(parts[2]);
    const seconds = parts[3] === undefined ? 0 : Number(parts[3]);

    if (hours > 23 || minutes > 59 || seconds > 59) {
        return null;
    }

    return { hours, minutes, seconds };
}

/**
 * Whether two wall-clock values are the same value, to the second.
 *
 * The timed counterpart of `isSameDay`, and the change guard uses one or the
 * other depending on whether the column carries a time. To the second rather
 * than the millisecond because the column stores seconds and nothing finer,
 * so a value that has been through the platform can differ from the one that
 * went out by a fraction the user never saw.
 */
export function isSameSecond(a: Date, b: Date): boolean {
    return Math.floor(a.getTime() / 1000) === Math.floor(b.getTime() / 1000);
}
