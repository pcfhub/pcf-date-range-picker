---
title: Limitations
description: What Date Range Picker does not do.
order: 7
---

# Limitations

- **Whole days only.** The control binds **Date Only** columns and works in
  calendar days. It does not offer times, and it will not appear on a Date and
  Time column — a time component would be silently discarded, which is worse than
  not supporting it.

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

- **The two columns should share a date behaviour.** Dataverse lets each column be
  User Local, Date Only or Time Zone Independent. The control reads both in local
  calendar terms, which is correct for each behaviour on its own — but a pair split
  across two different behaviours can still disagree about what "the same day"
  means for users in other timezones. Give both columns the same behaviour;
  **Date Only** is the right one for a date range.

- **Validation blocks the write, not the save.** An invalid pair is never handed to
  the platform, so the columns keep their previous values and the form can still be
  saved with them. If a range must exist before saving, mark the columns required.

- **Five languages.** English, Spanish, French, German and Japanese. Any other user
  language falls back to English. Adding one is a `.resx` file and a line in the
  manifest — [open an issue](https://github.com/pcfhub/pcf-date-range-picker/issues).
