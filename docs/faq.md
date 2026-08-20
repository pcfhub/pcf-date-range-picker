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

If it is genuinely locked, both fields will be dimmed — that means **DisplayMode**
is `View` or `Disabled`.

## The date is a day out. Why?

It should not be, and this is worth reporting if you see it. The control reads and
writes calendar days from local components specifically so that a day chosen in one
timezone reads back as the same day in another.

The usual cause when it does happen is the two columns having different date
behaviours in Dataverse. Give both the **Date Only** behaviour — see
[Limitations](limitations.md).

## Why will it not save my range?

The pair breaks one of the rules, and the message under the fields says which:
the end is before the start, the range is a single day where that is not allowed,
or a date falls outside the configured bounds. An invalid pair is deliberately
never written, so the columns keep their previous values.

## Can I use it for a date and time range?

Not currently. The control works in whole days. Open an issue if you need times.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-date-range-picker/issues>, with the
platform version and the control version from the solution.
