---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control.

  kind: input | bound | output | dataset | dataset_column
-->

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Notes

**Two bound properties, and that is deliberate.** Most code components bind one
column. This one binds two, because a date range is two columns. Place the control
on the start date; the end date is chosen in the configuration pane. Both are
written back, and both appear in the outputs.

**A column's format decides whether it carries a time.** On a Date Only column
the control works in whole days; on a Date and Time column it offers a time
beside the date, and the two columns are judged separately. `time` overrides
that per control: `show` for a canvas app, where there is no column to read,
and `hide` to keep a Date and Time column to whole days. Its default, `auto`,
follows the column.

**Values are read and written on the user's own clock.** A whole day is the day
the user sees, for every Dataverse date behaviour (User Local, Date Only and
Time Zone Independent) — the behaviour that avoids the classic off-by-one,
where a date saved in one timezone reads back a day earlier in another. A time
is the time the Dataverse user's form shows, converted out of their timezone
for a User Local column and left alone for a Time Zone Independent one.

**Validation gates the write, not just the display.** When the pair breaks a rule —
end before start, same day where that is not allowed, or either date outside
`minDate`/`maxDate` — the control renders a message and does **not** hand the pair
back to the platform. The columns therefore never hold a range that contradicts
itself. A half-filled pair is not an error; requiredness is the platform's to
enforce.

**Picking the two days in either order works.** The first click anchors the
range and the second completes it; clicking an earlier day second swaps the pair
rather than reporting an error. `EndBeforeStart` is therefore reachable only by
typing a date into the **From** or **To** field inside the popover.

**Quick ranges are inclusive of both ends.** `last7` is today and the six days
before it, so the duration line reads seven days rather than eight; a *to date*
range ends today. `presets` takes a comma-separated list of these tokens:

| Kind | Tokens |
| --- | --- |
| Days | `today`, and `lastN` / `nextN` for any N from 1 to 366: `last7`, `last30`, `last90`, `next14`, … |
| Weeks | `thisWeek`, `lastWeek`, `nextWeek`, starting on the organisation's first day of the week |
| Months | `thisMonth`, `lastMonth`, `nextMonth`, `monthToDate` |
| Quarters | `thisQuarter`, `lastQuarter`, `nextQuarter`, `quarterToDate`, calendar quarters |
| Years | `thisYear`, `lastYear`, `yearToDate` |
| Fiscal | `thisFiscalYear`, `lastFiscalYear`, `fiscalYearToDate`, `thisFiscalQuarter`, `lastFiscalQuarter`, counted from `fiscalYearStart` |

Tokens outside that list are ignored, and an empty list hides the rail. The
order shown is the order of the table, not the order typed, so two
configurations of the same set look the same. A rail configured before 0.4.0
looks exactly as it did.

**`fiscalYearStart` says where the fiscal ranges count from.** A month (`jan`
… `dec`) is used as it is. `org`, the default, reads the start month from the
organisation's **Fiscal Year Settings**. That takes one Web API request, made
only when a fiscal range is listed, and the month is read in the user's
timezone. Until the answer arrives, a fiscal range is shown waiting. In a
canvas app, in the hub's demo, or if the read is refused, the fiscal year
starts in January. Fiscal quarters are three-month blocks from that month.

**`minDays` and `maxDays` are bounds that move with today.** Days from today,
signed: `-30` is thirty days ago, `0` today, `90` ninety days ahead. With a
fixed `minDate` or `maxDate` as well, the tighter of each pair applies. Days
outside the bounds are disabled in the calendar, and a typed date outside them
is refused with the same message as a fixed bound. "Today" is the device's
day, the same one the quick ranges and the calendar's highlight use.

**The month heading jumps.** The left month's name is a button that opens a
year with its twelve months. Pick one, or use the arrow keys, Page Up and Page
Down for the year, and Enter. Escape goes back to the days. Months with no day
inside the bounds are disabled.

**`sameDay` and `duration` are choices, not switches.** Both default to the
useful value — `allow` and `show`. They replaced two yes/no properties in 0.2.0
that could not carry a default at all; see [Migration](migration.md).

**Clearing writes blank.** **Clear** in the popover, or emptying either typed
field, clears that column rather than leaving its previous value in place.
