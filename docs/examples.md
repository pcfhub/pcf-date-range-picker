---
title: Examples
description: Worked configurations of Date Range Picker.
order: 6
---

# Examples

## A booking window

Two Date Only columns, any length of stay including a single night.

| Property | Value |
| --- | --- |
| Start date | the check-in column |
| End date | the check-out column |
| Earliest date | *(empty)* |
| Latest date | *(empty)* |
| Same day | `allow` |
| Duration | `show` |
| Quick ranges | `today,next7,next30,nextMonth` |

The duration line reads "9 days, 20/08/2026 to 28/08/2026", formatted in the user's
own locale rather than the author's. A one-night stay reads "1 day, 20/08/2026".

The quick ranges here are the future-facing ones, since a booking is made ahead
of itself. A reporting field would use `today,last7,last30,thisMonth,lastMonth`
instead — the same control, a different rail.

## A project phase, at least two days long

| Property | Value |
| --- | --- |
| Start date | the phase start column |
| End date | the phase end column |
| Same day | `block` |
| Duration | `show` |
| Quick ranges | *(empty)* |

Choosing the same day for both now shows "The range must cover more than one day."
and the pair is not written until it is changed. An empty **Quick ranges** hides
the rail, leaving the calendar on its own — right where no standard period
applies.

## A leave request inside the next quarter

Bounds grey out every day outside the window, so an impossible date cannot be
clicked at all rather than being clicked and then refused. With nothing chosen
yet, the calendar opens on the bounds rather than on today — a window that starts
next quarter would otherwise open on a month in which every day is disabled.

| Property | Value |
| --- | --- |
| Start date | the leave start column |
| End date | the leave end column |
| Earliest date | the first day of the quarter |
| Latest date | the last day of the quarter |
| Same day | `allow` |
| Quick ranges | `next7,next30,nextMonth` |

:::callout{type=info}
In a canvas app these bounds can be formulas — `Today()` and
`DateAdd(Today(), 90, TimeUnit.Days)`. On a model-driven form they are fixed
dates set by the maker, so a rolling window is better expressed with a business
rule.
:::
