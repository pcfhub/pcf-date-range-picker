/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * A **virtual** control returns the element it wants rendered rather than
 * writing into a container, so most of these assertions read the props it
 * passed down. That is the better test of the two: the props are the control's
 * decisions, where the DOM is one rendering of them.
 *
 * The calendar is the exception, and it is why `renderDeep` exists. A month
 * grid is the control's own work rather than a value it hands on, so there are
 * no props to read — and `updateView` only *builds* an element, so a
 * props-only suite cannot even see a crash inside the component. Those
 * assertions render to a static string with `react-dom/server` and read the
 * markup.
 *
 * Why it exists alongside `npm start`: this control has two bound columns, and
 * the states worth checking are the ones only two produce — one column secured
 * and the other not, one column's business rule failing, a range the control
 * shows but refuses to save. None of those can be reached from a property
 * panel.
 *
 * **Dates here are built from local components, never parsed from
 * `'2026-03-07'`.** That form parses as UTC midnight, so a fixture written the
 * obvious way carries the exact bug this control exists to avoid, and the suite
 * would agree with a broken control west of UTC. See `range.ts`.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that a real form hands down what these fixtures hand
 * down, that the calendar renders, or that a save persists anything. Keep those
 * in SPEC.md under "Not verified".
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'DateRangePicker', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/DateRangePicker. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, under the names the bundle actually asks for — read
 * out of the bundle rather than written down here. `pcf-scripts` maps a
 * declared version onto the platform build it supports, so the global carries a
 * version that is not the one the manifest declares, and hardcoding it is a
 * trap that springs on the next bump.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

if (reactGlobals.length > 0) {
    const React = require(path.join(root, 'node_modules', 'react'));

    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

const fluent = new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

const marked = (key) => `resx:${key}`;
const day = host.localDate;

const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const context = host.createContext({ ...options, getString: marked });
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(context, () => {
        notifications += 1;
    });

    let element = instance.updateView(context);

    const handle = {
        instance,
        get element() {
            return element;
        },
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => {
            element = instance.updateView(host.createContext({ ...options, ...next, getString: marked }));

            return element;
        },
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
    };

    live.push(handle);

    return handle;
}

/**
 * Render what the control returned, executing the component bodies.
 *
 * **`updateView` only *builds* an element.** Nothing inside
 * `DateRangePickerControl` runs until something renders it, so a props-only
 * assertion cannot see a crash in the month grid — and since v0.2.0 the month
 * grid is where most of the new code lives. `react-dom/server` needs no DOM and
 * no browser.
 *
 * Two things to know about what comes back. Fluent is stubbed, so its
 * components render as their own names and the markup around them is
 * meaningless — only this control's own elements are worth asserting on. And
 * the stubbed `PopoverSurface` renders its children unconditionally where the
 * real one renders nothing until the popover opens, which is what puts the
 * calendar in this string at all. That is a property of the stub, not a claim
 * that a closed popover renders a calendar.
 */
function renderDeep(element) {
    const server = require(path.join(root, 'node_modules', 'react-dom', 'server'));

    // React's development warnings about unknown element types would bury the
    // report; the assertions are about markup, not about tag names.
    const warn = console.error;

    console.error = () => {};

    try {
        return server.renderToStaticMarkup(element);
    } finally {
        console.error = warn;
    }
}

/** How many times a pattern appears in a markup string. */
function count(markup, pattern) {
    return (markup.match(pattern) || []).length;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ------------------------------------------------------- what it hands down */

const plain = mount({});

check('returns an element rather than writing into a container', plain.element !== undefined && plain.element !== null);

check(
    'hands down both columns the platform supplied',
    plain.props().startDate.getTime() === day(2026, 3, 2).getTime()
        && plain.props().endDate.getTime() === day(2026, 3, 6).getTime(),
);

check("passes down the form's own label", plain.props().label === 'Booking period', plain.props().label);

/*
 * Formatting goes through `context.formatting`, not through `Intl`. It follows
 * the user's Dataverse settings rather than the browser's, so the control
 * agrees with the rest of the form instead of merely looking plausible — and
 * the `fmt:` marker is the only way to tell the two apart from here.
 */
check(
    "dates are formatted by the platform, not by the control",
    plain.props().formatDate(day(2026, 3, 2)) === 'fmt:2026-03-02',
    plain.props().formatDate(day(2026, 3, 2)),
);

/* ---------------------------------------------------- two columns, not one */

/*
 * **Each column carries its own security.** A user can be denied one and
 * allowed the other, so these cannot collapse into a single flag — and a
 * control that used one would either mask a column the user may read or, worse,
 * show one they may not.
 */
const halfDenied = mount({ startSecurity: 'no-access', start: null });

check(
    'a column the user cannot read is marked unreadable',
    halfDenied.props().startReadable === false,
    String(halfDenied.props().startReadable),
);

check(
    'and the other column is untouched by it',
    halfDenied.props().endReadable === true,
    String(halfDenied.props().endReadable),
);

/*
 * Two independent reasons to be read-only, and per column: the form's
 * `isControlDisabled` and each column's `security.editable`.
 */
const halfLocked = mount({ endSecurity: 'read-only' });

check(
    'a read-only column locks only itself on an editable form',
    halfLocked.props().startEditable === true && halfLocked.props().endEditable === false,
    `start: ${halfLocked.props().startEditable}, end: ${halfLocked.props().endEditable}`,
);

check(
    'and a read-only form locks both',
    mount({ disabled: true }).props().startEditable === false
        && mount({ disabled: true }).props().endEditable === false,
);

/*
 * The platform's validation is per column too, and it is kept apart from the
 * control's own range check — they are different failures, and one overwriting
 * the other loses whichever the user needed to read.
 */
const ruled = mount({ endError: true });

check(
    "a business rule on one column reaches that column's error",
    ruled.props().endError === host.DEFAULTS.errorMessage && ruled.props().startError === null,
    `start: ${JSON.stringify(ruled.props().startError)}, end: ${JSON.stringify(ruled.props().endError)}`,
);

check('and there is none to show when the platform reported none', plain.props().startError === null && plain.props().endError === null);

/* --------------------------------------------------- the edit that survives */

/*
 * **The re-render that discards an edit.**
 *
 * The platform hands down a fresh `Date` object on every pass, so `!==` on the
 * objects is always true and an unguarded control re-adopts the platform's
 * value over the edit that caused the callback. On a canvas app whose property
 * is bound to a constant that is *every* edit, and the control reads as frozen.
 *
 * So: change the range, then let the platform re-render with the values it
 * still holds, and the edit must survive.
 */
const edited = mount({});

edited.props().onChange(day(2026, 4, 1), day(2026, 4, 10));

check('an edit notifies the platform exactly once', edited.notifications() === 1, String(edited.notifications()));

edited.update({});

check(
    'and survives a re-render carrying the platform’s older values',
    edited.props().startDate.getTime() === day(2026, 4, 1).getTime()
        && edited.props().endDate.getTime() === day(2026, 4, 10).getTime(),
    `${edited.props().startDate.toDateString()} → ${edited.props().endDate.toDateString()}`,
);

/*
 * The other half of the same guard: a genuinely new value from the platform
 * must still be adopted, or the control ignores the record changing underneath
 * it.
 */
const refreshed = mount({});

refreshed.update({ start: day(2026, 5, 5), end: day(2026, 5, 9) });

check(
    'a new value from the platform is adopted',
    refreshed.props().startDate.getTime() === day(2026, 5, 5).getTime(),
    refreshed.props().startDate.toDateString(),
);

/*
 * An unchanged value must not count as a change either — the comparison is by
 * instant, not by object identity.
 */
const unchanged = mount({});

unchanged.props().onChange(day(2026, 3, 2), day(2026, 3, 6));

check(
    'handing back the values it already had does not notify',
    unchanged.notifications() === 0,
    String(unchanged.notifications()),
);

/* ------------------------------------------------------------ the rules */

/*
 * **A range that breaks a rule is shown but never handed over**, so the columns
 * cannot come to hold a backwards pair. The component keeps rendering what the
 * user typed and says why it is not saved — refusing to notify is what keeps
 * those two facts from disagreeing.
 */
const backwards = mount({});

backwards.props().onChange(day(2026, 3, 10), day(2026, 3, 1));

check(
    'a backwards range is not handed to the platform',
    backwards.notifications() === 0,
    String(backwards.notifications()),
);

const sameDay = mount({ sameDay: 'block' });

sameDay.props().onChange(day(2026, 3, 4), day(2026, 3, 4));

check('nor is a same-day range when the maker disallowed it', sameDay.notifications() === 0);

const sameDayOk = mount({ sameDay: 'allow' });

sameDayOk.props().onChange(day(2026, 3, 4), day(2026, 3, 4));

check('and it is when they allow it', sameDayOk.notifications() === 1, String(sameDayOk.notifications()));

const tooEarly = mount({ min: day(2026, 3, 1) });

tooEarly.props().onChange(day(2026, 2, 20), day(2026, 3, 5));

check('a start before minDate is refused', tooEarly.notifications() === 0);

const tooLate = mount({ max: day(2026, 3, 31) });

tooLate.props().onChange(day(2026, 3, 5), day(2026, 4, 10));

check('an end after maxDate is refused', tooLate.notifications() === 0);

check(
    'and the boundaries reach the component so it can say why',
    mount({ min: day(2026, 3, 1), max: day(2026, 3, 31) }).props().rules.min.getTime() === day(2026, 3, 1).getTime(),
);

/* ------------------------------------------------------------ clearing */

/*
 * **`null` is not `undefined`, and this control gets it right on purpose.**
 *
 * The generated `IOutputs` types both columns as `Date | undefined`, so
 * `?? undefined` type-checks cleanly and quietly turns every clear into a
 * no-op: the platform reads an absent output as "no change" and the column
 * never empties. Canvas honours that strictly; a model-driven form is more
 * forgiving, which is how the bug reaches production having been "tested".
 * `pcf-star-rating` shipped it, and `pcf-choices-picker` was found to have it
 * by a suite exactly like this one.
 */
const cleared = mount({});

cleared.props().onChange(null, null);

check(
    'clearing both columns produces outputs the platform can act on, not "no change"',
    cleared.outputs().startDate === null && cleared.outputs().endDate === null,
    `getOutputs() returned ${JSON.stringify(cleared.outputs())}`,
);

check(
    'and getOutputs always carries both columns, never just the one that moved',
    Object.prototype.hasOwnProperty.call(plain.outputs(), 'startDate')
        && Object.prototype.hasOwnProperty.call(plain.outputs(), 'endDate'),
    Object.keys(plain.outputs()).join(', '),
);

/* ------------------------------------------------------------- the rest */

check('hidden is passed down rather than ignored', mount({ visible: false }).props().visible === false);

check('right-to-left comes from the user, not from a guess', mount({ rtl: true }).props().isRTL === true);

check('the duration can be switched off', mount({ duration: 'hide' }).props().showDuration === false);

/* ------------------------------------------------------ the calendar grid */

/*
 * From here the assertions read *markup* rather than props, because the grid is
 * the control's own work and props say nothing about it. What they can reach is
 * the shape and the per-day decisions; what they cannot reach is a click, an
 * arrow key, an effect or focus — `renderToStaticMarkup` has no DOM and no
 * reconciler. Those belong in SPEC.md under "Not verified", and saying so is
 * part of reporting a green run.
 */
const markup = renderDeep(plain.element);

check(
    'two months are rendered, not one',
    count(markup, /role="grid"/g) === 2,
    `${count(markup, /role="grid"/g)} grids`,
);

/*
 * **Six rows per month, always.** A grid that grows a row for a long month
 * starting late in the week makes the popover jump by a row's height as the
 * user pages, and the button under the pointer moves out from under it. Seven
 * column headers plus six weeks of cells, twice.
 */
check(
    'each month is six rows deep regardless of how the month falls',
    count(markup, /role="row"/g) === 14 && count(markup, /role="gridcell"/g) === 84,
    `${count(markup, /role="row"/g)} rows, ${count(markup, /role="gridcell"/g)} cells`,
);

/*
 * February 2026 has 28 days and starts on a Sunday, so under a Sunday-first
 * culture it fills exactly four weeks — the month most likely to render short
 * where every other month renders six rows.
 */
check(
    'including February, which fits in four weeks and must still be six',
    count(
        renderDeep(
            mount({ start: day(2026, 2, 1), end: day(2026, 2, 28), dateFormatting: null }).element,
        ),
        /role="row"/g,
    ) === 14,
);

check(
    'the range is painted across the days between its ends',
    markup.includes('data-day="2026-03-02" data-position="start"')
        && markup.includes('data-day="2026-03-04" data-position="between"')
        && markup.includes('data-day="2026-03-06" data-position="end"'),
);

check(
    'and a day outside it is painted as nothing',
    markup.includes('data-day="2026-03-07" data-position="none"'),
);

/*
 * A one-day range is `single`, not `start` and `end` fighting over the same
 * corner radii.
 */
check(
    'a single-day range is one shape rather than two',
    renderDeep(mount({ start: day(2026, 3, 4), end: day(2026, 3, 4) }).element).includes(
        'data-day="2026-03-04" data-position="single"',
    ),
);

/*
 * A pair the platform hands down backwards still paints, because the grid
 * normalises the ends. That normalisation is what the click-order swap rests
 * on; the swap itself needs a click and is not reachable from here.
 */
const reversed = renderDeep(mount({ start: day(2026, 3, 10), end: day(2026, 3, 1) }).element);

check(
    'a backwards pair is still painted between its ends rather than dropped',
    reversed.includes('data-day="2026-03-05" data-position="between"'),
);

/*
 * Bounds reach the day buttons, so a day outside them cannot be clicked at all
 * rather than being clicked and then silently refused.
 */
const bounded = renderDeep(
    mount({ min: day(2026, 3, 5), max: day(2026, 3, 20), start: null, end: null }).element,
);

check(
    'days outside the bounds are disabled rather than merely refused',
    /data-day="2026-03-04"[^>]*disabled/.test(bounded)
        && /data-day="2026-03-21"[^>]*disabled/.test(bounded)
        && !/data-day="2026-03-10"[^>]*disabled/.test(bounded),
);

/*
 * Day names come from the platform's `formatDateLong`, for the same reason the
 * trigger's dates come from `formatDateShort`: a cell showing "14" has to
 * announce the whole date, and the organisation's culture is the platform's
 * answer to give rather than the browser's.
 */
check(
    'a day cell announces the whole date, formatted by the platform',
    markup.includes('aria-label="long:2026-03-02"'),
);

check('and the month heading comes from the platform too', markup.includes('ym:2026-03'));

/*
 * **The grid is one tab stop, and a date is drawn twice.**
 *
 * The trailing days of the left month are the leading days of the right one,
 * so fourteen dates have two buttons in this popover. A roving tabindex keyed
 * on the date alone put `0` on both — two tab stops for a grid meant to be
 * one, and a ref map in which focusing a date reached whichever month rendered
 * last. Found by reading the DOM in `npm start`; catchable here, which is why
 * it is now.
 */
check(
    'exactly one day carries the tab stop, across both months',
    count(markup, /tabindex="0"/g) === 1,
    `${count(markup, /tabindex="0"/g)} tabbable days`,
);

check(
    'even though the two grids draw some of the same dates twice over',
    (() => {
        const days = markup.match(/data-day="(\d{4}-\d{2}-\d{2})"/g) || [];
        const twice = days.filter((day, at) => days.indexOf(day) !== at);

        // The exact count depends on where the two months fall, so this
        // asserts the overlap exists rather than a number that would be right
        // for March and wrong for April.
        return twice.length > 0 && days.length === 84;
    })(),
);

/* -------------------------------------------------- the first day of week */

/*
 * The platform hands over Sunday-first arrays plus the culture's own first day,
 * and rotating them is the control's job. A German or French organisation
 * starts on Monday; a fixture that only ever supplied Sunday would let that bug
 * through.
 */
check(
    'the week starts where the organisation says it does',
    markup.indexOf('aria-label="Monday"') < markup.indexOf('aria-label="Sunday"'),
);

/*
 * And a host that publishes no date culture at all — canvas, `npm start` — must
 * still render a calendar rather than seven headers reading "undefined".
 */
const noCulture = renderDeep(mount({ dateFormatting: null }).element);

check(
    'a host that publishes no date culture still gets a calendar',
    noCulture.indexOf('aria-label="Sunday"') < noCulture.indexOf('aria-label="Monday"')
        && !noCulture.includes('undefined'),
);

/* ------------------------------------------------------- the quick ranges */

check(
    'the quick ranges the maker asked for are the ones offered',
    count(markup, /data-preset="/g) === 3
        && markup.includes('data-preset="today"')
        && markup.includes('data-preset="last7"')
        && markup.includes('data-preset="thisMonth"'),
    `${count(markup, /data-preset="/g)} presets`,
);

/*
 * The property is text and a canvas formula can put anything in it, so a typo
 * costs one button rather than the control.
 */
check(
    'an unknown token is dropped rather than thrown',
    count(renderDeep(mount({ presets: 'today,nonsense,last30' }).element), /data-preset="/g) === 2,
);

check(
    'and an empty list means no rail at all',
    count(renderDeep(mount({ presets: '' }).element), /data-preset="/g) === 0,
);

/*
 * A preset is pressed when the pair *is* that range, so the rail doubles as a
 * read-out. The clock is fixed at 1 January 2026, so "this month" is January.
 */
check(
    'a preset reads as pressed when the columns already hold its range',
    renderDeep(
        mount({ presets: 'thisMonth', start: day(2026, 1, 1), end: day(2026, 1, 31) }).element,
    ).includes('aria-pressed="true"'),
);

check(
    'and not when they hold something else',
    !renderDeep(mount({ presets: 'thisMonth' }).element).includes('aria-pressed="true"'),
);

/* --------------------------------------------- the Enum reads, defensively */

/*
 * The generated type is a string union, which is a compile-time claim about a
 * runtime the compiler does not control. An unexpected value must land on the
 * documented default rather than on the rarer branch — which is the v0.1.x bug
 * seen from the other side: a `TwoOptions` pair carrying `default-value="true"`
 * silently defaulted to `false`, and shipped a control that blocked same-day
 * ranges and hid the duration.
 */
const oddEnum = mount({ sameDay: 'nonsense', duration: 'nonsense' });

oddEnum.props().onChange(day(2026, 3, 4), day(2026, 3, 4));

check(
    'an unexpected sameDay value allows the same day, as the default does',
    oddEnum.notifications() === 1,
    String(oddEnum.notifications()),
);

check('and an unexpected duration value shows it', oddEnum.props().showDuration === true);

/* ------------------------------------------- security, rendered per column */

/*
 * v0.1.x computed `startReadable` and `endReadable` separately and then hid the
 * entire control if *either* was false — contradicting docs/model-driven.md,
 * and invisible to a suite that read the props and never rendered. This is that
 * suite, rendering.
 */
const oneHidden = renderDeep(mount({ startSecurity: 'no-access', start: null }).element);

check(
    'a user denied one column sees the other rather than nothing',
    oneHidden.includes('resx:DateRangePicker_Restricted')
        && oneHidden.includes('fmt:2026-03-06')
        && !oneHidden.includes('resx:DateRangePicker_NoAccess'),
);

check(
    'and is told why, rather than reading it as a missing value',
    oneHidden.includes('resx:DateRangePicker_PartialAccess'),
);

check(
    'a user denied both columns is told so, and shown no picker',
    renderDeep(mount({ startSecurity: 'no-access', endSecurity: 'no-access' }).element).includes(
        'resx:DateRangePicker_NoAccess',
    ),
);

/*
 * A read-only column locks the picker rather than opening a calendar that can
 * only commit one end: the control edits one range, and half a range is not one.
 */
check(
    'a read-only column leaves the picker read-only rather than half-editable',
    /class="DateRangePicker-field is-readonly"/.test(
        renderDeep(mount({ endSecurity: 'read-only' }).element),
    ),
);

/* --------------------------------------------------- what destroy owes */

/*
 * **Keep this when the rest of the file changes.** It needs no knowledge of
 * what this control takes.
 *
 * Both numbers are zero today — the control's own `destroy` says so in a
 * comment, and this turns that comment into something that fails if it stops
 * being true.
 */
disposeAll();

const timersBefore = time.pending();
const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
const listenersBefore = listeners();

mount({}).destroy();

check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);

check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

disposeAll();

report();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
