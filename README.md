# Date Range Picker

Pick a start and end date as one range, on a two-month calendar.

[![Build](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-date-range-picker), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

One field on the form that opens a two-month range calendar: click a start,
click an end, and the days between shade as the pointer moves. A quick-range rail
covers the periods people actually pick, and both dates are written back to their
own columns — replacing the usual arrangement of two unrelated date fields that
only disagree with each other once somebody saves.

**Clicking the two days in the wrong order swaps them.** v0.1.x answered a
backwards pair with an error message, which is a mistake to report when the
intent is unambiguous: nobody means "end, then a start after it".

**It binds two columns, which is the exception to the usual rule rather than a
lapse from it.** A field control binds its first bound property to the column it is
placed on and renders every additional one as its own column picker in the maker's
configuration pane. For a control that attaches to one column that second picker is
a wrong question — which is why `pcf-choices-picker` reverted to a single
type-grouped property. A date range genuinely *is* two columns, so here the second
picker is how the pair gets configured. The distinguishing question is whether the
maker should be asked, not how many properties there are.

**The calendar is hand-built, and that is a trade with a number behind it.**
Fluent 9's date picker lives in `@fluentui/react-datepicker-compat`, which is not
one of the platform libraries — importing it would bundle it and its calendar
dependency and undo the reason to be a virtual control at all. So the grid is
this repository's code, built on the Fluent design tokens the platform *does*
publish, and it takes on the two things v0.1.x got from the browser for free:

- **the keyboard**, which is a roving tabindex over the day grid — arrows by day
  and week, `Home`/`End` for the week, `Page Up`/`Page Down` by month and with
  `Shift` by year, and the horizontal arrows swapped under RTL;
- **the locale**, which comes from `userSettings.dateFormattingInfo` — the first
  day of the week, the day names and the month names — with every date on screen
  formatted through `context.formatting` rather than `Intl`, so the control
  agrees with the rest of the form instead of with the browser.

The typed **From** and **To** fields inside the popover are still native
`<input type="date">`. Their value is always `yyyy-mm-dd` regardless of display
locale, which removes a class of parsing bugs outright — that was always the
strongest argument for them, and it survives.

**Calendar days are read and written from local components throughout**, never via
`toISOString()` or `new Date(string)`. Both of those shift the day, in opposite
directions depending on which side of UTC you are — which is why the bug survives
so long, since a developer in one hemisphere cannot reproduce the other's report.
`range.ts` holds the two boundary functions and the range rules, and is covered by
tests that run under several timezones.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `startDate` | DateAndTime.DateOnly | bound, **required** | — | The column holding the first day; the control attaches to this one |
| `endDate` | DateAndTime.DateOnly | bound, **required** | — | The column holding the last day |
| `minDate` | DateAndTime.DateOnly | input | — | Optional earliest selectable day |
| `maxDate` | DateAndTime.DateOnly | input | — | Optional latest selectable day |
| `sameDay` | Enum | input | `allow` | `allow` or `block` a one-day range |
| `duration` | Enum | input | `show` | `show` or `hide` how many days the range covers |
| `presets` | SingleLine.Text | input | six of them | Comma-separated quick ranges; empty for none |

`sameDay` and `duration` replaced `allowSameDay` and `showDuration` in 0.2.0, and
the rename is the point. Both were `TwoOptions` carrying `default-value="true"`,
which cannot work: `TwoOptionsProperty.raw` is a plain `boolean`, so there is no
value meaning "the maker never touched this" and an untouched property arrives as
`false`. The shipped 0.1.x control therefore blocked same-day ranges and hid the
duration by default, contradicting its own descriptions. An `Enum` carries a real
default. See `docs/migration.md`.

`presets` takes any of `today`, `thisWeek`, `last7`, `last30`, `thisMonth`,
`lastMonth`, `thisYear`, `next7`, `next30`, `nextMonth`. Unknown tokens are
dropped rather than thrown — the property is text and a canvas formula can put
anything in it, so a typo should cost one button rather than the control.

`getOutputs()` returns **both** bound values on every call, and emits `null` rather
than `undefined` to clear one — `undefined` means "no change", which a canvas app
honours strictly, so a field bound that way simply refuses to empty.

An invalid pair is rendered but never handed back to the platform, so the columns
cannot hold a range that contradicts itself. A half-filled pair is not an error;
requiredness is the platform's to enforce. The first click of a selection writes
nothing at all — it only anchors the range — so abandoning a half-finished pick
leaves the columns as they were.

Field-level security is read per column and now *rendered* per column: a user
permitted the start date and denied the end sees the start date and "Hidden",
rather than the whole control vanishing. v0.1.x computed the two flags and then
hid everything if either was false, which no assertion caught because the suite
read the props and never rendered.

Strings ship in English, Spanish, French, German and Japanese. Built on the
platform's own React 16.14 and Fluent 9, so neither is bundled — confirmed by the
externals check below rather than by reading `package.json`.

:warning: **In a canvas app, bind both dates to variables, never to values.** A
code component does not write back to its own inputs — it raises `OnChange` and
the app decides what to store. Bound to `Today()` or a fixed date, every edit is
overwritten on the next render and the control looks locked. Set `startDate` to
`varStart` and `endDate` to `varEnd` in the formula bar, and close the loop in
`OnChange` with `Set(varStart, DateRangePicker1.startDate)`. Note the time unit
in `DateAdd` is `TimeUnit.Days`, not `Days` — a bare `Days` will not resolve.

## On the hub

The demo runs at **full** fidelity, which follows from the manifest declaring no
`feature-usage` at all: the control renders and writes back two bound columns and
does nothing else — no Web API, no device, no navigation. That absence is what lets
the sandbox run the real thing, and it is one fewer permission prompt for the maker
installing it.

Six presets cover the default rail, a calendar with no rail, a single day, the
validation state, a bounded window and the empty pair.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-date-range-picker/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # the built bundle, driven outside a browser
npm run harness    # dev/harness.html, a stand-in form in the browser
```

Three tools, and they answer different questions.

`npm start` is Microsoft's own harness and the only one running the **real**
Fluent, so it is the authority on anything that depends on the popover being
portalled — including whether a stylesheet rule is scoped to reach it.

`npm run harness` is `dev/harness.html`, and it exists because `npm start`
cannot reach the states that break this control: field-level security per
column, a business rule on one date, a host that publishes no theme versus a
dark one, a host that publishes no date culture, right-to-left, and each of the
five shipped languages. It reads the strings out of the `.resx` rather than a
copy, so a key missing from a locale shows up on the page as the key name.

The template deletes this page for `--framework react`, on the grounds that
`@fluentui/react-components` ships no UMD build and there is nothing to put in a
`<script src>`. That ruling holds for a control made of Fluent; it does not hold
for this one, which is almost entirely its own DOM and imports exactly four
Fluent components. `dev/fluent-stub.js` stands in for those four in eighty
lines, and its header lists the three ways it is *less* capable than the real
thing — inline instead of portalled, no focus trap, no tokens unless asked.

Every switch is also a query parameter, so a state is a URL rather than a
sequence of clicks nobody wrote down. That is how `media/screenshot.png` is
taken, and it can be retaken from a clean tree:

```bash
npm run build && npm run harness -- --no-open --port 8199
chrome --headless=new --window-size=700,432 --force-device-scale-factor=2 \
  --screenshot=media/screenshot.png \
  "http://localhost:8199/dev/harness.html?bare=1&open=1&locale=1033"
```

`media/screenshot-times.png` is the same command at `--window-size=700,468`
with `&format=datetime&behavior=1&userOffset=-300&start=2026-08-20T08:30&end=2026-08-21T17:00`
appended to the URL.

`npm run smoke` is the assertion half — it drives the real built bundle in Node,
reads the props the control handed down, and renders the tree with
`react-dom/server` for the parts that have no props to read, which since 0.2.0
is most of the calendar. What it cannot do is click a day, send an arrow key,
run an effect or observe focus; those are in `SPEC.md` under **Not verified**.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

Confirm the platform libraries really are external, because nothing in CI checks it:

```bash
grep -c '__SECRET_INTERNALS\|griffel\|react-dom.production' out/controls/DateRangePicker/bundle.js
```

That must be `0`.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `DateRangePicker/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `DateRangePicker/` | The control: manifest, entry point, React components, date rules, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `dev/` | The rig: `smoke.js` asserts against the built bundle; `harness.html` shows it in a browser, with Fluent stood in for |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
