# Date Range Picker

A start and end date pair with range validation.

[![Build](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-date-range-picker/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-date-range-picker), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Puts a start date and an end date side by side, validates that they make a range,
and writes both back to their own columns — replacing the usual arrangement of two
unrelated date fields that only disagree with each other once somebody saves.

**It binds two columns, which is the exception to the usual rule rather than a
lapse from it.** A field control binds its first bound property to the column it is
placed on and renders every additional one as its own column picker in the maker's
configuration pane. For a control that attaches to one column that second picker is
a wrong question — which is why `pcf-choices-picker` reverted to a single
type-grouped property. A date range genuinely *is* two columns, so here the second
picker is how the pair gets configured. The distinguishing question is whether the
maker should be asked, not how many properties there are.

**The dates are the browser's own `<input type="date">`.** Fluent 9's date picker
lives in `@fluentui/react-datepicker-compat`, which is not one of the platform
libraries — importing it would bundle it and its calendar dependency and undo the
reason to be a virtual control at all. The native input brings the calendar,
keyboard handling and locale for free, and its value is always `yyyy-mm-dd`
regardless of display locale, which removes a class of parsing bugs outright.

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
| `allowSameDay` | TwoOptions | input | `true` | Whether a one-day range is valid |
| `showDuration` | TwoOptions | input | `true` | Show how many days the range covers |

`getOutputs()` returns **both** bound values on every call, and emits `null` rather
than `undefined` to clear one — `undefined` means "no change", which a canvas app
honours strictly, so a field bound that way simply refuses to empty.

An invalid pair is rendered but never handed back to the platform, so the columns
cannot hold a range that contradicts itself. A half-filled pair is not an error;
requiredness is the platform's to enforce.

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

Five presets cover a normal range, a single day, the validation state, a bounded
window, and the empty pair.

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
```

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
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
