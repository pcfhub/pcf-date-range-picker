import * as React from 'react';
import { dayNumber, fromInputValue, isSameDay, toInputValue } from '../range';
import {
    CalendarLocale,
    addDays,
    addMonths,
    buildMonth,
    positionInRange,
    startOfMonth,
    startOfWeek,
    weekdayHeaders,
    withinBounds,
} from '../calendar';

export interface IRangeCalendarProps {
    /** The committed pair, or the anchor half of one being picked. */
    start: Date | null;
    end: Date | null;
    /** Set while a selection is in progress: the day the user clicked first. */
    anchor: Date | null;
    min: Date | null;
    max: Date | null;
    locale: CalendarLocale;
    today: Date;
    isRTL: boolean;
    disabled: boolean;
    text: (key: string) => string;
    formatDayLabel: (date: Date) => string;
    formatMonth: (date: Date) => string;
    onPick: (date: Date) => void;
}

/**
 * Two months of days, with the range drawn across them.
 *
 * Hand-built rather than Fluent's `Calendar`, which lives in
 * `@fluentui/react-calendar-compat` — not a `<platform-library>`, so importing
 * it would pull the whole package into a bundle whose entire argument is that
 * React and Fluent are not in it.
 *
 * What that trade costs is written down here rather than discovered later: the
 * browser used to supply the keyboard handling and the locale for free, and
 * both are now this file's problem. The locale comes from the platform
 * (`userSettings.dateFormattingInfo`, threaded through as `props.locale`); the
 * keyboard is below.
 */
export function RangeCalendar(props: IRangeCalendarProps): React.ReactElement {
    const anchored = props.anchor !== null;

    /*
     * The month shown on the left. Seeded from the range and re-seeded when the
     * *committed* start moves — a preset or a typed date should bring its month
     * into view, while paging with the arrows must not be undone by a re-render.
     *
     * With nothing chosen yet it opens on today, clamped into the maker's
     * bounds: a booking window that opens next quarter would otherwise open on
     * a month in which every single day is disabled, which reads as a broken
     * calendar rather than as a bounded one.
     */
    const [leftMonth, setLeftMonth] = React.useState<Date>(() => {
        if (props.start !== null) {
            return startOfMonth(props.start);
        }

        if (props.min !== null && dayNumber(props.today) < dayNumber(props.min)) {
            return startOfMonth(props.min);
        }

        if (props.max !== null && dayNumber(props.today) > dayNumber(props.max)) {
            // The right-hand month is the later of the two, so land the window
            // on the bound rather than a month past it.
            return startOfMonth(addMonths(props.max, -1));
        }

        return startOfMonth(props.today);
    });

    const anchorMonth = props.start === null ? null : toInputValue(startOfMonth(props.start));

    React.useEffect(() => {
        if (anchorMonth !== null) {
            setLeftMonth(startOfMonth(fromInputValue(anchorMonth) as Date));
        }
    }, [anchorMonth]);

    // The day the arrow keys are sitting on. Exactly one day is in the tab
    // order at a time, so the grid is one stop rather than forty-two.
    const [focusDay, setFocusDay] = React.useState<Date>(
        () => props.start ?? props.today,
    );
    const [hovered, setHovered] = React.useState<Date | null>(null);

    /*
     * A new anchor becomes the focused day, so the preview starts as the single
     * day just clicked rather than as a range back to wherever focus happened
     * to be.
     *
     * A real click focuses the button it hit, which sets `focusDay` anyway — so
     * this is only load-bearing when it does not, which is every synthetic
     * click and any host that suppresses focus on pointer input. Depending on a
     * side effect of focus for what the user *sees* is the kind of thing that
     * works everywhere except where it is looked at.
     */
    const anchorDay = props.anchor === null ? null : toInputValue(props.anchor);

    React.useEffect(() => {
        if (anchorDay !== null) {
            setFocusDay(fromInputValue(anchorDay) as Date);
        }
    }, [anchorDay]);

    // Only steal focus after a key press. Focusing on every render would drag
    // the caret out of the typed inputs in the footer on each keystroke.
    const wantsFocus = React.useRef(false);
    const days = React.useRef<Record<string, HTMLButtonElement | null>>({});

    React.useEffect(() => {
        if (!wantsFocus.current) {
            return;
        }

        wantsFocus.current = false;
        days.current[toInputValue(focusDay)]?.focus();
    });

    const rightMonth = addMonths(leftMonth, 1);

    /*
     * Which single day carries the tab stop.
     *
     * Every date now has exactly one button — `renderDay` draws nothing for a
     * day outside its own month — so this no longer has to disambiguate two
     * copies of the same date. It used to: the trailing days of the left month
     * are the leading days of the right one, and keying the roving tabindex on
     * the date alone put `0` on both.
     *
     * What is still load-bearing is the fallback. When the month arrows have
     * paged the window away from the focused day, no button matches it — and
     * without landing on the left month's first day instead, the grid drops out
     * of the tab order entirely and a keyboard user is stranded in the popover
     * with no way back to the days.
     */
    const inWindow = (date: Date): boolean => {
        const month = date.getFullYear() * 12 + date.getMonth();

        return (
            month === leftMonth.getFullYear() * 12 + leftMonth.getMonth()
            || month === rightMonth.getFullYear() * 12 + rightMonth.getMonth()
        );
    };

    const tabDay = inWindow(focusDay) ? focusDay : leftMonth;

    /*
     * What the grid paints: the committed pair normally, and while a selection
     * is in progress the anchor against whatever the pointer or the keyboard is
     * currently over. That preview is the whole reason a range picker reads as
     * one gesture rather than as two separate dates.
     */
    const previewEnd = anchored ? (hovered ?? focusDay) : props.end;
    const paintedStart = anchored ? props.anchor : props.start;
    const paintedEnd = anchored ? previewEnd : props.end;

    const selectable = (date: Date): boolean =>
        !props.disabled && withinBounds(date, props.min, props.max);

    const move = (next: Date): void => {
        wantsFocus.current = true;
        setFocusDay(next);

        // Follow the focus into a month that is not on screen. The right-hand
        // month is on screen too, so only stepping off either end pages.
        const monthNumber = (date: Date): number => date.getFullYear() * 12 + date.getMonth();

        if (monthNumber(next) < monthNumber(leftMonth)) {
            setLeftMonth(startOfMonth(next));
        } else if (monthNumber(next) > monthNumber(rightMonth)) {
            setLeftMonth(startOfMonth(addMonths(next, -1)));
        }
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        // Under RTL the arrow pointing at tomorrow is the one pointing left.
        // Invisible to an LTR reviewer and wrong for every right-to-left user.
        const back = props.isRTL ? 'ArrowRight' : 'ArrowLeft';
        const forward = props.isRTL ? 'ArrowLeft' : 'ArrowRight';

        let next: Date | null = null;

        if (event.key === back) {
            next = addDays(focusDay, -1);
        } else if (event.key === forward) {
            next = addDays(focusDay, 1);
        } else if (event.key === 'ArrowUp') {
            next = addDays(focusDay, -7);
        } else if (event.key === 'ArrowDown') {
            next = addDays(focusDay, 7);
        } else if (event.key === 'Home') {
            next = startOfWeek(focusDay, props.locale);
        } else if (event.key === 'End') {
            next = addDays(startOfWeek(focusDay, props.locale), 6);
        } else if (event.key === 'PageUp') {
            next = addMonths(focusDay, event.shiftKey ? -12 : -1);
        } else if (event.key === 'PageDown') {
            next = addMonths(focusDay, event.shiftKey ? 12 : 1);
        } else {
            return;
        }

        // Only after a key this grid actually handles, so Tab and Escape still
        // reach the popover.
        event.preventDefault();
        move(next);
    };

    const page = (months: number): void => {
        setLeftMonth(addMonths(leftMonth, months));

        // The focused day travels with the window rather than being left
        // behind in a month nobody can see. Focus is not stolen: the user
        // pressed a button and should stay on it.
        setFocusDay(addMonths(focusDay, months));
    };

    const renderMonth = (month: Date): React.ReactElement => {
        const heading = props.formatMonth(month);

        return (
            <div className="DateRangePicker-month" key={heading}>
                <div className="DateRangePicker-month-heading" aria-hidden="true">
                    {heading}
                </div>
                <div className="DateRangePicker-grid" role="grid" aria-label={heading}>
                    <div className="DateRangePicker-week" role="row">
                        {weekdayHeaders(props.locale).map((header) => (
                            <div
                                className="DateRangePicker-weekday"
                                role="columnheader"
                                key={header.full}
                                // The two-letter form is the visible one; the
                                // full name is what a screen reader announces,
                                // since "Mo" is read as a word.
                                aria-label={header.full}
                                title={header.full}
                            >
                                <span aria-hidden="true">{header.short}</span>
                            </div>
                        ))}
                    </div>

                    {buildMonth(month, props.locale).map((week, row) => (
                        <div className="DateRangePicker-week" role="row" key={row}>
                            {week.map((day) => renderDay(day.date, day.inMonth))}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderDay = (date: Date, inMonth: boolean): React.ReactElement => {
        const key = toInputValue(date);

        /*
         * A day belonging to the month next door is drawn as an empty cell.
         *
         * Both grids are built as six full rows, so August's carries September
         * 1–5 and September's carries August 30–31 — fourteen dates with a
         * button in each. Painting the range on both copies drew the end cap
         * *twice*: a two-ended range showed three solid marks, which reads as
         * broken even though the pair behind it is correct. Reported against
         * 20 Aug – 5 Sep, where the end appeared in August's last row and again
         * in September.
         *
         * Suppressing the second cap would have fixed the symptom. Drawing each
         * date once makes it unreachable, and it is what every two-month range
         * picker does — the cell stays so the grid keeps its shape and its six
         * rows, which is what stops the popover changing height between months.
         *
         * The band ends flush against the edge of the last in-month cell rather
         * than announcing itself: a day mid-range is already square rather than
         * rounded, so a band cut off at the month's edge reads as continuing.
         */
        if (!inMonth) {
            return (
                <div
                    className="DateRangePicker-cell DateRangePicker-cell--empty"
                    role="gridcell"
                    key={key}
                />
            );
        }

        const position = positionInRange(date, paintedStart, paintedEnd);
        const enabled = selectable(date);

        const classes = ['DateRangePicker-day'];

        if (position !== 'none') {
            classes.push(`is-${position}`);
        }

        if (isSameDay(date, props.today)) {
            classes.push('is-today');
        }

        return (
            <div className="DateRangePicker-cell" role="gridcell" key={key}>
                <button
                    type="button"
                    className={classes.join(' ')}
                    // The suite reads these two rather than the rendered text:
                    // a day's identity and its part in the range are the
                    // decisions, where the markup is one rendering of them.
                    data-day={key}
                    data-position={position}
                    ref={(node): void => {
                        days.current[key] = node;
                    }}
                    disabled={!enabled}
                    aria-selected={position !== 'none'}
                    aria-label={props.formatDayLabel(date)}
                    tabIndex={isSameDay(date, tabDay) ? 0 : -1}
                    onFocus={(): void => setFocusDay(date)}
                    onMouseEnter={(): void => setHovered(date)}
                    onMouseLeave={(): void => setHovered(null)}
                    onClick={(): void => props.onPick(date)}
                >
                    {date.getDate()}
                </button>
            </div>
        );
    };

    return (
        <div className="DateRangePicker-calendar" onKeyDown={onKeyDown}>
            <div className="DateRangePicker-nav">
                <button
                    type="button"
                    className="DateRangePicker-nav-button"
                    aria-label={props.text('PreviousMonth')}
                    title={props.text('PreviousMonth')}
                    onClick={(): void => page(-1)}
                >
                    <Chevron direction={props.isRTL ? 'right' : 'left'} />
                </button>
                <button
                    type="button"
                    className="DateRangePicker-nav-button"
                    aria-label={props.text('NextMonth')}
                    title={props.text('NextMonth')}
                    onClick={(): void => page(1)}
                >
                    <Chevron direction={props.isRTL ? 'left' : 'right'} />
                </button>
            </div>

            <div className="DateRangePicker-months">
                {renderMonth(leftMonth)}
                {renderMonth(rightMonth)}
            </div>
        </div>
    );
}

/**
 * Fluent's `ChevronLeft16Regular` / `ChevronRight16Regular` path data, inlined.
 *
 * Inlined rather than imported: `@fluentui/react-icons` is not a platform
 * library, so reaching two paths through it would put the whole icon set's
 * module graph in front of the bundler. `fill: currentColor` in the stylesheet
 * is what makes the glyph follow the button's own hover and disabled colours.
 */
function Chevron(props: { direction: 'left' | 'right' }): React.ReactElement {
    const path =
        props.direction === 'left'
            ? 'M10.35 3.15a.5.5 0 0 1 0 .7L6.21 8l4.14 4.15a.5.5 0 0 1-.7.7l-4.5-4.5a.5.5 0 0 1 0-.7l4.5-4.5a.5.5 0 0 1 .7 0Z'
            : 'M5.65 3.15a.5.5 0 0 0 0 .7L9.79 8l-4.14 4.15a.5.5 0 0 0 .7.7l4.5-4.5a.5.5 0 0 0 0-.7l-4.5-4.5a.5.5 0 0 0-.7 0Z';

    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d={path} />
        </svg>
    );
}
