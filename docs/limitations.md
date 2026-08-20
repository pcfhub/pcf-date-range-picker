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

- **The calendar popup is the browser's, not Fluent's.** The date fields are
  native `<input type="date">`. That is a deliberate trade: Fluent's own date
  picker is not one of the libraries the platform provides, so using it would mean
  bundling it and roughly five times the download for every user. In exchange the
  calendar looks like the operating system rather than like the rest of the form,
  and it differs between browsers.

- **No presets.** There is no "last 30 days" or "this quarter" shortcut. The
  control edits two columns; a shortcut belongs in a business rule or a canvas
  formula that sets the variables.

- **Bounds are static on a model-driven form.** `minDate` and `maxDate` are set by
  the maker at configuration time. A rolling window such as "the next 90 days"
  needs a business rule, or a canvas app where the bounds can be formulas.

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
