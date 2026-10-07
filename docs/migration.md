---
title: Migration
description: Moving between versions.
order: 9
appliesTo: ">=0.2.0"
---

# Migration

## 0.3.0 or 0.3.1 → 0.3.2

**On a model-driven form: nothing to do, and nothing changes.**

**In a canvas app, what the control shows changes, because it was wrong.**
0.3.0 and 0.3.1 read every canvas date on the UTC clock and showed a time
beside it, asked for or not. 0.3.2 reads it on the device's clock.

| | 0.3.0 – 0.3.1 | 0.3.2 |
| --- | --- | --- |
| `Date(2026, 10, 6)` in Mexico City | 10/6/2026 6:00 AM | 10/6/2026 |
| The same in Berlin | 10/5/2026 10:00 PM | 10/6/2026 |
| A time, with `time` left on `"auto"` | shown, on the UTC clock | not shown |
| A time, with `time` set to `"show"` | shown, on the UTC clock | shown, on the device's clock |

One thing to do, and only if your app shows times: **set `time` to `"show"`.**
Under `"auto"` a canvas app now gets whole days, which is what this page and
the property's description always said. The values your formulas hand in and
read back are moments, as before; a whole day now comes back at midday of the
day picked rather than at a UTC hour.

**Importing the solution does not update a canvas app that already has the
control.** A published app carries its own copy. Open the app in Studio,
accept the update if Studio offers one, then **save and publish** — and if
Save is greyed out, change any formula first so there is something to save.
Publishing an app Studio considers unchanged left the old build in place when
this was tested. Check a date in the published app afterwards: under 0.3.2 a
whole day shows no time.

## 0.2.x → 0.3.0

Nothing to do. 0.3.0 widens the two bound properties so the control can also
be placed on **Date and Time** columns; a control already placed on Date Only
columns stays bound through the upgrade — checked on a live form, where the
existing placement came back bound and reading the same days. Whole-day
behaviour, values and the property names are unchanged. The one addition is
the optional `time` input, which defaults to following the column.

## 0.1.x → 0.2.0

0.2.0 replaces the two side-by-side date fields with a single field that opens a
two-month range calendar. The columns it binds and the values it writes are
unchanged, so **existing records need nothing done to them**. Two input
properties were renamed, and those do need attention.

### The two renamed properties

| 0.1.x | 0.2.0 | Values |
| --- | --- | --- |
| `allowSameDay` (yes/no) | `sameDay` | `allow` (default) or `block` |
| `showDuration` (yes/no) | `duration` | `show` (default) or `hide` |

:::callout{type=warning}
This is a breaking change for anything that referred to the old names. In a
**canvas app**, a formula reading `DateRangePicker1.AllowSameDay` or
`.ShowDuration` errors until you re-bind it to `.SameDay` or `.Duration`. In a
**model-driven form**, the old settings are dropped on upgrade and the new
defaults apply.
:::

**The new defaults are what the documentation always claimed**, so for most
installations dropping the old settings changes nothing visible. If you had
either property switched *off*, set it again:

- same-day ranges previously disallowed → set **Same day** to `block`
- the duration line previously hidden → set **Duration** to `hide`

### Why they were renamed rather than kept

Both properties were declared as `TwoOptions` with `default-value="true"`, and
that combination cannot work. A `TwoOptions` property arrives as a plain
boolean, so there is no value meaning "the maker never touched this" — a maker
who left either alone got `false`, not `true`. The shipped 0.1.x control
therefore **blocked same-day ranges and hid the duration by default**, which is
the opposite of what its own property descriptions said.

An `Enum` carries a real default. Renaming was the cost of fixing the defaults,
and 0.2.0 is the right moment to pay it.

### The new property

`presets` is new and optional. It takes a comma-separated list of quick ranges
to offer beside the calendar — `today`, `thisWeek`, `last7`, `last30`,
`thisMonth`, `lastMonth`, `thisYear`, `next7`, `next30`, `nextMonth` — and
defaults to `today,last7,last30,thisMonth,next7,next30`. Set it to an empty
string for a calendar with no rail. Unknown tokens are ignored.

### What did not change

- **The columns.** Still two **Date Only** columns, still bound the same way,
  still written with the same values.
- **The validation.** An invalid pair is still shown and still never written.
- **The timezone handling.** Calendar days are still read and written from local
  components throughout.
- **`minDate` and `maxDate`.** Unchanged, and now used to disable days in the
  calendar rather than only to refuse them afterwards.
