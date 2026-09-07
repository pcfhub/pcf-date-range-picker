import * as React from 'react';
import { dayNumber, fromInputValue, isSameDay, toInputValue } from '../range';
import {
    CalendarLocale,
    CalendarView,
    addDays,
    addMonths,
    buildMonth,
    moveFocus,
    pageWindow,
    pointAt,
    positionInRange,
    rangeToPaint,
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
    /*
     * The window, the focus and the pointer, as one value.
     *
     * They are one value rather than three states because the transitions
     * between them are where this grid's bugs live — see `CalendarView` in
     * `calendar.ts`, which holds them and the four moves that change them, so
     * the moves can be asserted without rendering anything.
     *
     * The window is seeded from the range and re-seeded when the *committed*
     * start moves — a preset or a typed date should bring its month into view,
     * while paging with the arrows must not be undone by a re-render.
     *
     * With nothing chosen yet it opens on today, clamped into the maker's
     * bounds: a booking window that opens next quarter would otherwise open on
     * a month in which every single day is disabled, which reads as a broken
     * calendar rather than as a bounded one.
     */
    const [view, setView] = React.useState<CalendarView>(() => {
        const opening = (): Date => {
            if (props.start !== null) {
                return startOfMonth(props.start);
            }

            if (props.min !== null && dayNumber(props.today) < dayNumber(props.min)) {
                return startOfMonth(props.min);
            }

            if (props.max !== null && dayNumber(props.today) > dayNumber(props.max)) {
                // The right-hand month is the later of the two, so land the
                // window on the bound rather than a month past it.
                return startOfMonth(addMonths(props.max, -1));
            }

            return startOfMonth(props.today);
        };

        return {
            leftMonth: opening(),
            // Exactly one day is in the tab order at a time, so the grid is one
            // stop rather than forty-two.
            focusDay: props.start ?? props.today,
            pointed: null,
        };
    });

    const anchorMonth = props.start === null ? null : toInputValue(startOfMonth(props.start));

    React.useEffect(() => {
        if (anchorMonth !== null) {
            const month = startOfMonth(fromInputValue(anchorMonth) as Date);

            setView((current) => ({ ...current, leftMonth: month }));
        }
    }, [anchorMonth]);

    /*
     * A new anchor becomes the focused day and clears whatever was being
     * pointed at, so the preview starts as the single day just clicked rather
     * than as a range back to wherever the focus or the pointer happened to be.
     *
     * A real click focuses the button it hit and has already pointed at it, so
     * this is only load-bearing when neither happened: every synthetic click,
     * a preset, and any host that suppresses focus on pointer input. Depending
     * on a side effect of focus for what the user *sees* is the kind of thing
     * that works everywhere except where it is looked at.
     */
    const anchorDay = props.anchor === null ? null : toInputValue(props.anchor);

    React.useEffect(() => {
        if (anchorDay !== null) {
            const day = fromInputValue(anchorDay) as Date;

            setView((current) => ({ ...current, focusDay: day, pointed: null }));
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
        days.current[toInputValue(view.focusDay)]?.focus();
    });

    const rightMonth = addMonths(view.leftMonth, 1);

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
            month === view.leftMonth.getFullYear() * 12 + view.leftMonth.getMonth()
            || month === rightMonth.getFullYear() * 12 + rightMonth.getMonth()
        );
    };

    const tabDay = inWindow(view.focusDay) ? view.focusDay : view.leftMonth;

    /*
     * What the grid paints: the committed pair normally, and while a selection
     * is in progress the anchor against whatever the pointer or the keyboard is
     * currently on. That preview is the whole reason a range picker reads as
     * one gesture rather than as two separate dates — and why it must not
     * appear before the user has pointed anywhere.
     */
    const painted = rangeToPaint(view, props.anchor, props.start, props.end);

    const selectable = (date: Date): boolean =>
        !props.disabled && withinBounds(date, props.min, props.max);

    const move = (next: Date): void => {
        wantsFocus.current = true;
        setView((current) => moveFocus(current, next));
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        // Under RTL the arrow pointing at tomorrow is the one pointing left.
        // Invisible to an LTR reviewer and wrong for every right-to-left user.
        const back = props.isRTL ? 'ArrowRight' : 'ArrowLeft';
        const forward = props.isRTL ? 'ArrowLeft' : 'ArrowRight';

        let next: Date | null = null;

        if (event.key === back) {
            next = addDays(view.focusDay, -1);
        } else if (event.key === forward) {
            next = addDays(view.focusDay, 1);
        } else if (event.key === 'ArrowUp') {
            next = addDays(view.focusDay, -7);
        } else if (event.key === 'ArrowDown') {
            next = addDays(view.focusDay, 7);
        } else if (event.key === 'Home') {
            next = startOfWeek(view.focusDay, props.locale);
        } else if (event.key === 'End') {
            next = addDays(startOfWeek(view.focusDay, props.locale), 6);
        } else if (event.key === 'PageUp') {
            next = addMonths(view.focusDay, event.shiftKey ? -12 : -1);
        } else if (event.key === 'PageDown') {
            next = addMonths(view.focusDay, event.shiftKey ? 12 : 1);
        } else {
            return;
        }

        // Only after a key this grid actually handles, so Tab and Escape still
        // reach the popover.
        event.preventDefault();
        move(next);
    };

    /*
     * Focus is not stolen here: the user pressed a button and should stay on
     * it. `pageWindow` is what decides the rest, and what it deliberately does
     * *not* move is the pointer — see its comment.
     */
    const page = (months: number): void => {
        setView((current) => pageWindow(current, months));
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

        const position = positionInRange(date, painted.start, painted.end);
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
                    // Focus alone moves the tab stop and nothing else. Tabbing
                    // into the grid is not pointing at a day, and a preview
                    // that appeared on focus would draw a range the user never
                    // asked for — which is the bug the pointer/focus split
                    // exists to prevent.
                    onFocus={(): void => setView((current) => ({ ...current, focusDay: date }))}
                    onMouseEnter={(): void => setView((current) => pointAt(current, date))}
                    onMouseLeave={(): void => setView((current) => pointAt(current, null))}
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
                {renderMonth(view.leftMonth)}
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
