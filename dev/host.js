/*
 * The platform, stood in for: everything this control reads off `context`.
 *
 * ---
 *
 * **Why this exists when `npm start` already hosts a field control.**
 *
 * `pcf-start` gives you a property panel and a real render. What it cannot do
 * is put a control with *two* bound columns into the states that only two
 * columns produce:
 *
 *   - **security per column** — a user can be denied one and allowed the
 *     other, so `startReadable` and `endReadable` are not one flag. No other
 *     control in this repository has had to think about that;
 *   - **the re-render that discards an edit** — the platform hands down a
 *     fresh `Date` object on every pass, so identity comparison always reports
 *     a change and an unguarded control re-adopts the platform's value over the
 *     edit that caused the callback;
 *   - **a range that breaks a rule** — shown to the user, never handed to the
 *     platform, so the columns cannot come to hold a backwards pair.
 *
 * ---
 *
 * **A stub must never be more capable than the thing it stands in for.**
 * `security` is `undefined` on a column with no FLS profile, which is the
 * common case and the one unguarded code breaks on. `errorMessage` is absent
 * unless `error` is set, because the platform sets no message when there is no
 * error. Dates are built from **local** components, never parsed from
 * `'2026-03-07'` — that form parses as UTC midnight and would make the fixture
 * itself carry the bug this control exists to avoid.
 */

(function (root, factory) {
    'use strict';

    var api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.__pcfHost = api;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var STRINGS = {
        DateRangePicker_Name: 'Date Range Picker',
        DateRangePicker_StartLabel: 'From',
        DateRangePicker_EndLabel: 'To',
        DateRangePicker_EndBeforeStart: 'The end date is before the start date.',
        DateRangePicker_SameDayNotAllowed: 'The range must cover more than one day.',
        DateRangePicker_BeforeMin: 'That is earlier than the earliest allowed date.',
        DateRangePicker_AfterMax: 'That is later than the latest allowed date.',
        DateRangePicker_Duration: '{0} days',
        DateRangePicker_DurationSameDay: '1 day, {0}',
        DateRangePicker_NoAccess: 'You do not have access to this value.',
        DateRangePicker_Placeholder: 'Select a date range',
        DateRangePicker_Restricted: 'Hidden',
        DateRangePicker_PartialAccess: 'One of these dates is hidden from you.',
        DateRangePicker_PreviousMonth: 'Previous month',
        DateRangePicker_NextMonth: 'Next month',
        DateRangePicker_QuickRanges: 'Quick ranges',
        DateRangePicker_PickStart: 'Pick a start date',
        DateRangePicker_PickEnd: 'Pick an end date',
        DateRangePicker_Clear: 'Clear',
        DateRangePicker_Done: 'Done',
        DateRangePicker_StartTimeLabel: 'Start time',
        DateRangePicker_EndTimeLabel: 'End time',
        DateRangePicker_DurationTimed: '{0}, {1} to {2}',
        DateRangePicker_ElapsedDays: '{0} days',
        DateRangePicker_ElapsedDay: '1 day',
        DateRangePicker_ElapsedHours: '{0} h',
        DateRangePicker_ElapsedMinutes: '{0} min',
    };

    /*
     * The organisation's date culture, as `userSettings.dateFormattingInfo`.
     *
     * Monday-first, because that is what a non-US Dataverse organisation hands
     * over and a Sunday-first fixture would let a rotation bug through. Both
     * arrays stay Sunday-first regardless: that is the platform's shape, and
     * rotating them is the control's job.
     */
    var DATE_FORMATTING = {
        firstDayOfWeek: 1,
        shortestDayNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
        dayNames: [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
        ],
        /*
         * Twenty-four hour, for the same reason the week is Monday-first: a
         * fixture in the developer's own culture lets a twelve-hour assumption
         * through. A real organisation was measured at `h:mm tt` with `AM`/`PM`;
         * the suite asks for that shape explicitly where it matters.
         */
        shortTimePattern: 'HH:mm',
        amDesignator: 'AM',
        pmDesignator: 'PM',
    };

    var SECURITY = {
        none: undefined,
        'read-only': { editable: false, readable: true, secured: true },
        'no-access': { editable: false, readable: false, secured: true },
    };

    /** Local components, deliberately. See the header. */
    function localDate(year, month, day) {
        return new Date(year, month - 1, day);
    }

    /** A wall clock, as local components. What a Date and Time fixture supplies. */
    function localDateTime(year, month, day, hours, minutes, seconds) {
        return new Date(year, month - 1, day, hours, minutes, seconds || 0);
    }

    /**
     * The platform's write, as measured on 12 September 2026 against a User
     * Local and a Time Zone Independent column on one record.
     *
     * **The platform never reads the instant a control hands it.** It reads
     * the Date's browser-local components and takes them as the wall clock:
     *
     *   UserLocal (1)             the wall clock is the *Dataverse user's*, so
     *                             it is converted out of the user's zone to
     *                             UTC and stored as that instant. Handed
     *                             `14:30:45Z` from a UTC-6 browser (local
     *                             08:30:45), the server held `13:30:45Z` —
     *                             08:30:45 in the user's UTC-5.
     *   TimeZoneIndependent (3)   the wall clock is stored as it is: the same
     *                             hand-over was held as `08:30:45Z`.
     *   DateOnly (2)              the day, at UTC midnight; the time is dropped.
     *   absent (canvas)           no column: the instant, unchanged.
     *
     * What comes back as `raw` is what the server holds, as a Date — measured
     * equal to the Web API value on both behaviours — so this one function is
     * both halves of the round trip. `userOffset` is in the platform's sign,
     * minutes *ahead* of UTC (`-300` for UTC-5).
     */
    function store(wall, behavior, format, userOffset) {
        if (wall === null || wall === undefined) {
            return null;
        }

        if (format !== 'datetime') {
            return behavior === 2 || behavior === 3
                ? new Date(Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate()))
                : new Date(wall.getFullYear(), wall.getMonth(), wall.getDate());
        }

        var asUTC = Date.UTC(
            wall.getFullYear(),
            wall.getMonth(),
            wall.getDate(),
            wall.getHours(),
            wall.getMinutes(),
            wall.getSeconds(),
        );

        if (behavior === 2) {
            return new Date(Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate()));
        }

        if (behavior === 3) {
            return new Date(asUTC);
        }

        if (behavior === 1) {
            return new Date(asUTC - userOffset(wall) * 60000);
        }

        return new Date(wall.getTime());
    }

    var DEFAULTS = {
        /** The bound columns. `null` is a cleared column. */
        start: localDate(2026, 3, 2),
        end: localDate(2026, 3, 6),
        /** The boundary inputs. */
        min: null,
        max: null,
        /*
         * Enums, so their `raw` is a string. v0.1.x had a TwoOptions pair here
         * whose `raw` was a boolean that could never mean "untouched", which
         * is why passing a value that is neither of the two below matters: it
         * is how the defensive read gets tested.
         */
        sameDay: 'allow',
        duration: 'show',
        /** The quick-range rail, as the maker's raw text. */
        presets: 'today,last7,thisMonth',
        /** Security, per column — they are independent. */
        startSecurity: 'none',
        endSecurity: 'none',
        /** The platform's own validation, per column. */
        startError: false,
        endError: false,
        errorMessage: 'A business rule rejected this date.',
        label: 'Booking period',
        visible: true,
        /** The form's read-only state. Not the columns' — see security. */
        disabled: false,
        rtl: false,
        /*
         * Null keeps the marked formatter, which is what the assertions read.
         * A BCP-47 tag switches to real localised dates for the harness page,
         * where the point is what a user would see rather than which code path
         * produced it.
         */
        /*
         * An array the three formatters push each argument into, or null.
         *
         * The platform's formatters render in the *Dataverse user's* timezone
         * rather than the browser's, which is a difference this fixture cannot
         * reproduce — nothing here has two timezones. What it can do is show
         * what the control handed over, which is the half the control controls:
         * a value at midday cannot be pushed across a day boundary by twelve
         * hours of disagreement, and one at midnight can.
         */
        /*
         * The bound columns' DateTimeFieldBehavior, or undefined for canvas.
         * Defaults to UserLocal because that is what a column nobody thought
         * about is, and it is the shape the control saw for its first four
         * releases.
         */
        behavior: 1,
        /*
         * The columns' `Format` — `'date'` or `'datetime'`, lower-case, as the
         * platform spells it — and per column, because the maker portal can
         * pair one of each. `format` sets both; `startFormat`/`endFormat`
         * override one.
         */
        format: 'date',
        startFormat: undefined,
        endFormat: undefined,
        /** The `time` Enum: auto follows the column, show and hide override. */
        time: 'auto',
        /*
         * The Dataverse user's offset from UTC in minutes, in the platform's
         * sign — *ahead* of UTC, so `-300` is UTC-5 — for any date. `null` is a
         * user whose zone is the browser's, which hides every conversion bug
         * and is therefore not what the timed assertions use.
         *
         * The no-argument `getTimeZoneOffsetMinutes()` answers the *standard*
         * offset, not today's: measured `-360` on a day the dated call answered
         * `-300`. The fixture models it as an hour behind, so a control that
         * forgets the argument reads every UserLocal time an hour off.
         */
        userOffset: null,
        formatCalls: null,
        formatLocale: null,
        /*
         * Withheld by passing `null`, which is what a host publishing no date
         * culture looks like — canvas, and `npm start`. The control has a
         * fallback for exactly that, and a fixture that always supplied this
         * would never reach it.
         */
        dateFormatting: DATE_FORMATTING,
    };

    /*
     * A bound date column.
     *
     * `behavior` is the column's `DateTimeFieldBehavior`: 1 UserLocal,
     * 2 DateOnly, 3 TimeZoneIndependent, undefined for canvas (no column at
     * all). It decides the *shape of the value the platform hands over*, which
     * is the part no documentation states and which cost four releases to find:
     *
     *   UserLocal (1)  a real instant — local midnight for a day
     *   DateOnly  (2)  the day itself — **UTC** midnight, whatever the browser
     *
     * So this fixture builds the value from `day` rather than taking a Date
     * directly, because handing over a Date would let the caller choose a shape
     * the platform never produces — and a stub that can produce a shape the
     * platform cannot is worse than no stub.
     */
    function property(value, security, error, message, behavior, format, userOffset) {
        return {
            // The fixture supplies a wall clock; the platform holds whatever
            // its write would have made of it. See `store`.
            raw: store(value, behavior, format, userOffset),
            security: SECURITY[security],
            error: error,
            // The platform sets no message when there is no error.
            errorMessage: error ? message : undefined,
            type: format === 'datetime' ? 'DateAndTime.DateAndTime' : 'DateAndTime.DateOnly',
            // Absent entirely on canvas, which is a state the control has to
            // survive — not `{ Behavior: undefined }`. On a form the node
            // carries fourteen keys; these are the two the control reads.
            attributes: behavior === undefined ? undefined : { Behavior: behavior, Format: format },
        };
    }

    /**
     * The platform's own formatters, standing in as the browser's.
     *
     * A real `formatDateShort` follows the user's Dataverse settings, which the
     * browser's locale is only an approximation of — but it is a much better
     * approximation than a marker string when the question is "does this look
     * right in Japanese".
     */
    function plainFormatting(locale) {
        // Numeric parts rather than `dateStyle: 'short'`, which abbreviates the
        // year in en-US and would show a date no Dataverse form ever renders.
        var short = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
        var long = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
        var yearMonth = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });

        return {
            formatDateShort: function (value) {
                return short.format(value);
            },
            formatDateLong: function (value) {
                return long.format(value);
            },
            formatDateYearMonth: function (value) {
                return yearMonth.format(value);
            },
        };
    }

    function createContext(options) {
        var o = Object.assign({}, DEFAULTS, options || {});

        var getString =
            o.getString
            || function (key) {
                return STRINGS[key] !== undefined ? STRINGS[key] : key;
            };

        /*
         * The user's offset for a date, and the standard offset for none. A
         * `null` userOffset is the browser's own zone, read the platform's way
         * round; a number is the user's for every date, with the standard
         * offset an hour behind it.
         */
        var userOffset = function (date) {
            return o.userOffset === null ? -date.getTimezoneOffset() : o.userOffset;
        };

        var standardOffset = o.userOffset === null
            ? -new Date(2026, 0, 15).getTimezoneOffset()
            : o.userOffset - 60;

        var startFormat = o.startFormat || o.format;
        var endFormat = o.endFormat || o.format;

        return {
            parameters: {
                startDate: property(o.start, o.startSecurity, o.startError, o.errorMessage, o.behavior, startFormat, userOffset),
                endDate: property(o.end, o.endSecurity, o.endError, o.errorMessage, o.behavior, endFormat, userOffset),
                minDate: { raw: o.min, type: 'DateAndTime.DateOnly' },
                maxDate: { raw: o.max, type: 'DateAndTime.DateOnly' },
                sameDay: { raw: o.sameDay, type: 'Enum' },
                duration: { raw: o.duration, type: 'Enum' },
                time: { raw: o.time, type: 'Enum' },
                presets: { raw: o.presets, type: 'SingleLine.Text' },
            },

            mode: {
                isVisible: o.visible,
                isControlDisabled: o.disabled,
                label: o.label,
            },

            resources: { getString: getString },

            /*
             * Marked rather than plausible: a real `formatDateShort` returns
             * something like "02/03/2026", which is indistinguishable in a test
             * from the same string built by hand with `Intl`. "fmt:2026-03-02"
             * can only have come through `context.formatting`, which is what
             * makes the control agree with the rest of the form rather than
             * merely look right.
             *
             * Built from local components for the reason in the header.
             */
            formatting: o.formatLocale ? plainFormatting(o.formatLocale) : {
                formatDateShort: function (value) {
                    if (o.formatCalls) {
                        o.formatCalls.push({ fn: 'formatDateShort', value: value });
                    }

                    return (
                        'fmt:'
                        + value.getFullYear()
                        + '-'
                        + String(value.getMonth() + 1).padStart(2, '0')
                        + '-'
                        + String(value.getDate()).padStart(2, '0')
                    );
                },

                formatDateLong: function (value) {
                    if (o.formatCalls) {
                        o.formatCalls.push({ fn: 'formatDateLong', value: value });
                    }

                    return (
                        'long:'
                        + value.getFullYear()
                        + '-'
                        + String(value.getMonth() + 1).padStart(2, '0')
                        + '-'
                        + String(value.getDate()).padStart(2, '0')
                    );
                },

                formatDateYearMonth: function (value) {
                    if (o.formatCalls) {
                        o.formatCalls.push({ fn: 'formatDateYearMonth', value: value });
                    }

                    return (
                        'ym:'
                        + value.getFullYear()
                        + '-'
                        + String(value.getMonth() + 1).padStart(2, '0')
                    );
                },
            },

            userSettings: {
                isRTL: o.rtl,
                languageId: 1033,
                dateFormattingInfo: o.dateFormatting === null ? undefined : o.dateFormatting,
                timeZoneUtcOffsetMinutes: standardOffset,
                getTimeZoneOffsetMinutes: function (date) {
                    return date === undefined ? standardOffset : userOffset(date);
                },
            },
        };
    }

    function captureRegistration(global) {
        var box = { name: null, ctor: null };

        global.ComponentFramework = global.ComponentFramework || {};
        global.ComponentFramework.registerControl = function (fullName, ctor) {
            box.name = fullName;
            box.ctor = ctor;
        };

        return box;
    }

    return {
        STRINGS: STRINGS,
        SECURITY: SECURITY,
        DEFAULTS: DEFAULTS,
        DATE_FORMATTING: DATE_FORMATTING,
        localDate: localDate,
        localDateTime: localDateTime,
        store: store,
        createContext: createContext,
        captureRegistration: captureRegistration,
    };
});
