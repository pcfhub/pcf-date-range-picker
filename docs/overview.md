---
title: Overview
description: What Date Range Picker does, and when to reach for it.
order: 1
---

# Date Range Picker

Date Range Picker puts a start date and an end date side by side, validates that
they make a range, and writes both back to their own columns. It replaces the
usual arrangement of two unrelated date fields that only disagree with each other
once somebody saves.

::image{src=media/screenshot.png alt="From and To date inputs side by side, with the duration 21 days, 8/26/2026 to 9/15/2026 written beneath them" zoom}

## Why this one

- **It knows the two dates are related.** An end before the start is caught in the
  control and never written, so the columns cannot hold a backwards range.
- **It gets the day right.** Dates and timezones are the most common source of
  off-by-one bugs in Power Apps controls. This one reads and writes calendar days
  from local components throughout, so a user in Auckland and a user in Mexico City
  see the day they picked.
- **It respects each column separately.** Field-level security, validation errors
  and read-only state are read per column, because a user can be permitted one and
  denied the other.
- **It stays small.** React and Fluent come from the platform, not from the bundle,
  and the date fields are the browser's own — so the calendar, keyboard handling
  and locale come free rather than as another 100KB.

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
