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

Both are now asserted, because both turned out to be visible in
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
  exactly one tab stop and that paging with the month arrows carries it along.
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
- **The `Behavior` conclusion** is drawn from the platform's own typings and from
  timezone tests of the boundary functions, not from a live environment with a
  column of each behaviour.
