import * as React from 'react';
import {
    FluentProvider,
    Popover,
    PopoverSurface,
    PopoverTrigger,
    Theme,
    webLightTheme,
} from '@fluentui/react-components';
import {
    RangeRules,
    dayNumber,
    daysBetween,
    fromInputValue,
    isSameDay,
    toInputValue,
    validateRange,
} from '../range';
import { CalendarLocale, PresetToken } from '../calendar';
import { PresetRail } from './PresetRail';
import { RangeCalendar } from './RangeCalendar';

export interface IProps {
    startDate: Date | null;
    endDate: Date | null;
    rules: RangeRules;
    visible: boolean;
    startReadable: boolean;
    endReadable: boolean;
    startEditable: boolean;
    endEditable: boolean;
    startError: string | null;
    endError: string | null;
    label: string;
    isRTL: boolean;
    showDuration: boolean;
    presets: PresetToken[];
    locale: CalendarLocale;
    today: Date;
    theme: Theme | undefined;
    isDark: boolean;
    resources: ComponentFramework.Resources;
    formatDate: (date: Date) => string;
    formatDayLabel: (date: Date) => string;
    formatMonth: (date: Date) => string;
    onChange: (start: Date | null, end: Date | null) => void;
}

/**
 * One field on the form; the calendar lives in a popover behind it.
 *
 * v0.1.x put two native `<input type="date">` side by side, which meant picking
 * a range in two unrelated browser calendars with nothing drawn between them —
 * and wrapping onto two lines in any normal form column. One trigger fixes the
 * layout, and a two-month grid with an anchor and a hover preview is what makes
 * the range read as one gesture instead of two dates.
 *
 * The native inputs survive in the popover footer, and deliberately. Their
 * value is `yyyy-mm-dd` regardless of display locale, which is the whole reason
 * SPEC.md chose them: exactly one format to convert at exactly one boundary,
 * and no parsing of whatever a user typed. They are the fast path for anyone
 * who already knows the dates.
 *
 * Edit state lives here rather than on the control class. On a real form either
 * would work, because the platform re-renders after `notifyOutputChanged()`.
 * PCFHub's demo harness does not — it posts the outputs to the parent window
 * and neither re-renders nor writes the value back — so a component rendering
 * straight from props would look dead in the published demo.
 */
export function DateRangePickerControl(props: IProps): React.ReactElement | null {
    const [start, setStart] = React.useState<Date | null>(props.startDate);
    const [end, setEnd] = React.useState<Date | null>(props.endDate);
    const [open, setOpen] = React.useState(false);

    /**
     * The first day of a selection in progress.
     *
     * Held apart from `start`/`end` so a half-finished pick writes nothing: a
     * first click that committed `start` with a null `end` would blank the end
     * column, and closing the popover would leave it blank. While this is set
     * the grid paints the preview and the committed pair is untouched.
     */
    const [anchor, setAnchor] = React.useState<Date | null>(null);

    /*
     * The field, held as state rather than a ref because the popover is
     * positioned against it and a ref's assignment does not re-render. A
     * callback ref costs one extra render at mount, long before anything can
     * open.
     */
    const [fieldEl, setFieldEl] = React.useState<HTMLButtonElement | null>(null);

    // Resync on the *instant*, not on the object: every `updateView` hands down
    // a fresh Date, so depending on identity would reset local state on every
    // pass and discard whatever the user was doing.
    const incomingStart = props.startDate === null ? null : props.startDate.getTime();
    const incomingEnd = props.endDate === null ? null : props.endDate.getTime();

    React.useEffect(() => {
        setStart(incomingStart === null ? null : new Date(incomingStart));
    }, [incomingStart]);

    React.useEffect(() => {
        setEnd(incomingEnd === null ? null : new Date(incomingEnd));
    }, [incomingEnd]);

    const text = (key: string): string => props.resources.getString(`DateRangePicker_${key}`);

    /**
     * Every return path goes through here.
     *
     * `FluentProvider` is what emits the design tokens as CSS custom properties,
     * so a branch that returns without it — the no-access one, historically —
     * renders unthemed. It also carries the theme into the popover, which Fluent
     * attaches through a portal well outside this control's own root.
     */
    /*
     * `colorScheme` is what makes the two native `<input type="date">` in the
     * footer follow a dark app.
     *
     * The browser draws their calendar glyph, their spinners and their popup,
     * and no stylesheet reaches any of it — so on a dark form they stayed a
     * white box with black text while everything around them went dark. This
     * is the one property that tells the browser which way round the page is,
     * and it is set from the host's theme rather than from
     * `prefers-color-scheme`, for the same reason everything else here is: a
     * model-driven app carries its own theme and the operating system's setting
     * says nothing about it.
     *
     * Undefined when the host published nothing, which leaves the page's own
     * scheme alone rather than asserting "light" over a host that never said.
     */
    const colorScheme = props.isDark ? 'dark' : undefined;

    const frame = (content: React.ReactElement): React.ReactElement => (
        <FluentProvider
            className="DateRangePicker"
            theme={props.theme ?? webLightTheme}
            dir={props.isRTL ? 'rtl' : 'ltr'}
            style={{ colorScheme }}
        >
            {content}
        </FluentProvider>
    );

    if (!props.visible) {
        return null;
    }

    /*
     * Field-level security, read per column.
     *
     * v0.1.x hid the whole control when *either* column was unreadable, which
     * contradicted the promise in docs/model-driven.md and threw away the two
     * flags index.ts computes separately. A user permitted the start date and
     * denied the end date now sees exactly that.
     */
    if (!props.startReadable && !props.endReadable) {
        return frame(<p className="DateRangePicker-message">{text('NoAccess')}</p>);
    }

    const restricted = !props.startReadable || !props.endReadable;

    /*
     * Picking is all-or-nothing even though reading is not. The control edits
     * one range, and a range half of which the user may not see or may not
     * write is not a range they can pick — so the trigger goes read-only rather
     * than opening onto a calendar that can only commit one end.
     */
    const editable =
        props.startEditable && props.endEditable && props.startReadable && props.endReadable;

    const problem = validateRange(start, end, props.rules);
    const platformError = props.startError ?? props.endError;

    const commit = (nextStart: Date | null, nextEnd: Date | null): void => {
        setStart(nextStart);
        setEnd(nextEnd);
        props.onChange(nextStart, nextEnd);
    };

    const pickDay = (date: Date): void => {
        if (anchor === null) {
            setAnchor(date);

            return;
        }

        // Clicked before the anchor: swap rather than refuse. v0.1.x answered a
        // backwards pair with an error message, which is a mistake to report
        // when the user's intent is unambiguous — nobody means "end, then a
        // start after it".
        const [from, to] =
            dayNumber(anchor) <= dayNumber(date) ? [anchor, date] : [date, anchor];

        setAnchor(null);
        commit(from, to);
    };

    const typed = (which: 'start' | 'end') => (
        event: React.ChangeEvent<HTMLInputElement>,
    ): void => {
        const parsed = fromInputValue(event.target.value);

        setAnchor(null);
        commit(which === 'start' ? parsed : start, which === 'end' ? parsed : end);
    };

    const half = (date: Date | null, readable: boolean): string => {
        if (!readable) {
            return text('Restricted');
        }

        return date === null ? '—' : props.formatDate(date);
    };

    const triggerText =
        start === null && end === null && !restricted
            ? text('Placeholder')
            : `${half(start, props.startReadable)} – ${half(end, props.endReadable)}`;

    const durationText = (): string | null => {
        if (!props.showDuration || start === null || end === null || problem !== null) {
            return null;
        }

        if (isSameDay(start, end)) {
            return text('DurationSameDay').replace('{0}', props.formatDate(start));
        }

        return text('Duration')
            .replace('{0}', String(daysBetween(start, end) + 1))
            .replace('{1}', props.formatDate(start))
            .replace('{2}', props.formatDate(end));
    };

    const duration = durationText();

    const bounds = {
        min: props.rules.min === null ? undefined : toInputValue(props.rules.min),
        max: props.rules.max === null ? undefined : toInputValue(props.rules.max),
    };

    /*
     * The field surface **is** the button, rather than a button inside a
     * surface.
     *
     * `PopoverTrigger` clones its child and puts `role`, `tabindex` and
     * `aria-expanded` on it. Wrapping a real button in a styled div therefore
     * produced two tab stops for one control — the div Fluent had made
     * focusable, and the button inside it — which is the sort of thing that
     * reads fine and is unusable with a keyboard. One element carries the
     * fill, the border, the focus underline and the click.
     *
     * `aria-haspopup` and `aria-expanded` are Fluent's to set here, so this
     * declares neither; duplicating them is how they come to disagree.
     */
    const trigger = (
        <button
            type="button"
            className={`DateRangePicker-field${editable ? '' : ' is-readonly'}`}
            ref={setFieldEl}
            disabled={!editable}
            aria-label={props.label || text('Name')}
        >
            <span
                className={`DateRangePicker-value${
                    start === null && end === null && !restricted ? ' is-placeholder' : ''
                }`}
            >
                {triggerText}
            </span>
            <CalendarIcon />
        </button>
    );

    return frame(
        <>
            <Popover
                open={open}
                onOpenChange={(_event, data): void => {
                    setOpen(data.open);

                    // An abandoned first click is not a value. Dropping the
                    // anchor on close is what stops a reopened popover painting
                    // a preview from a gesture the user walked away from.
                    if (!data.open) {
                        setAnchor(null);
                    }
                }}
                trapFocus
                positioning={{ target: fieldEl, position: 'below', align: 'start' }}
            >
                <PopoverTrigger disableButtonEnhancement>{trigger}</PopoverTrigger>

                {/*
                 * Fluent renders the surface through a portal, attached near the
                 * end of the document rather than under this control's root, so
                 * nothing scoped under `.DateRangePicker` reaches inside it. The
                 * class goes on the surface itself and the stylesheet leads with
                 * it — still namespaced, so still incapable of touching the host
                 * page; just anchored somewhere that exists.
                 */}
                <PopoverSurface
                    className="DateRangePicker-popover"
                    aria-label={props.label || text('Name')}
                    // The surface is portalled, so it is not a descendant of
                    // the provider above and inherits nothing from it.
                    style={{ colorScheme }}
                >
                    <div className="DateRangePicker-popover-body">
                        <PresetRail
                            tokens={props.presets}
                            start={start}
                            end={end}
                            today={props.today}
                            locale={props.locale}
                            disabled={!editable}
                            text={text}
                            onPick={(from, to): void => {
                                setAnchor(null);
                                commit(from, to);
                            }}
                        />

                        <RangeCalendar
                            start={start}
                            end={end}
                            anchor={anchor}
                            min={props.rules.min}
                            max={props.rules.max}
                            locale={props.locale}
                            today={props.today}
                            isRTL={props.isRTL}
                            disabled={!editable}
                            text={text}
                            formatDayLabel={props.formatDayLabel}
                            formatMonth={props.formatMonth}
                            onPick={pickDay}
                        />
                    </div>

                    <div className="DateRangePicker-footer">
                        <div className="DateRangePicker-typed">
                            <label className="DateRangePicker-typed-field">
                                <span>{text('StartLabel')}</span>
                                <input
                                    className="DateRangePicker-input"
                                    type="date"
                                    value={start === null ? '' : toInputValue(start)}
                                    disabled={!editable}
                                    {...bounds}
                                    onChange={typed('start')}
                                />
                            </label>
                            <label className="DateRangePicker-typed-field">
                                <span>{text('EndLabel')}</span>
                                <input
                                    className="DateRangePicker-input"
                                    type="date"
                                    value={end === null ? '' : toInputValue(end)}
                                    disabled={!editable}
                                    {...bounds}
                                    onChange={typed('end')}
                                />
                            </label>
                        </div>

                        <div className="DateRangePicker-actions">
                            {/*
                             * The hint is a live region because the same button
                             * means two different things on consecutive clicks,
                             * and a sighted user learns that from the preview
                             * being drawn. Nothing else here announces it.
                             */}
                            <span className="DateRangePicker-hint" aria-live="polite">
                                {anchor === null ? text('PickStart') : text('PickEnd')}
                            </span>
                            <button
                                type="button"
                                className="DateRangePicker-action"
                                disabled={!editable || (start === null && end === null)}
                                onClick={(): void => {
                                    setAnchor(null);
                                    commit(null, null);
                                }}
                            >
                                {text('Clear')}
                            </button>
                            <button
                                type="button"
                                className="DateRangePicker-action is-primary"
                                onClick={(): void => {
                                    setAnchor(null);
                                    setOpen(false);
                                }}
                            >
                                {text('Done')}
                            </button>
                        </div>
                    </div>
                </PopoverSurface>
            </Popover>

            {platformError !== null && (
                <p className="DateRangePicker-message is-error" role="alert">
                    {platformError}
                </p>
            )}

            {problem !== null && (
                <p className="DateRangePicker-message is-error" role="alert">
                    {text(problem)}
                </p>
            )}

            {restricted && <p className="DateRangePicker-message">{text('PartialAccess')}</p>}

            {duration !== null && <p className="DateRangePicker-duration">{duration}</p>}
        </>,
    );
}

/**
 * Fluent's `CalendarLtr16Regular` path data, inlined rather than imported:
 * `@fluentui/react-icons` is not a platform library, so reaching one path
 * through it would put the whole icon set's module graph in front of the
 * bundler. The 16px cut, because the box is 16px — Fluent redraws each size
 * rather than scaling it, and a 20px glyph shown at 16 has strokes a fifth too
 * thin, which reads as "slightly wrong" without ever being identifiable.
 */
function CalendarIcon(): React.ReactElement {
    return (
        <svg
            className="DateRangePicker-icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M11.5 2A2.5 2.5 0 0 1 14 4.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 11.5v-7A2.5 2.5 0 0 1 4.5 2h7Zm1.5 4H3v5.5A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V6Zm-1.5-3h-7A1.5 1.5 0 0 0 3 4.5V5h10v-.5A1.5 1.5 0 0 0 11.5 3Z" />
        </svg>
    );
}
