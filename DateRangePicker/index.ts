import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { DateRangePickerControl, IProps } from './components/DateRangePickerControl';
import { formatTimeOfDay, parsePresets, toCalendarLocale } from './calendar';
import {
    ColumnShape,
    OffsetFor,
    atMidday,
    fromPlatform,
    isSameDay,
    isSameSecond,
    toPlatform,
    validateRange,
} from './range';

/**
 * A virtual (React) field control over **two** bound columns.
 *
 * The difference from the standard control is the whole point: `updateView`
 * *returns* an element instead of writing into a container, so the platform
 * owns reconciliation and React never enters the bundle — it is declared as a
 * `<platform-library>` and resolved at runtime by the host.
 *
 * Two bound properties is the exception to the usual one-per-control rule, and
 * the manifest explains why: a date range genuinely is two columns, so the
 * second column picker a maker sees is the right question rather than a
 * symptom.
 */
export class DateRangePicker implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;

    /** The last values handed *back to the platform*, not the ones on screen. */
    private startDate: Date | null = null;
    private endDate: Date | null = null;

    /**
     * The last values the *platform* supplied. `undefined` means nothing has
     * arrived yet, which is why it is not `null` — null is a real value.
     *
     * Without this guard, `updateView` running after our own
     * `notifyOutputChanged` re-adopts the platform's value and discards the
     * edit that caused it. On a canvas app whose property is bound to a
     * constant that is every edit, and the control reads as frozen.
     */
    private lastIncomingStart: Date | null | undefined = undefined;
    private lastIncomingEnd: Date | null | undefined = undefined;

    /**
     * Each column's shape — its `Behavior`, and whether it carries a time —
     * kept because `getOutputs` needs both and is handed no context. Read
     * fresh on every `updateView`, so a column whose metadata arrives late is
     * picked up rather than frozen at whatever the first pass saw.
     */
    private startShape: ColumnShape = { behavior: undefined, hasTime: false };
    private endShape: ColumnShape = { behavior: undefined, hasTime: false };

    public init(
        _context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        // No container: a virtual control never receives one.
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const start = context.parameters.startDate;
        const end = context.parameters.endDate;

        /*
         * Guarded, not assigned unconditionally — see lastIncoming* above, and
         * compared by time value, because every pass hands down a fresh Date
         * object and `!==` on the objects is always true.
         *
         * Each column carries its own `Behavior`, and the day is read out of a
         * different half of the `Date` depending on it — see `dayFromPlatform`.
         * Read per column rather than once: they *should* match, and
         * docs/limitations.md asks for that, but a form where they do not is a
         * form this should still get right.
         */
        /*
         * Whether each column carries a time, decided per column — the two are
         * separate columns and the maker portal may well pair a Date Only start
         * with a Date and Time end.
         *
         * On a form the column says: `attributes.Format` is `'date'` or
         * `'datetime'`, lower-case, measured on both kinds. On canvas there is
         * no column and no `attributes`, so the `time` input decides, and its
         * default of `auto` means "whatever the column says, and nothing when
         * nothing does" — a canvas maker who wants times says so. `show` and
         * `hide` override the column either way.
         */
        const timeMode = String(context.parameters.time.raw ?? 'auto');

        const hasTime = (property: ComponentFramework.PropertyTypes.DateTimeProperty): boolean => {
            if (timeMode === 'show') {
                return true;
            }

            if (timeMode === 'hide') {
                return false;
            }

            return String(property.attributes?.Format ?? '').toLowerCase() === 'datetime';
        };

        this.startShape = { behavior: start.attributes?.Behavior, hasTime: hasTime(start) };
        this.endShape = { behavior: end.attributes?.Behavior, hasTime: hasTime(end) };

        /*
         * The Dataverse user's offset, for a UserLocal column carrying a time.
         * Typed as taking an optional date; the date is not optional here,
         * because the no-argument call answers the *standard* offset — measured
         * `-360` on a day the dated call answered `-300`. Absent on canvas.
         */
        const offsetFor: OffsetFor = (date: Date): number | null => {
            const settings = context.userSettings as { getTimeZoneOffsetMinutes?: (d: Date) => number };

            return typeof settings.getTimeZoneOffsetMinutes === 'function'
                ? settings.getTimeZoneOffsetMinutes(date)
                : null;
        };

        const incomingStart = fromPlatform(start.raw ?? null, this.startShape, offsetFor);
        const incomingEnd = fromPlatform(end.raw ?? null, this.endShape, offsetFor);

        if (!sameInstant(incomingStart, this.lastIncomingStart)) {
            this.lastIncomingStart = incomingStart;
            this.startDate = incomingStart;
        }

        if (!sameInstant(incomingEnd, this.lastIncomingEnd)) {
            this.lastIncomingEnd = incomingEnd;
            this.endDate = incomingEnd;
        }

        // Each column carries its own security. A user can be denied one and
        // not the other, so these are not a single flag — no control in this
        // repository has had two before.
        const startReadable = start.security === undefined || start.security.readable;
        const endReadable = end.security === undefined || end.security.readable;

        const editable = (property: ComponentFramework.PropertyTypes.DateTimeProperty): boolean =>
            !context.mode.isControlDisabled
            && (property.security === undefined || property.security.editable);

        /*
         * The Enum reads, defensively.
         *
         * The generated type is a string union, which is a compile-time claim
         * about a runtime the compiler does not control — a canvas formula can
         * put anything in an Enum property. Comparing against the value that
         * is *not* the default means an unexpected string lands on the default
         * rather than on the rarer branch.
         *
         * These replace the v0.1.x TwoOptions pair. `TwoOptionsProperty.raw` is
         * a plain boolean, so there was no value meaning "the maker never
         * touched this" and `default-value="true"` did not create one: the
         * shipped control blocked same-day ranges and hid the duration by
         * default, which is the opposite of what its own descriptions promised.
         */
        const rules = {
            allowSameDay: String(context.parameters.sameDay.raw ?? 'allow') !== 'block',
            min: context.parameters.minDate.raw ?? null,
            max: context.parameters.maxDate.raw ?? null,
            byInstant: this.startShape.hasTime && this.endShape.hasTime,
        };

        const locale = toCalendarLocale(context.userSettings.dateFormattingInfo);

        const props: IProps = {
            startDate: this.startDate,
            endDate: this.endDate,
            startHasTime: this.startShape.hasTime,
            endHasTime: this.endShape.hasTime,
            rules,
            visible: context.mode.isVisible,
            startReadable,
            endReadable,
            startEditable: editable(start),
            endEditable: editable(end),
            // The platform's own validation, kept separate from the control's
            // range check: they are different failures and one must not
            // overwrite the other.
            startError: start.error ? start.errorMessage : null,
            endError: end.error ? end.errorMessage : null,
            label: context.mode.label,
            isRTL: context.userSettings.isRTL,
            showDuration: String(context.parameters.duration.raw ?? 'show') !== 'hide',
            presets: parsePresets(context.parameters.presets.raw),
            /*
             * Month names, day names and the first day of the week come from the
             * host rather than from `Intl`, for the same reason the formatters
             * below do: the organisation's culture is the platform's answer to
             * give, and a control that asks the browser instead disagrees with
             * every other date on the form. Absent on a host that publishes
             * none, which is what the fallback inside is for.
             */
            locale,
            /*
             * "Today" is resolved once per render and handed down, so the
             * calendar's highlight and every preset agree with each other — and
             * so the smoke suite can say when now is.
             */
            today: new Date(),
            // Typed as of @types/powerapps-component-framework 1.3.18, so no
            // cast is needed — but absent in PCFHub's demo harness, which is
            // why the component falls back to Fluent's own light theme.
            theme: context.fluentDesignLanguage?.tokenTheme,
            // Only `true` counts. A host that published no theme has not said
            // "light", and answering for it is the same mistake as reading the
            // operating system's setting.
            isDark: context.fluentDesignLanguage?.isDarkTheme === true,
            resources: context.resources,
            /*
             * Every one of these formats `atMidday(date)` rather than the date
             * it was handed, and the reason is that **the platform's formatters
             * do not render in the browser's timezone.** They render in the
             * *Dataverse user's*, which is a separate setting and routinely
             * differs from the machine's.
             *
             * A day therefore arrives here as local midnight — which is what the
             * platform correctly hands back for a Date Only column — and comes
             * out of `formatDateShort` as the day before, for any user whose
             * Dataverse timezone is west of their browser's. Reported from a
             * real form: the columns held 6 Sep and 31 Oct, confirmed against
             * `getAttribute().getValue()`, and the field rendered
             * "9/5/2026 – 10/30/2026".
             *
             * Midday is the same trick `atMidday` plays on the write side, for
             * the same reason: a value in the middle of the day cannot be
             * pushed across a boundary by twelve hours of disagreement. It
             * costs nothing where the two timezones agree, because midday
             * formats to the same day midnight would have.
             *
             * `formatMonth` is the one that would have been hardest to spot.
             * It is handed the *first* of the month at local midnight, so a
             * westward user got the previous month's name over the grid —
             * "August" above September's days.
             */
            formatDate: (date: Date): string =>
                context.formatting.formatDateShort(atMidday(date)),
            // A day cell shows "14" and must announce "Saturday, 14 March 2026".
            formatDayLabel: (date: Date): string =>
                context.formatting.formatDateLong(atMidday(date)),
            formatMonth: (date: Date): string =>
                context.formatting.formatDateYearMonth(atMidday(date)),
            /*
             * Not `context.formatting`, deliberately. Measured on a real form,
             * its time formatters disagree on whose clock to use and every one
             * of them prints the date too — see `formatTimeOfDay`. The value
             * here is already the wall clock, so only the pattern is needed.
             */
            formatTime: (date: Date): string => formatTimeOfDay(date, locale),
            onChange: (nextStart: Date | null, nextEnd: Date | null): void => {
                // A range that breaks a rule is shown but never handed over, so
                // the columns cannot hold a backwards pair. The component keeps
                // rendering what the user typed and says why it is not saved.
                if (validateRange(nextStart, nextEnd, rules) !== null) {
                    return;
                }

                // By day for a whole day, by the second for a moment. What the
                // platform hands back for a day may sit at any time on the
                // right day — its own midnight, or the midday this writes — and
                // re-notifying over a difference the control does not care
                // about would dirty the form for nothing.
                if (
                    sameValue(nextStart, this.startDate, this.startShape.hasTime)
                    && sameValue(nextEnd, this.endDate, this.endShape.hasTime)
                ) {
                    return;
                }

                // Held as a wall-clock Date — local midnight for a whole day.
                // The shape the platform wants is `getOutputs`' business,
                // because only it knows the column's Behavior.
                this.startDate = nextStart;
                this.endDate = nextEnd;
                this.notifyOutputChanged();
            },
        };

        return React.createElement(DateRangePickerControl, props);
    }

    public getOutputs(): IOutputs {
        // Both bound properties, every time.
        //
        // `null` clears a column; `undefined` means "no change". The generated
        // IOutputs types these as `Date | undefined`, so `?? undefined`
        // type-checks and quietly turns every clear into a no-op — canvas
        // honours that strictly and the field simply will not empty. The cast
        // is the fix, not a workaround.
        // Converted here rather than on the way in, so everything between the
        // two boundaries works in wall-clock Dates. See `toPlatform`.
        const startValue = toPlatform(this.startDate, this.startShape);
        const endValue = toPlatform(this.endDate, this.endShape);

        return {
            startDate: startValue === null ? (null as unknown as undefined) : startValue,
            endDate: endValue === null ? (null as unknown as undefined) : endValue,
        };
    }

    public destroy(): void {
        // Usually empty for a virtual control: React unmounts its own tree, and
        // anything added outside it in `init` would be released here.
    }
}

/**
 * `updateView` hands down a fresh `Date` on every pass, so identity comparison
 * always reports a change. Compare the instant instead.
 */
function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
    if (a === null || a === undefined || b === null || b === undefined) {
        return a === b;
    }

    return a.getTime() === b.getTime();
}

/**
 * Whether two values mean the same value, `null` included — the same calendar
 * day for a whole-day column, the same second for one carrying a time.
 *
 * Used where `sameInstant` would be too strict: deciding whether an edit is
 * worth handing to the platform. For a whole day, two values on the same day
 * are the same value however far apart their clocks are — and they will be,
 * since what goes out is anchored at midday and what comes back is whatever
 * the column stored. For a moment the clock *is* the value, to the second,
 * which is as fine as the column keeps it.
 */
function sameValue(a: Date | null, b: Date | null, hasTime: boolean): boolean {
    if (a === null || b === null) {
        return a === b;
    }

    return hasTime ? isSameSecond(a, b) : isSameDay(a, b);
}
