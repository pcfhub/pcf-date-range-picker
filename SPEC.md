# pcf-date-range-picker — scaffolded, built, and packed

Picked to exercise three things nothing in the repository had: a control that
genuinely spans **two** columns, a `getOutputs()` returning more than one value,
and **dates** — and therefore timezones, which the skill had no section on at all.

Adopted from `_template` with `--framework react`. Verified with Microsoft's own
tooling and with timezone-shifted tests.

| Step | Result |
| --- | --- |
| `npm run check` | passes, including the control-shape check |
| `npm run lint` | clean |
| `npm run build` | `out/controls/DateRangePicker/bundle.js`, **24.3 KiB** |
| `msbuild` Release pack (clean tree) | production: **6,317 bytes**, both zips |
| `range.ts` tests | 25 assertions, green under UTC-6 and UTC+12 |

**6,317 bytes is smaller than `pcf-star-rating`'s 9,090**, despite this control
having more UI and using React. That is the whole `react_virtual` argument in one
number: React and Fluent resolve to `Reactv16` and `FluentUIReactv940` as externals
and never enter the bundle. Confirmed by grep on the production bundle, not by
reading `package.json`.

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

## Still open

- `media/logo.png` is the template placeholder and `media.screenshots` is empty.
  The docs reference no images, so nothing is broken — but the component page will
  carry the placeholder.
- Not imported into a real environment. The per-column security and business-rule
  error paths are read-correct against the real typings and compile, but are not
  observed.
- The `Behavior` conclusion is drawn from the platform's own typings and from
  timezone tests of the boundary functions, not from a live environment with a
  column of each behaviour.
- No GitHub repo yet; local `git init` only, nothing pushed, no tag.
