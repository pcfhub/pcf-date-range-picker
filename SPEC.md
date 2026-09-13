# pcf-date-range-picker — scaffolded, built, and packed

Picked to exercise three things nothing in the repository had: a control that
genuinely spans **two** columns, a `getOutputs()` returning more than one value,
and **dates** — and therefore timezones, which the skill had no section on at all.

Adopted from `_template` with `--framework react`. Verified with Microsoft's own
tooling and with timezone-shifted tests.

Bundle sizes are quoted in each release's notes rather than here: a number in
git that nobody re-runs reads as authoritative while being wrong. What does not
go stale is the reason they stay small — React and Fluent resolve to `Reactv16`
and `FluentUIReactv940` as externals and never enter the bundle, which the
README's grep confirms on the production output rather than from
`package.json`. That held through 0.2.0, which added a hand-built calendar and
a popover without adding a dependency.

## Two bound properties — the rule needed narrowing, not breaking

`references/control-patterns.md` says flatly **"one bound property for a field
control"**, from a real incident: `pcf-choices-picker` shipped two and makers were
asked to pick a second column for a control that attaches to one.

The mechanism it describes is real and applies here — the second bound property
does render as its own column picker in the configuration pane. The difference is
that here it *should*. A date range is two columns; being asked which one holds the
end date is the only way a maker can express the pair.

So the rule is right and its scope was too wide. It is not "one bound property" but
**one bound property per logical column**, and the test is not how many properties
there are but whether the extra column picker is a question the maker should be
asked. `pcf-choices-picker` needed one column and asked for two — wrong. This needs
two and asks for two — right.

`startDate` is declared first because a field control attaches to its first bound
property.

## `IOutputs` really does carry both

The artefact the exercise was for, straight from `refreshTypes`:

```ts
export interface IOutputs {
    startDate?: Date;
    endDate?: Date;
}
```

Only the *bound* properties appear; the four inputs do not. `getOutputs()` returns
both keys on every call.

The `null`-versus-`undefined` trap from `pcf-star-rating` applies twice over here,
and was written correctly from the start this time: the generated type is
`Date | undefined`, so `?? undefined` type-checks and silently converts every clear
into a no-op. Canvas honours that strictly. Both keys use the cast.

## Timezones — the finding, and it is not where people look

The received wisdom is to branch on `attributes.Behavior`. That turns out to be
close to irrelevant, and the platform's own typings say why. From the doc comment
above `DateTimeFieldBehavior` (which is otherwise typed as a bare `0 | 1 | 2 | 3`):

```
0 - None - Unknown DateTime Behavior,
1 - UserLocal - Respect user local time. Dates stored as UTC,
2 - DateOnly. Dates with time stored as midnight without conversion to UTC.
3 - TimeZoneIndependent - Dates and time stored without conversion to UTC.
```

All three named behaviours hand over a `Date` whose **local** components are the
calendar date the user means. So reading them locally is correct for every one, and
no branch is needed.

**That was right about reading and quiet about writing, and 0.2.3 is the bill for
the difference.** Look at behaviour 1 again: *dates stored as UTC*. A value handed
to that column is an instant, not a day — and which day it reads back as depends on
the timezone it is read in. The control emitted local **midnight**, which is the
one anchor with no tolerance at all: a day picked at 00:00 in a UTC-6 browser is
06:00Z, still the *previous* day for every viewer west of UTC-6.

Reported from a real form: 6 Sep – 31 Oct came back as 5 Sep – 30 Oct, both ends
exactly one day early. Measured across viewers, from a UTC-6 browser:

| viewer | from midnight | from midday |
| --- | --- | --- |
| UTC-11 | **09-05** | 09-06 |
| UTC-8 | **09-05** | 09-06 |
| UTC-6 | 09-06 | 09-06 |
| UTC+5 | 09-06 | 09-06 |
| UTC+9 | 09-06 | **09-07** |

Midnight fails every viewer west of the browser; midday fails only those more than
about twelve hours east of it. So the control now writes `atMidday` — which is
what `pcfhub.json`'s demo presets had used all along, every date in them written
`…T12:00:00`. The fixtures knew; the control did not.

Two honest limits on that. It is a **wider window, not a guarantee** — beyond
roughly twelve hours of disagreement the day still moves, and no client-side code
fixes a column that stores a day as an instant. And **rows written before 0.2.3
still hold midnight**, so they keep reading a day early until they are saved again.
The real fix is the column's behaviour, which `docs/limitations.md` has always
said should be **Date Only**.

**And there was a third one underneath both, on the display side.** With the
columns corrected to Date Only, the platform handed back exactly the right days
— measured on the form, `getAttribute().getValue()` returning
`2026-09-06T06:00:00.000Z`, which is local midnight and the right date — and the
field still rendered "9/5/2026 – 10/30/2026".

Nothing was wrong with the value. **`context.formatting` does not render in the
browser's timezone.** It renders in the *Dataverse user's*, a separate setting
that routinely differs from the machine's, so a day handed over as local midnight
formats as the day before for anyone whose Dataverse timezone is west of their
browser's. The stored data is right, the read is right, and only the text is
wrong — which is the most confusing shape a date bug can take, because every
check of the data agrees with you.

It reached four places, and the worst was the least visible: `formatDateYearMonth`
is handed the *first* of the month, so a westward user read "August" over
September's grid. The two that show are the trigger and the duration line; the
fourth is every day cell's `aria-label`, where only a screen-reader user would
have found it.

The fix is the same anchor as the write side — `atMidday` before every
`context.formatting` call — for the same reason: a value in the middle of the
day cannot be pushed across a boundary by twelve hours of disagreement.

Three bugs, one shape. **A whole day held as an instant is a day only as long as
nobody changes timezone, and there are three separate timezones in play** — the
browser's, the Dataverse user's, and whatever the column's behaviour stores in.
Anchoring at midday is what stops any pair of them disagreeing by less than half
a day from moving the date.

**And a fourth, which overturns the section this one opens with.** With the
columns corrected to Date Only and 0.2.4 deployed, the range still read a day
early — and this time *everything* in the control agreed on the wrong day: the
grid, the typed inputs and the trigger, all of which read local components
directly. A mis-formatted value would have disagreed with the typed inputs. This
did not, so the value was already wrong before any of them saw it.

The measurement, one column, one moment, the same stored day:

| | |
| --- | --- |
| `Xrm.Page.getAttribute('cll_startdate').getValue()` | `2026-09-18T06:00:00.000Z` — local midnight |
| `context.parameters.startDate.raw` | `2026-09-18T00:00:00.000Z` — **UTC** midnight |

**The two APIs do not agree, and nothing documents it.** A `DateOnly`-behaviour
column hands a *control* the day at UTC midnight, which read with local
components in a UTC-6 browser is 17 September. That is the whole bug, and it
appeared only after the columns were switched from UserLocal — under UserLocal
the value genuinely is an instant and reading it locally was right.

So `Behavior` is **not** nearly irrelevant, and the claim at the top of this
section was wrong in the half it was most confident about. It decides the shape
of the value you are handed:

- `1` UserLocal — an instant. Local components are the day.
- `2` DateOnly, `3` TimeZoneIndependent — the day itself, at UTC midnight. The
  **UTC** components are the day.
- `0` or absent `attributes` (canvas) — no column to be wrong about; the
  instant reading is the safe default.

`dayFromPlatform` and `dayToPlatform` in `range.ts` are the whole fix, and they
are deliberately the *only* two places that know: everything between them works
in plain local-midnight days, so the grid, `toInputValue` and `dayNumber` needed
no changes at all.

The catch that made this invisible: a column can be *formatted* Date Only while
*behaving* as UserLocal. The manifest's `of-type="DateAndTime.DateOnly"` gates on
the format, so the control binds happily and nothing anywhere says the two
disagree.

**The day-shift is not in reading the `Date`. It is in serialising it.** Measured,
not reasoned about — the same two operations under two real timezones:

| | UTC-6 (Mexico City) | UTC+12 (Auckland) |
| --- | --- | --- |
| `toISOString().slice(0,10)` on a DateOnly midnight | ok | **08-19** — a day early |
| `toISOString().slice(0,10)` on an evening UserLocal value | **08-21** — a day late | ok |
| `new Date('2026-08-20')` read back locally | **08-19** — a day early | ok |
| local components (`range.ts`) | ok | ok |

Note which cells fail. **The naive code breaks on different inputs in each
hemisphere**, which is most of why this bug survives: a developer in UTC-6 cannot
reproduce the UTC+12 report and vice versa, and each concludes the other is
mistaken. The correct implementation shifted the day zero times in either zone.

The two rules, both in `range.ts`:

- `toInputValue` builds `yyyy-mm-dd` from `getFullYear/getMonth/getDate`, never
  `toISOString()`, which converts to UTC first.
- `fromInputValue` builds `new Date(y, m - 1, d)`, never `new Date(string)` — the
  spec parses a date-only ISO string as **UTC** midnight.

`<input type="date">` earns its place here beyond bundle size: its value is
`yyyy-mm-dd` regardless of display locale, so there is exactly one format to
convert at exactly one boundary.

A third, quieter one: `daysBetween` builds a UTC instant out of *local* components
and subtracts those, rather than subtracting timestamps. Subtracting timestamps is
an hour out across a DST transition, which is enough to make a `Math.round` of
"days between" wrong at the boundary. Both DST cases are in the tests.

## Two columns means two of everything

`security` is per property, so a user can be denied one column and permitted the
other — a case no control here had met. `startReadable` and `endReadable` are
separate, as are the editable flags and the platform's `error`/`errorMessage`,
which render under the field they belong to and are kept apart from the control's
own range message. They are different failures and one must not overwrite the
other.

## Validation gates the write

An invalid pair is rendered but never handed back: `onChange` returns early when
`validateRange` reports a problem, so `notifyOutputChanged` is not called and the
columns keep their previous values. A half-filled pair is deliberately *not* a
problem — a user who has filled in one of two fields has not made a mistake yet,
and reporting one there flashes an error at every keystroke.

`validateRange` lives in `range.ts` and is used by both the entry point and the
component, so "valid" has exactly one definition rather than two that drift.

## Demo

`fidelity: "full"` — no `feature-usage`, no `webAPI`, no `device`. Every input
property is set in every preset, per the `default-value`-arrives-as-a-string trap.

**Preset dates are written as `2026-08-20T12:00:00`, not `2026-08-20`**, and the
reason is the finding above. A date-only ISO string parses as UTC midnight, so if
the harness hands the string to `new Date()` the demo would render a day early for
every visitor west of UTC — the control's own documented bug, in its own demo. A
date-*time* string without a zone parses as local, and midday is more than twelve
hours from either boundary.

**Unverified:** exactly how the harness turns `presets[].props` into a
`DateTimeProperty`. The `T12:00:00` form is robust under the likely
implementations, but confirm against `demo-harness/context/Parameters.ts` in the
hub repo before publishing.

## The Power Fx in the docs was wrong, and nothing could have caught it

Reported from a real canvas app: `DateAdd(Today(), 7, Days)` does not save. The
time unit has to be written **`TimeUnit.Days`** — a bare `Days` is not a name
Power Fx resolves, and the formula fails with an unrecognised-identifier error.

Three occurrences, across `docs/canvas.md` and `docs/examples.md`, all written
in the same sitting and all wrong the same way.

**Nothing in the pipeline could have caught this.** `npm run check` validates
filenames, `pcfhub.json` and the control shape; the hub compiles the Markdown;
neither reads a fenced code block. A Power Fx snippet in a doc page is
untested code shipped to a maker, and it costs them more than a prose error
because they paste it and get an error message about their own app.

The same round also found the canvas *binding* instructions too thin. Saying
"bind to a variable" is not the same as telling somebody where: the properties
appear as `startDate` and `endDate` in the formula-bar dropdown and as their
display names in the Advanced pane, and a maker who types a date into the
Advanced pane has done something that looks correct and behaves as though the
control is locked. `docs/canvas.md` now walks the four steps — create the
variables, bind both properties, set the rest, close the loop in `OnChange` —
rather than presenting a property table and assuming.

## 0.2.0 — what the calendar cost, and what it bought

v0.1.x was two native `<input type="date">` side by side. The trade was written
down at the time and it was a good one: the browser supplied the calendar, the
keyboard handling and the locale for nothing, and its `yyyy-mm-dd` value removed
a whole class of parsing bugs. What it did not supply was any sense that the two
dates were *one* thing — no band between them, no preview, no shortcut, and a
backwards pair answered with an error rather than prevented.

Replacing it meant taking back the two things the browser was giving away, and
they are worth naming so the next person weighs the same trade knowingly:

- **The keyboard is now this repository's problem.** A roving tabindex over the
  day grid, arrows by day and week, `Home`/`End`, `Page Up`/`Page Down` by
  month and with `Shift` by year. The horizontal arrows swap under RTL, which is
  invisible to an LTR reviewer and wrong for every right-to-left user.
- **The locale is now read explicitly**, from
  `userSettings.dateFormattingInfo` — `firstDayOfWeek`, `shortestDayNames`,
  `dayNames`. Reading it field by field rather than all-or-nothing matters: the
  three are independent, and a short array would otherwise index into
  `undefined` and render "undefined" as a column header. `toCalendarLocale`
  validates each and falls back per field.

What the platform gave back, and it is more than expected: **month headings and
day labels still come from `context.formatting`** — `formatDateYearMonth` and
`formatDateLong` — so no part of the calendar reaches for `Intl`. The control
therefore agrees with every other date on the form rather than with the browser.

### The defaults bug that shipped in 0.1.1

`allowSameDay` and `showDuration` were `TwoOptions` carrying
`default-value="true"`. That cannot work: `TwoOptionsProperty.raw` is a plain
`boolean`, so nothing means "the maker never touched this" and an untouched
property arrives as `false`. The shipped control blocked same-day ranges and hid
the duration by default — the opposite of what its own `.resx` descriptions
said, and of what `docs/examples.md` told makers to expect.

It is in `references/control-patterns.md` under *A `TwoOptions` input cannot
default to on*, and this control shipped it anyway. Nothing catches it: the
manifest is valid, the build is green, and the fixture in `dev/host.js` passed
`true` explicitly, which is exactly the value a real maker never supplies.
**A fixture that always supplies a value cannot test a default.** The 0.2.0 host
passes a deliberately invalid string instead, which reaches the same branch a
real untouched property does.

Fixed as `Enum`s — `sameDay: allow|block`, `duration: show|hide` — because an
Enum carries a real default and reads as the choice it is. The rename is
breaking; `docs/migration.md` says so plainly.

### The security branch nothing rendered

`index.ts` computed `startReadable` and `endReadable` separately, with a comment
explaining why they cannot collapse into one flag — and the component then hid
the entire control if *either* was false, contradicting the promise in
`docs/model-driven.md`.

Two assertions covered this and both passed, because they read the props and the
props were right. **An assertion on a decision is not an assertion on the
rendering of it.** `renderDeep` exists for that: `react-dom/server` needs no DOM
and no browser, executes the component body, and turns markup into something a
suite can read. It is also the only way the month grid is testable at all — a
grid is the control's own work rather than a value it hands on, so there are no
props to inspect.

### The harness ruling, and why this control is the exception

`_template` deletes `dev/harness.html` for `--framework react`, and
`TEMPLATE.md` calls it settled: a virtual bundle expects Fluent under a global,
`@fluentui/react-components` ships no UMD build, and adding a bundler to make
one would turn the harness into the thing that needs building. The stated
escape hatches are "Fluent ships a UMD build" or "a control whose bug can only
be seen and not asserted".

The second one happened, twice, in one afternoon of looking at this control in a
browser — and neither was reachable from `npm run smoke`:

- **The field was two tab stops.** `PopoverTrigger` clones its child and puts
  `role`, `tabindex` and `aria-expanded` on it, so a real `<button>` inside a
  styled `<div>` trigger produced a focusable div *and* a focusable button. The
  surface and the button are now one element.
- **The roving tabindex put `0` on two buttons.** Fourteen dates are drawn in
  both months at once — the trailing days of one are the leading days of the
  next — and keying on the date alone matched both copies. The ref map had the
  same collision, so focusing a date reached whichever month rendered last.

A third arrived from a user looking at the published demo, and it is the one
that made the pattern worth naming: **a range ending in the right-hand month
drew three solid marks.** The start, and the end *twice* — once in the left
month's trailing row and once where it belongs. The pair behind it was correct
throughout, which is exactly why it reads as broken and checks out as right.

All three are the same mistake wearing different clothes: **a date drawn in two
grids is one date wearing two hats, and every per-date decision has to pick a
hat.** The tabindex picked both. The ref map picked whichever rendered last. The
range paint picked both. Suppressing the duplicate each time would have been
three fixes; drawing each date once is one, and it makes the next member of the
family unreachable rather than merely handled — a day outside its own month is
now an empty cell. The cell stays, so the grid keeps six rows and the popover
keeps its height.

Both of the first two are now asserted, because both turned out to be visible in
`renderToStaticMarkup`. That is the honest sequence and worth keeping: the
browser found them, the suite keeps them found.

What justified the page rather than the ruling is the ratio. This control is
almost entirely its own DOM and imports four Fluent components — a provider and
a popover in three parts. `dev/fluent-stub.js` stands in for those in eighty
lines and says in its header how it is *less* capable: inline rather than
portalled, no focus trap, no tokens unless asked. **The portal difference is the
dangerous one**, because a stylesheet rule scoped under `.DateRangePicker`
rather than `.DateRangePicker-popover` would work on that page and match
nothing on a form. `npm start` remains the authority for that, and the page
says so.

Two things it caught that were not bugs in the control:

- **Every day disabled in `npm start`.** `pcf-start` prefills `minDate` and
  `maxDate` with the same date, so exactly one day was selectable and the
  control was right. A guard against an `Invalid Date` was written and then
  reverted: `pcf-start` converts an unparseable date to `undefined`
  (`harness.js`: `r = new Date(e), isNaN(r) && (r = void 0)`), so `?? null`
  already handles it and the guard would have shipped a comment asserting
  something untrue.
- **The native date inputs stayed light on a dark form.** Not a stylesheet bug —
  the browser draws their glyph, spinners and popup, and no rule reaches any of
  it. `color-scheme`, set from `fluentDesignLanguage.isDarkTheme` rather than
  from `prefers-color-scheme`, is the one property that fixes it.

### The demo frame clips a floating layer, and one of those was self-inflicted

Reported against the published v0.2.0 demo: clicking the field opened the
calendar as a scrolling sliver about one row tall, inside the control's own
box. Two causes, and separating them mattered.

**The frame.** `pcfhub.dev` renders the demo in a cross-origin iframe from
`demos.pcfhub.dev`, sized to the control's resting height — **68px** for this
control — with `overflow: hidden` on the element around it. A popover portals
to its document's `body`, and **nothing can paint outside an iframe**, so no
change here can make the calendar escape it. That is the hub's to fix, and it
is not specific to this control: any component with a popover, dropdown, menu
or tooltip has the same problem in that frame.

**The sliver, which was ours.** `max-height: min(80vh, 40rem)` on the popover
surface was added so a phone could scroll to reach the footer. In a 68px frame
`80vh` is 54px, so the rule that was meant to cap the calendar destroyed it —
measured at 54.4px of max-height against 335px of content. A floor,
`max(22rem, min(80vh, 40rem))`, restores the full 337px; the frame still clips
it, but the document then reports a 397px scroll height, which is a number a
resizing frame could act on.

The general shape of this is worth keeping: **a viewport-relative cap has a
lower end, and something will find it.** `vh` units read as "a fraction of a
screen" and are a fraction of whatever box the control was given.

`demo.fidelity` dropped to `limited` for one release while that was true.
PCFHub fixed the frame — its harness now measures a portalled overlay and
grows the iframe to fit, so the calendar opens at full size — and `full` is
honest again from 0.2.2. The limitation is gone rather than reworded: a demo
note describing a bug somebody else already fixed is worse than none.

### Still not assertable

The rig has no DOM and no reconciler, so a click, an arrow key, an effect and
focus are all out of reach. The click-order swap is the notable one: the *shape*
it depends on is asserted (a backwards pair still paints between its ends,
because `positionInRange` normalises), but the swap itself needs a click.

## 0.2.6 — paging painted a range nobody had picked

Reported with three screenshots: pick 7 September as the start, press the
month arrow twice, and October and then November each show days 1–6 banded with
a solid cap on the 7th — a range across months the user never touched. Click an
end date and the committed range is correct, so the value was never wrong. Only
the picture was, and only while half a selection was in progress.

**Two correct decisions, one wrong relationship.** The month arrows moved the
focused day with the window, which is right — a keyboard user who pages to
December and then presses an arrow key must continue in December, not be thrown
back to wherever the focus was left. And the preview painted from the focused
day, which is also right: that is what makes arrowing around show the range it
would select. Together they meant the *window* was driving the preview.

The tell is in the numbers rather than in the pixels. Paging twice from
7 September painted through to the 7th of each month, because paging added a
month to the focused day and left the day-of-month alone.

The fix splits the two ideas apart. `calendar.ts` now holds a `CalendarView` —
the window, the focused day, and **`pointed`**, the day the pointer is over or
the keyboard was last deliberately moved to — with four transitions on it:
`pageWindow`, `moveFocus`, `pointAt` and `rangeToPaint`. `pointed` is null
until the user points somewhere, and the preview falls back to the anchor alone
rather than to the focus. That is not a smaller version of the same guard: with
the moves written as functions on one value, **`pointed` is simply absent from
the paging step**, so the bug has no way to be expressed.

Focus stopped previewing too, and deliberately: tabbing into the grid moves the
tab stop and paints nothing. Only the pointer and the arrow keys are pointing.

### Reproducing it, since the suite cannot

`npm run build && npm run harness`, then in the console on
`dev/harness.html?bare=1&open=1&start=&end=`:

```js
const marks = () => [...document.querySelectorAll('[data-position]')]
    .filter((b) => b.dataset.position !== 'none')
    .map((b) => `${b.dataset.day}:${b.dataset.position}`);

document.querySelector('[data-day="2026-09-07"]').click();
[...document.querySelectorAll('.DateRangePicker-nav-button')].pop().click();
setTimeout(() => console.log(marks()), 100);
```

`[]` is the fix. Before it, seven entries — `2026-10-01:between` through
`2026-10-07:end`. The same script with an arrow key instead of the nav button
must print two entries, or the keyboard preview has been broken in the process.

**This is the second bug in this control that only a page could show**, after
the popover clipped in a short frame, and both were found by looking rather
than by asserting. The suite drives the built bundle through
`react-dom/server`, which runs a component once and never updates it — so every
transition above is unreachable from `npm run smoke` by construction, not by
omission.

## 0.3.0 — a date and time range, measured before it is written

Picked by looking outward, the way `pcf-data-table` 0.4.0 was. The PCF Gallery's
request board has one date topic that people keep reading — *Start and End
Date/Time Control*, 1,841 views — and it is marked completed with a follow-up
from the requester saying the control they were pointed at "does not allow for
the selection of times". That is this control's own `docs/limitations.md`,
first bullet: **whole days only**, and it does not even appear on a Date and
Time column. `docs/faq.md` says *open an issue if you need times*. 0.3.0 is
that issue.

**0.2.7 is a probe build and is not a release.** It ships the one manifest
change the feature cannot be measured without — the two bound properties
type-grouped over `DateAndTime.DateOnly` and `DateAndTime.DateAndTime` — plus
`DateRangePicker/probe.ts`, which logs one object once and parks four calls on
`window.__pcfDateRangeProbe`. It added no behaviour, and it is gone: the probe
and its lines in `index.ts` were deleted before the first line of 0.3.0 was
written. The type-group stays, and 0.2.7 was never tagged.

One thing the probe build already settled without a form: **a type-group whose
members are all `DateAndTime.*` costs nothing in the generated types.**
`refreshTypes` still emits `DateTimeProperty` for both bound properties, so
`raw` stays `Date | null` and `attributes` stays `DateTimeMetadata`. The
`raw: any` fallback `pcf-choices-picker` paid for is what a group with no
common generated type gets — the rule the skill already states for
`Whole.None | Decimal`, now with a second family behind it.

### The design, in brief

- **Times appear when the bound column has them.** On a model-driven form the
  column's `attributes.Format` decides; on canvas there is no column, so a new
  `time` Enum input (`auto` / `show` / `hide`) decides, defaulting to
  `auto`, which is "whatever the column says, and hide when nothing does".
- **Each column is judged on its own.** If the maker portal allows a Date Only
  start with a Date and Time end (question 1), the start stays a whole day and
  the end carries a time. The two columns already have separate `Behavior`
  handling, so this is the same shape one level up.
- **A time box beside each date box in the popover**, `<input type="time">`,
  for the same reason the date boxes are the browser's: one value format at one
  boundary. The calendar itself is unchanged; picking a day keeps whatever time
  the box holds, and a day picked with no time yet gets the column's current
  time or midnight.
- **The day-anchoring rule narrows rather than goes away.** `atMidday` and the
  midday write exist because a whole day held as an instant moves across
  timezones. A Date and Time value *is* an instant, so it is written as the
  moment the user meant and never re-anchored. Only a Date Only column keeps
  the midday write.
- **Whose clock the time is on is not designed here.** The native field shows
  a Date and Time value in the *Dataverse user's* timezone, and 0.2.4 measured
  that zone routinely differing from the browser's. Whether the control
  converts through `userSettings.getTimeZoneOffsetMinutes()` to agree with the
  form, and what a TimeZoneIndependent column hands over at all, are questions
  9, 6 and 10 below — and the answer decides the whole conversion layer.
- **Duration gains an hours part** when either end carries a time; the range
  rules gain "end before start" *by instant* on a same-day pair.
- **`minDate` and `maxDate` stay Date Only.** A bound on the day is what a
  maker means by a bound.

**Amended 2026-09-12, after both Date and Time pairs (questions 6 and 7).**
Whose clock the time is on is decided, and it is neither of the two the bullet
above weighed. **On write, the platform reads a Date by its browser-local
components and treats them as the wall clock** — for every behaviour. What it
does with that wall clock is the behaviour: User Local converts it out of the
Dataverse user's zone to UTC; Time Zone Independent stores it as it is. On
read, the two hand the wall clock back in different halves of the Date: User
Local as a true instant, Time Zone Independent in the UTC components.

So the control works in one representation throughout — **wall-clock Dates**,
local components meaning the clock on the user's wall — and converts at
exactly two places, the way `dayFromPlatform`/`dayToPlatform` already do
for days:

- **in, User Local (1):** `raw` is an instant; shift it by
  `userSettings.getTimeZoneOffsetMinutes(raw)` (the date argument is not
  optional — question 9) and rebuild as local components.
  `formatUTCDateTimeToUserDate(raw)` is the same arithmetic and is the
  cross-check in the rig, not the implementation: it is not in the typings.
- **in, Time Zone Independent (3):** `raw` carries the wall clock in its UTC
  components; rebuild those as local ones. The existing branch, one level
  down.
- **out, both:** hand the wall-clock Date over verbatim. No re-anchoring, no
  midday — the components *are* the value.

Every time shown in the popover is then the one the native field's
`formatted` shows, and every time typed is the one the form will store. The
browser's zone is used in neither direction. A Date Only column keeps the
0.2.x day handling untouched, midday write included.

### What must be measured first

Every bullet above rests on at least one claim nothing in this repository has
watched a platform make. The probe build asks these, in this order, and the
answers are written back here as *Measured* before a line of the feature
exists. **A question answered the wrong way removes the feature that depends on
it rather than being worked around** — that rule cut the lookup editor from
`pcf-data-table` 0.4.0 and is the reason to ask first.

The form needs two columns it may not have yet: a **Date and Time / User Local**
pair and a **Date and Time / Time Zone Independent** pair on `account`. The
second pair is the one no control in the catalogue has ever bound, and the
audit on the gap map has been asking for it since `pcf-date-range-picker`
disproved `pcf-sla-timer`'s claim that `Behavior` needs no branch.

1. **The maker portal, with a type-group on two bound properties.** After the
   upgrade, is the control still bound on `cll_startdate`/`cll_enddate`, or
   did the property type change under an installed binding reset it? Is it now
   offered in the control picker on a Date and Time column? When placed on
   one, does the *End date* column picker list Date Only columns, Date and
   Time columns, or both? Can a Date Only start be paired with a Date and
   Time end?

   *Measured 2026-09-12, in part.* The existing binding on
   `cll_startdate`/`cll_enddate` **survived** the type change — the first
   dump after the upgrade came from it, still bound, still reading the right
   day. The control **is** offered on a Date and Time column, and placed on
   `cll_windowstart` the End picker offered `cll_windowend`, another Date and
   Time column. Whether that picker also lists Date Only columns beside them,
   and whether a mixed pair is accepted, is still unobserved.
2. **Import.** What, verbatim, does the import say for a manifest whose bound
   property types changed? Nothing, a warning, or a refusal?

   *Measured:* —
3. **`property.type` per placement.** From `dump()`: `startDate.type` and
   `endDate.type` on each pair. Expected `DateAndTime.DateOnly` and
   `DateAndTime.DateAndTime`; this is the value the control would branch on.

   *Measured 2026-09-12, Date Only pair.* `startDate.type` and `endDate.type` are
   both the string `'DateAndTime.DateOnly'` — the resolved member, not the
   group name. An **unbound optional input** (`minDate`) reports `type: null`,
   `raw: null`, and — worth knowing — `security: {}` and `attributes: {}`:
   empty objects, not `undefined`. A bound column with no field security
   reports the full `{ secured: false, editable: true, readable: true }`. The
   rig withholds `security` as `undefined`; the host does not, on either kind
   of property. The Date and Time pairs are still to be read.
4. **`attributes` on a Date and Time column.** The exact `Format` string
   (`'dateandtime'`? `'DateAndTime'`?), the `Behavior` number, and the full
   key list — anything beyond `Behavior`, `Format`, `ImeMode`, `LogicalName`,
   `DisplayName` that the typings do not carry.

   *Measured on the Date Only column; the Date and Time column is still to be
   read.* The node carries far more than the typings' three keys:
   `DisplayName`, `LogicalName`, `Type: 'datetime'`, `IsSecured`,
   `RequiredLevel`, `ImeMode`, `EntityLogicalName`, `Precision: 2`,
   `Format: 'date'`, `Behavior: 2`, `Options: null`, `SourceType`,
   `Description`, `Timestamp`. So the format vocabulary is lower-case
   (`'date'`, and presumably `'datetime'` for the other), and
   `Xrm.Page.getAttribute(...).getFormat()` says the same `'date'`.

   *And on the Date and Time column, 2026-09-12:* the same fourteen keys with
   `Format: 'datetime'` and `Behavior: 1`. So the vocabulary is
   `'date'` / `'datetime'`, lower-case, and the control can branch on it.
5. **`raw` on a User Local Date and Time column.** `raw.iso` against
   `xrm.value.iso` and against the time the native field shows. Expected: the
   same instant, and the native field showing it in the Dataverse user's zone.

   *Measured 2026-09-12.* `raw`, `Xrm.Page.getAttribute().getValue()` and the
   Web API **all agree**: `2026-09-18T13:30:45Z`, one instant, no six-hour
   split — that split is a DateOnly-behaviour artefact and User Local has none
   of it. The platform's own `formatted` reads `'9/18/2026 8:30 AM'`, which
   is 13:30Z in the **Dataverse user's** zone (UTC-5 today), and
   `formatTime(raw, 1)` renders the same string. `formatDateShort(raw, true)`
   renders `'7:30 AM'` — the browser's zone — and is therefore the wrong call
   for a time on a form. What the native field's text box shows is still to
   be read off the screen, but `formatted` is the platform's own rendering
   and there is no reason to expect the field to differ from it.
6. **`raw` on a Time Zone Independent Date and Time column.** The audit's open
   item. Is the wall-clock time in the **UTC** components — the way a DateOnly
   column keeps its day — or in the local ones? Does `xrm.value` disagree with
   `raw` by the user's offset, the way the two did for DateOnly in 0.2.5?

   *Measured 2026-09-12.* **Yes — the wall-clock time is in the UTC components**,
   exactly as a DateOnly column keeps its day. The server holds
   `2026-09-18T08:30:45Z`; `raw` is that same string as a Date, so
   `raw.utcParts` reads `08:30:45` and `raw.localParts` reads `02:30:45` in
   the UTC-6 browser. `Xrm.Page.getAttribute().getValue()` is
   `2026-09-18T14:30:45Z` — local components `08:30:45` — so the two APIs
   disagree by the browser's offset, the DateOnly split reproduced with a
   time in it. `formatted` reads `'9/18/2026 8:30 AM'`, the wall clock;
   `formatTime(raw, 3)` and `formatTime(raw, 2)` render the same;
   `formatDateShort(raw, true)` renders `'2:30 AM'`, which is wrong on this
   host for the third time in three columns. `dayFromPlatform`'s
   `storesTheDayItself` branch extends to the time unchanged: rebuild the
   UTC components as local ones, and the value is the wall clock.
7. **The write shape, per behaviour.** `write('2026-09-18T14:30:45Z',
   '2026-09-19T09:15:00Z')`, save, hard-reload, then `dump()` and
   `readBack()`. On User Local, does the server hold `14:30:45Z`? On Time Zone
   Independent, does it hold `14:30` wall-clock, `14:30` shifted by the user's
   offset, or something else — and which `Date` shape makes it hold `14:30`
   wall-clock? Does `write(null, null)` clear both?

   *Measured 2026-09-12, User Local half.* **The platform does not store the
   instant it is handed. It stores the Date's browser-local wall clock, read as
   the Dataverse user's wall clock.** `write('2026-09-18T14:30:45Z',
   '2026-09-19T09:15:00Z')` handed over two instants whose local components
   in the UTC-6 browser are 08:30:45 and 03:15:00; after save and reload the
   Web API holds `2026-09-18T13:30:45Z` and `2026-09-19T08:15:00Z` — 08:30:45
   and 03:15:00 **in UTC-5**, the user's zone today, one hour off the instants
   handed over. `formatUserDateTimeToUTC(x, 1)` is that exact arithmetic,
   and `formatUTCDateTimeToUserDate(raw)` is its inverse (it returned
   `14:30:45Z`, whose local components are the stored wall clock).

   This is the mechanism under every 0.2.x date bug, now measured directly
   rather than inferred from a table of viewers: a whole day handed over at
   local midnight is re-read as the user's midnight, and any hour of
   difference between the two zones lands it on the wrong day. `atMidday`
   survived it by accident of being twelve hours from the boundary. **For a
   time it cannot be survived — it has to be modelled.** The design section
   below is amended.

   *Time Zone Independent half, same day.* The same two instants handed over —
   local components `08:30:45` and `03:15:00` — and the server holds
   `2026-09-18T08:30:45Z` and `2026-09-19T03:15:00Z`: **the local
   components, stored verbatim, no conversion.** So the write contract is the
   same for both behaviours — *the Date's browser-local components are the
   wall clock* — and only what the platform then does with that wall clock
   differs: User Local converts it out of the user's zone to UTC, Time Zone
   Independent keeps it. Neither reads the instant. `dayToPlatform`'s
   UTC-midday write for behaviours 2 and 3 has therefore been landing the
   right day by a different route than it thought — a UTC-midday Date in a
   UTC-6 browser has local components of 06:00, and 06:00 on the right day
   is what got stored — and it stays as it is, because it is measured to
   work and a day has twelve hours to spare.

   **The clear is unmeasured, twice.** `write(null, null)` reported handing
   over `null` for both on each pair, and each read-back afterwards returned
   the same values under the *same ETag* (`W/"33739104"`, then
   `W/"33739107"`) — so either the form never went dirty or it was not
   saved. Two identical outcomes make the first reading the likelier one.
   On the follow-up list, with the question sharpened: after
   `write(null, null)`, do the native fields blank and does the form show
   unsaved changes?
8. **Seconds.** After 7, does the server hold `:45`, and does `raw` carry it
   back after the reload? Decides the time box's `step` and whether the
   change guard compares to the minute or to the second.

   *Measured 2026-09-12.* **Seconds survive.** `:45` was handed over, the
   server holds `13:30:45Z`, and `raw` carries `:45` back after a hard
   reload; `Precision: 2` on the node is unrelated to it. Only the rendering
   drops them — `formatted` and `shortTimePattern` are `h:mm tt`, and
   `longTimePattern` is the one with `ss`. So a time box with `step=60`
   would silently truncate a value the column holds, and the change guard
   has to compare to the second or a reload will look like an edit.
9. **`userSettings.getTimeZoneOffsetMinutes()`.** Its sign and value beside
   the browser's own `getTimezoneOffset()` — the browser's is minutes *behind*
   UTC, the platform's is documented only as "from UTC" — and whether it
   changes between the January and July dates. And whether, on this machine,
   the two zones differ at all.

   *Measured 2026-09-12.* **The sign is the opposite of the browser's.** In a
   UTC-6 browser `new Date().getTimezoneOffset()` is `360`;
   `getTimeZoneOffsetMinutes()` is `-360` — minutes *ahead* of UTC, the way
   people write "UTC-6". **And the two zones are not the same zone.** The
   browser is `America/Mexico_City`, which has had no DST since 2022 (360 in
   January and July alike); the Dataverse user's zone answers `-360` for
   15 January and `-300` for 15 July, so it observes DST and is an hour ahead
   of the browser for half the year — including, if it is US Central, today.
   **The no-argument call is not "now".** Confirmed on the same form, three
   calls side by side: `userSettings.timeZoneUtcOffsetMinutes` is `-360`,
   `getTimeZoneOffsetMinutes(new Date())` is `-300`, and the PCF
   `getTimeZoneOffsetMinutes()` with no argument answered `-360` — the
   *standard* offset, DST ignored. `Xrm.Utility.getGlobalContext()
   .userSettings.getTimeZoneOffsetMinutes()` with no argument answers
   `-300`, so the two APIs default differently for the same name. **Always
   pass the date**, and pass the date being converted rather than today's:
   a range that straddles a DST change has two offsets.
10. **`formatting.formatTime` and `formatDateShort(x, true)`.** From
    `formatsOfFixed` (14:30Z on 18 September): what each behaviour renders,
    in which zone, and whether any of the thirteen calls throws.

    *Measured 2026-09-12, on 14:30Z.* None of the thirteen calls threw, and
    **the formatters do not agree on whose clock it is:**

    | call | rendered | zone |
    | --- | --- | --- |
    | `formatDateShort(x, true)` | `9/18/2026 8:30 AM` | browser, UTC-6 |
    | `formatTime(x, 0)` | `9/18/2026 8:30 AM` | browser |
    | `formatTime(x, 1)` | `9/18/2026 9:30 AM` | **Dataverse user, UTC-5** |
    | `formatTime(x, 2)` / `(x, 3)` | `9/18/2026 2:30 PM` | the UTC components, unshifted |
    | `formatDateAsFilterStringInUTC(x, true)` | `2026-09-18T08:30:00` | browser components, mislabelled UTC |
    | `formatUTCDateTimeToUserDate(x)` | a Date at `15:30Z` | shifts by (user − browser) = +60 min |
    | `formatUserDateTimeToUTC(x, 1)` | a Date at `19:30Z` | shifts by −(user offset) = +300 min |

    Two things follow. **`formatTime` renders the date as well as the time**,
    so its name lies and it cannot be used for a time-only label. And
    **`formatTime(x, 1)` is the only call here that renders in the Dataverse
    user's zone**; `formatDateShort(x, true)` uses the browser's. Which of
    the two the native Date and Time field agrees with is question 5, and it
    is the question that decides the conversion layer. The last two calls are
    not in the typings and shift *components*, not instants — usable, but
    only once the sign convention above is pinned. Against the DateOnly
    `raw` (`2026-08-12T00:00Z`) `formatTime(x, 2)` rendered
    `8/12/2026 12:00 AM` — the right day, read out of the UTC components,
    which is the platform doing what `dayFromPlatform` does.
11. **`dateFormattingInfo` on a real organisation.** `shortTimePattern`,
    `amDesignator`, `pmDesignator`, `timeSeparator`, and the key list. The
    fixture has always supplied these; whether a live tenant fills the time
    half decides whether the control can tell 12-hour from 24-hour without
    asking the browser.

    *Measured 2026-09-12.* Fully populated, and under **two spellings at once**:
    every key is present Pascal-cased (`ShortTimePattern`) and camel-cased
    (`shortTimePattern`). The camel-cased ones are what the typings name.
    For this organisation: `shortDatePattern: 'M/d/yyyy'`,
    `shortTimePattern: 'h:mm tt'`, `longTimePattern: 'h:mm:ss tt'`,
    `timeSeparator: ':'`, `amDesignator: 'AM'`, `pmDesignator: 'PM'`,
    `firstDayOfWeek: 0`. So the control *can* tell 12-hour from 24-hour from
    the platform — `tt` in the pattern — without asking the browser.
12. **The Date Only pair still reads the right day.** `dump()` on the original
    `cll_startdate` placement: `startDate.raw.utcParts` names the day the
    native field shows. The type-group must not have cost 0.2.6's fix.

    *Measured 2026-09-12.* Holds. `raw` is `2026-08-12T00:00:00.000Z` and
    `raw.utcParts` names 12 August; `Xrm.Page.getAttribute('cll_startdate')
    .getValue()` is `2026-08-12T06:00:00.000Z`, local midnight of the same
    day — the six-hour disagreement from 0.2.5, reproduced exactly. The
    type-group cost nothing. **And a cheaper reading appeared:** the
    property's own `formatted` is `'8/12/2026'`, the right day, straight
    from the platform — where `formatDateShort(raw)` gives `'8/11/2026'`.
    The control currently formats `atMidday(day)` itself; `formatted` would
    do for the trigger, though not for the calendar's cells.

### What the answers decide

| Answer | Consequence |
| --- | --- |
| 1 — the existing binding reset | `docs/migration.md` is written for 0.3.0, and the release notes say so first. |
| 1 — mixed pairs refused by the portal | the per-column judgement above is dead code and is not written. |
| 2 — the import refuses | the type-group is not a change 0.3.0 can ship; a separate control (`DateTimeRangePicker`) is the shape instead. |
| 4 — no `Format` on the node | the control cannot tell a column's format on its own, and the `time` Enum is the only switch — on both hosts. |
| 6 — TZI is *not* in the UTC components | `dayFromPlatform`'s `storesTheDayItself` branch is wrong for behaviour 3 with a time, and 0.3.0 splits 2 from 3. |
| 7 — no shape persists a TZI wall-clock time | TZI columns are read-only in 0.3.0, and `docs/limitations.md` says so with the measurement. |
| 8 — seconds are dropped | `step` is 60 and the change guard compares minutes. |
| 9 — the zones differ and the sign is opposite | the conversion layer is written against the platform's sign, with the browser's used nowhere. |
| 11 — the time half is empty | 12/24-hour follows the browser's locale, and the FAQ says why the form and the box can disagree. |

### What shipped

Built against the measurements above and nothing else. 92 smoke assertions, up
from 70; the three that carry the release were mutation-tested — the User
Local read moved to browser components, the offset call stripped of its date
argument, the timed write anchored at midday — and each broke the suite, with
the bundle hash checked across every rebuild so a mutation that never built
could not pass as one that did.

- **`range.ts`** gains `ColumnShape` (`behavior` + `hasTime`), an `OffsetFor`
  type, and `fromPlatform`/`toPlatform` one level up from
  `dayFromPlatform`/`dayToPlatform`: a whole day goes through the old pair
  untouched; a moment is rebuilt from the UTC components for behaviour 3, slid
  by `getTimeZoneOffsetMinutes(raw)` and rebuilt for behaviour 1, and handed
  back **verbatim** on the way out. `validateRange` gains `byInstant`, a
  same-day order check that applies only when both columns carry a time.
  `timeOf`, `withTime`, `toTimeInputValue`, `fromTimeInputValue` and
  `isSameSecond` are the time-of-day helpers.
- **`calendar.ts`** gains the time half of `CalendarLocale` —
  `shortTimePattern`, `amDesignator`, `pmDesignator`, read field by field like
  the rest — and `formatTimeOfDay`, a .NET short-time-pattern renderer. The
  control's own rather than `context.formatting`, because question 10 measured
  the platform's time formatters disagreeing on whose clock to use and every
  one of them printing the date in front of the time.
- **`index.ts`** decides `hasTime` per column: `attributes.Format ===
  'datetime'` on a form, the new `time` Enum on canvas (`show`), with `hide`
  overriding either. The change guard compares to the second for a timed
  column and by day for a whole-day one. `getOutputs` goes through
  `toPlatform`.
- **The manifest** carries the type-group and a `time` Enum
  (`auto`/`show`/`hide`, default `auto`); five `.resx` files carry its
  strings, the two time-box labels and the four elapsed-time fragments.
- **The component** adds an `<input type="time">` beside each date box whose
  column carries a time — disabled while that end has no day, minutes only —
  and keeps each end's time across a day pick, a preset and a typed date. The
  trigger reads date and time; the duration becomes elapsed time to the
  minute when either end has a time.
- **On a phone** — below 36rem — one month, the quick ranges as chips, the
  date and time boxes wrapping as pairs, and the field value wrapping rather
  than truncating. Between 36rem and 44rem the chips stay and both months
  return. Desktop is unchanged.
- **The rig** models the measured contract in `host.store`: the write reads
  local components as the wall clock, User Local converts them out of the
  user's zone, TZI keeps them; `raw` is what the server holds. `userOffset`
  is in the platform's sign, the no-argument offset call answers the standard
  offset an hour behind, and the fixture's time pattern is `HH:mm` so a
  twelve-hour assumption shows. The harness page gains switches for format,
  `time`, behaviour and offset, and its date boxes take `yyyy-mm-ddTHH:mm`.

### Found by looking, not by asserting

Two, both in the stylesheet, both invisible to `react-dom/server`:

- **The time box clipped its own designator.** `7.5em` looked like room for
  `08:30 AM` and Chrome rendered `08:30 AN` — the browser's time input draws
  a clock glyph inside its width and the last letter went under it. `9.25em`.
- **Four typed boxes pushed the Done button off the screen.** The popover
  surface takes its width from its content, and a `flex-wrap` row still
  reports its single-line width *as* content — so the footer, which had always
  fitted, widened the whole surface past the viewport and the browser clipped
  it. `contain: inline-size` on the footer takes it out of that measurement:
  the calendar decides the width and the footer wraps inside it, with the
  action buttons pushed to the end of their own line.

Neither is a wrong value. Both are the class of defect the skill says
screenshots exist to find, and the screenshot pass found them on its first
frame.

**And a third, from the form on a phone.** At a viewport just under 500px the
popover showed the quick-range rail as seven full-width rows, the two months
stacked underneath, and the footer below the fold — and the field read
`9/12/2026 6:00 AM – 10…`. Three separate causes:

- The chip rule was keyed to `max-width: 30rem` (480px), so at 495px it had
  not fired, and a rail that cannot sit beside the months wraps as a
  *column*. It is 44rem now, which is where the rail and two months stop
  fitting side by side.
- Two months side by side need about 464px; below that the second wraps under
  the first and doubles the height. The component now asks
  `matchMedia('(max-width: 36rem)')` and renders one month, and `moveFocus`
  takes the window size so arrowing off the 30th pages to October rather
  than into a month that is not drawn. Driven in the harness: 19 ArrowRights
  from the 12th end on Oct 1 with the heading reading October.
- The field value was `white-space: nowrap` with an ellipsis, which on a phone
  hides the end of the range. Below 36rem it wraps.

Two more were visible only at that width: the footer's date and time boxes
wrapped individually and orphaned *End time* on a row of its own — they are
grouped as pairs now, so a pair wraps as a unit — and `dev/harness.html` had
no `<meta viewport>`, so a phone rendered it at 980px and no width query could
ever fire there.

The second look, from the form again: the chip row makes the surface as wide
as the screen, so a one-month grid at its desktop 224px sat beside an empty
half, over a blank sixth row. Below 36rem the month now fills the surface —
44px rows, a 40px circle for the day, the band painted on the *cell* (full
width between the ends, half width under an end) because a circle inside a
wider cell would otherwise leave a gap in it either side of every day — and
a row with no day in it is dropped. Both rules lean on `:has()`, which the
mobile WebView has.

And the third: the desktop cap of `80vh` put the Done button behind a
scrollbar on a 603px-tall form where the whole popover would have fitted.
Below 36rem the cap is the viewport less a margin (`100dvh`, `100vh` for a
WebView without it), the rows are 40px with a 36px circle, and the chip and
body spacing is tightened — a two-row rail, a five-row month and a four-box
footer come to 531px, which fits a 375×667 phone with the field at the top
and no scroll. The scroll is still there for a screen shorter than that,
which is what it was always for. The glyph in the field also gained the native fields' hover:
brand blue and a tooltip, on the glyph alone.

### Not verified in 0.3.0

*Walkthrough, 2026-09-12.* 0.3.0 went onto the Accounts form on all three pairs
— Date Only, User Local and Time Zone Independent — and came back "looks good
and works as expected", including the phone layout on a device, after three
rounds on the phone layout that each started from a screenshot of the form:
the glyph hover, the chip and one-month breakpoints, and the surface using the
viewport height rather than 80vh. That is the release-level verdict; the
items below were not each measured individually and stay listed.

- **Each item, individually.** 0.3.0 was imported and walked through (above),
  and the verdict was the release's, not a measurement per item. The
  conversion layer is written from the 0.2.7 measurements and the rig repeats
  those measurements back, which is the strongest thing a rig can do and is
  still not a form; a Web API read-back of a time typed on the form is the
  one reading that would close it, and was not pasted.
- **The clear on a Date and Time column.** `write(null, null)` never dirtied
  the form on either pair (same ETag before and after), and the probe could
  not say whether the null was refused or the form was never saved. The
  control's clear path is unchanged from 0.2.x, where it works on Date Only
  columns; whether a Date and Time column accepts `null` from a virtual
  control is the first thing to try on the form.
- **A mixed pair in the maker portal.** Whether the End picker offers a Date
  Only column beside a Date and Time start is unobserved (question 1). The
  control handles the pair either way; the portal may never produce it.
- **The import message** (question 2). The probe went in as an upgrade of an
  installed solution and nothing was captured.
- **A time on canvas.** `time: show` with no `attributes` and no user offset
  reads the instant in the browser's clock, which is the only clock canvas
  has. Whether a canvas `DateTime` property hands over what a Dataverse
  column would, or what a Power Fx `Now()` would, is unmeasured.
- **A twelve-hour organisation end to end.** `formatTimeOfDay` is asserted
  against `h:mm tt`, the pattern measured on the live tenant, and the harness
  renders `8:30 AM` — but the box beside it is the browser's, in the
  browser's locale, and the two can disagree on a machine whose locale is not
  the organisation's. The FAQ says so.
- **DST inside a range.** The offset is asked per date, which is the design;
  a range whose two ends sit either side of a DST change has not been put
  through a form.
- **The phone layout on the Power Apps mobile app itself.** Verified at
  375px, 495px and 650px in a desktop browser's emulation and in the
  harness; the mobile app's WebView, its viewport meta and its own chrome
  around the form are the unmeasured half.

## Still open

Everything here is **Not verified** in the strict sense: read-correct against
the real typings, compiled, and asserted as far as a rig without a browser can
reach.

- **Not imported into a real environment.** The per-column security and
  business-rule error paths compile and are asserted against fixtures, but are
  not observed on a form.
- **The keyboard has not been driven by a keyboard.** Roving tabindex, the arrow
  and paging keys, the RTL swap, focus entering and leaving a trapped popover —
  none of it is reachable from `npm run smoke`, which has no DOM. `dev/harness.html`
  can reach it, and the attempt failed for an environment reason rather than a
  control one: `document.hasFocus()` was false in the automated browser, so
  `.focus()` moved nothing. What *was* confirmed there is that the grid carries
  exactly one tab stop, that paging with the month arrows carries it along, and
  — from 0.2.6 — that an arrow key after paging continues in the month on
  screen and previews from it, while paging alone previews nothing. Those were
  driven by dispatching `keydown` at the grid rather than by a real key press,
  so the handler is observed and the browser's own focus is still not.
- **The focus trap and Escape are unobserved.** Both are Fluent's, and
  `dev/fluent-stub.js` has neither, so only `npm start` or a real form shows
  them.
- **The click-order swap is asserted only in the shape it rests on.** See above.
- **`dateFormattingInfo` has not been read from a real organisation.** The
  fixture supplies the shape the typings describe; whether a live tenant fills
  every field is unobserved, which is why each is validated separately.
- **Whether PCFHub's demo harness publishes `fluentDesignLanguage` or
  `dateFormattingInfo` is unknown.** Both have fallbacks — `webLightTheme` and a
  Sunday-first English culture — so the demo renders either way, but the hub's
  screenshot may not match a themed form.
- **The `Behavior` conclusion** was drawn from the platform's own typings and from
  timezone tests of the boundary functions, not from a live environment — and a
  live form found the half it got wrong, which is written up under *Timezones*
  above. What is still unverified is the other direction: no column of each
  behaviour has been observed, so how each one round-trips `atMidday` is still
  read from the typings rather than seen.
