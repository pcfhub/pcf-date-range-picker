---
title: Overview
description: What Date Range Picker does, and when to reach for it.
order: 1
---

# Date Range Picker

Date Range Picker is one field on the form. Open it and a two-month calendar
appears: click the first day, click the last, and the range is drawn between
them. Quick ranges sit beside it for the periods people actually pick, and both
dates are written back to their own Dataverse columns.

It replaces the usual arrangement of two unrelated date fields that only
disagree with each other once somebody saves.

::image{src=media/screenshot.png alt="A single date range field reading 20 Aug 2026 to 28 Aug 2026, with its calendar open beneath: a column of quick ranges on the left, two months of days on the right, and the chosen range shaded from one end to the other" zoom}

## Why this one

- **The range is one gesture, not two dates.** Click a start, click an end. The
  days between them shade as you move the pointer, so the range you are about to
  choose is visible before you commit to it — and clicking the two days in the
  wrong order swaps them rather than showing you an error.
- **Quick ranges for the periods people pick.** Today, the last 7 or 30 days,
  this or last month, this year, the next 7 or 30 days, next month. The maker
  chooses which appear, and a range already matching one of them shows that
  shortcut as selected.
- **It gets the day right.** Dates and timezones are the most common source of
  off-by-one bugs in Power Apps controls. This one reads and writes calendar days
  from local components throughout, so a user in Auckland and a user in Mexico
  City see the day they picked.
- **It looks like the form it is on.** Fluent's design tokens rather than
  hard-coded colours, so it follows the app's theme, its brand colour and dark
  mode. The field is the platform's own 32px filled field, down to the focus
  underline.
- **It respects each column separately.** Field-level security, validation errors
  and read-only state are read per column, because a user can be permitted one
  and denied the other.
- **It stays small.** React and Fluent come from the platform rather than from the
  bundle, and the calendar is the control's own rather than another package.

## What it works with

:::callout{type=info}
Date Range Picker works in **model-driven forms**, **canvas apps** and **custom
pages**. It binds two **Date Only** columns and needs no special privileges: it
makes no Web API calls, uses no device features, and reaches no third-party
service.
:::

Place it on the column holding the **start** date. The maker is then asked which
column holds the end date — that second column picker is how the pair is
configured, not a misconfiguration.
