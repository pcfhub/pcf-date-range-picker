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
before it, so the duration line reads seven days rather than eight. `presets`
takes a comma-separated list of `today`, `thisWeek`, `last7`, `last30`,
`thisMonth`, `lastMonth`, `thisYear`, `next7`, `next30` and `nextMonth`; tokens
outside that list are ignored, and an empty list hides the rail. The order shown
is the order above rather than the order typed, so two configurations of the
same set look the same.

**`sameDay` and `duration` are choices, not switches.** Both default to the
useful value — `allow` and `show`. They replaced two yes/no properties in 0.2.0
that could not carry a default at all; see [Migration](migration.md).

**Clearing writes blank.** **Clear** in the popover, or emptying either typed
field, clears that column rather than leaving its previous value in place.
