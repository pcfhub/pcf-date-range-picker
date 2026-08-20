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

**Both dates are whole days.** The control works in calendar days throughout and
ignores any time component. Bind **Date Only** columns.

**Dates are read and written in local calendar terms.** A value is interpreted as
the day the user sees, in their own timezone, for every Dataverse date behaviour
(User Local, Date Only and Time Zone Independent). This is the behaviour that
avoids the classic off-by-one, where a date saved in one timezone reads back a day
earlier in another.

**Validation gates the write, not just the display.** When the pair breaks a rule —
end before start, same day where that is not allowed, or either date outside
`minDate`/`maxDate` — the control renders a message and does **not** hand the pair
back to the platform. The columns therefore never hold a range that contradicts
itself. A half-filled pair is not an error; requiredness is the platform's to
enforce.

**Clearing writes blank.** Emptying either field clears that column rather than
leaving its previous value in place.
