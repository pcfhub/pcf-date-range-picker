---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Why is it asking me for a second column?

Because a date range is two columns. Place the control on the start date, and the
**End date** property is where you choose the other one. Most code components bind
one column, so the second picker looks like a bug the first time — it is how the
pair is configured.

## Why does the control not appear in the component list?

The column type. Date Range Picker binds **Date Only** columns, and the form
designer hides a component from every column it cannot bind to. A Date and Time
column will not offer it.

## In a canvas app nothing happens when I pick a date. Is it locked?

Almost certainly the dates are bound to fixed values rather than to variables.

A canvas code component cannot write to its own inputs. It raises `OnChange`, and
the app stores the result. Bound to a literal there is nowhere for the change to
go, so the next render puts the old value back and the control looks frozen.
Bind `varStart` and `varEnd`, and set them in `OnChange`.

If it is genuinely locked, the field will be dimmed and will not open — that
means **DisplayMode** is `View` or `Disabled`.

## The date is a day out. Why?

It should not be, and this is worth reporting if you see it. The control reads and
writes calendar days from local components specifically so that a day chosen in one
timezone reads back as the same day in another.

The usual cause when it does happen is the two columns having different date
behaviours in Dataverse. Give both the **Date Only** behaviour — see
[Limitations](limitations.md).

## Why will it not save my range?

The pair breaks one of the rules, and the message under the field says which: the
end is before the start, the range is a single day where that is not allowed, or
a date falls outside the configured bounds. An invalid pair is deliberately never
written, so the columns keep their previous values.

From the calendar the first two are hard to reach — clicking the earlier day
second swaps the pair, and a day outside the bounds is disabled. They are still
reachable by typing into the **From** and **To** fields inside the popover, which
is where the message usually comes from.

## Where did "Allow same day" and "Show duration" go?

They were renamed in 0.2.0 to **Same day** (`allow` / `block`) and **Duration**
(`show` / `hide`), because as yes/no properties they could not carry a default
and both silently started *off*. The new defaults are the ones the documentation
always described. See [Migration](migration.md) — a canvas app referring to the
old names needs re-binding.

## Can I add my own quick range?

Not beyond the ten the control offers: `today`, `thisWeek`, `last7`, `last30`,
`thisMonth`, `lastMonth`, `thisYear`, `next7`, `next30`, `nextMonth`. Set
**Quick ranges** to the comma-separated list you want, in any order, or to an
empty string for none. Something like "this fiscal quarter" belongs in a business
rule or a canvas formula that sets the two variables directly.

## Why does the calendar not look like the Windows one?

Because it is the control's own. Fluent's date picker ships in a package the
Power Platform does not provide, so using it would mean bundling it and roughly
five times the download for every user. This calendar is built from the Fluent
design tokens the platform *does* provide, so it follows the app's theme, brand
colour and dark mode — it is meant to look like the form rather than like the
operating system.

The **From** and **To** fields inside the popover are still the browser's own
`<input type="date">`, which is why those do look like the operating system.

## Can I use it for a date and time range?

Not currently. The control works in whole days. Open an issue if you need times.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-date-range-picker/issues>, with the
platform version and the control version from the solution.
