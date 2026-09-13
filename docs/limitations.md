---
title: Limitations
description: What Date Range Picker does not do.
order: 7
---

# Limitations

- **Times are to the minute, on the Dataverse user's clock.** From 0.3.0 the
  control binds **Date and Time** columns as well as Date Only ones, and offers
  a time box beside each date. The time shown and the time typed are both on
  the clock of the *Dataverse user* — the timezone in their personal options,
  which is what every other date on the form uses — and not the browser's,
  which can differ by an hour or more. The box works in minutes; a column that
  already holds seconds keeps them until the time is changed.

- **A Time Zone Independent column holds a wall clock, and so does the box.**
  Nothing is converted for that behaviour: 08:30 typed is 08:30 stored and
  08:30 shown to every user, wherever they are. That is what the behaviour is
  for, and the control does not second-guess it.

- **The calendar is the control's own, not Fluent's and not the browser's.**
  Fluent's date picker lives in a package the Power Platform does not provide, so
  using it would mean bundling it and roughly five times the download for every
  user. This calendar is built on the Fluent design tokens the platform *does*
  provide, so it matches the form — but it is this control's code, and anything
  Fluent's picker gains in a later release does not arrive here for free. The
  typed **From** and **To** fields inside the popover are still the browser's
  own `<input type="date">`, so they look and behave like the operating
  system's.

- **Ten quick ranges, and no custom ones.** `presets` chooses from a fixed list:
  `today`, `thisWeek`, `last7`, `last30`, `thisMonth`, `lastMonth`, `thisYear`,
  `next7`, `next30`, `nextMonth`. A shortcut outside that list — "this fiscal
  quarter", "the current sprint" — is not configurable and belongs in a business
  rule or a canvas formula. Unknown tokens are ignored rather than treated as an
  error, so a typo costs one button rather than the rail.

- **Weeks start where the organisation says.** The first day of the week, the day
  names and the month names all come from the user's Dataverse date settings.
  There is no property to override them, and a host that publishes no date
  settings — a canvas app, or `npm start` — falls back to Sunday-first English
  column headers while every date shown still uses the platform's own formatting.

- **No week numbers, and no month or year jump.** Paging is one month at a time
  with the arrows, or a month at a time from the keyboard with `Page Up` and
  `Page Down`; `Shift` with either jumps a year.

- **Bounds are static on a model-driven form.** `minDate` and `maxDate` are set by
  the maker at configuration time. A rolling window such as "the next 90 days"
  needs a business rule, or a canvas app where the bounds can be formulas.

- **The picker is read-only unless both columns are writable.** The control edits
  one range, and half a range is not one — so a read-only end date, or an end date
  the user may not see, leaves the whole picker read-only rather than opening a
  calendar that can only commit one end. What the user *may* read is still shown:
  a denied column reads "Hidden" rather than blank.

- **A Date Only column still wants the Date Only *behaviour*, not just the
  format.** Dataverse lets each column be User Local, Date Only or Time Zone
  Independent, and this is separate from the column's format — a column can
  read as Date Only in the maker portal while behaving as **User Local**, which
  stores the value as UTC. On such a column a whole day is kept as an instant,
  so it can come back as the day before or after for anyone whose timezone
  differs from the one it was saved in. The symptom is unmistakable once seen:
  a range saved as 6 Sep – 31 Oct reads back as 5 Sep – 30 Oct, both ends off
  by exactly one day.

  From 0.2.5 the control reads each column's **Behavior** and handles both: a
  Date Only column hands its value over at UTC midnight and the day is read from
  there, while a User Local column is a real instant and is read locally. Dates
  are written back at midday in whichever frame the column uses, so neither
  conversion can land on a day boundary.

  **Date Only is still the right behaviour for a date range**, because it stores
  a day rather than a moment — but the control no longer depends on your
  choosing it. If you do change it, note that the change is one-way and does not
  convert existing rows.

- **Validation blocks the write, not the save.** An invalid pair is never handed to
  the platform, so the columns keep their previous values and the form can still be
  saved with them. If a range must exist before saving, mark the columns required.

- **Five languages.** English, Spanish, French, German and Japanese. Any other user
  language falls back to English. Adding one is a `.resx` file and a line in the
  manifest — [open an issue](https://github.com/pcfhub/pcf-date-range-picker/issues).
