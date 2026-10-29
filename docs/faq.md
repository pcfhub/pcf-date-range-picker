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

The column type. Date Range Picker binds **Date Only** and **Date and Time**
columns, and the form designer hides a component from every column it cannot
bind to. Any other type will not offer it. Versions before 0.3.0 bound Date
Only columns alone.

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

The usual cause is the column's **Behavior** rather than its format. A column can
show as Date Only in the maker portal and still behave as **User Local**, which
stores the value as UTC — and a whole day kept as an instant moves for anyone in a
different timezone from the one that saved it. Both ends shifting by exactly one
day is the giveaway.

From 0.2.5 the control reads each column's Behavior and handles both, so this
should no longer happen either way. **Date Only** remains the right behaviour for
a date range because it stores a day rather than a moment.

If you are on an earlier version, upgrading is the fix. See
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

From the list, yes. Since 0.4.1 it has any number of days back or ahead
(`last90`, `next14`, any count up to 366), weeks, quarters, years, *to date*
ranges and the fiscal year. The [API reference](api) has every token. Set
**Quick ranges** to the comma-separated list you want, in any order, or to an
empty string for none. A range with a name and a start of your own, such as
"the current sprint", is not configurable. It belongs in a business rule or a
canvas formula that sets the two variables directly.

## Where does the fiscal year start?

Where the organisation's **Fiscal Year Settings** say, on a model-driven form.
The control reads the start month once, through the Web API, and only when a
fiscal range is listed. Set **Fiscal year starts in** to a month to override
that, or to get the same answer in a canvas app, where there is no
organisation to ask and the fiscal year otherwise starts in January.

## Can the bounds move with the date?

Yes, since 0.4.1. **Earliest, in days from today** and **Latest, in days from
today** take a number of days, negative for the past: `-30` and `90` allow
the last thirty days through the next ninety. They combine with the fixed
**Earliest date** and **Latest date**, and the tighter of each pair applies.

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

Yes, from 0.3.0. Place it on a **Date and Time** column and a time box appears
beside each date in the popover; the field then reads, say,
*9/18/2026 8:30 AM – 9/19/2026 3:15 AM* and the duration counts hours and
minutes. Nothing needs configuring — the control follows the column. The
**Time of day** property is there for two cases: a canvas app, where there is
no column to follow and **Show** turns times on; and a Date and Time column
you would rather treat as whole days, where **Hide** does that.

The two columns need not match. A Date Only start with a Date and Time end
gets a whole day on one side and a moment on the other.

## Whose clock is the time on?

The **Dataverse user's** — the timezone in their personal options — which is
the clock every other date on the form uses. It is not the browser's, and the
two can differ: a user whose Windows clock is set to one zone and whose
Dataverse options say another sees the Dataverse one, in this control and in
the native field alike. A Time Zone Independent column shows the same wall
clock to everyone by design, and the control leaves it alone.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-date-range-picker/issues>, with the
platform version and the control version from the solution.
