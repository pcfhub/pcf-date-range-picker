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
| Allow same day | `true` |
| Show duration | `true` |

The duration line reads "9 days, 20/08/2026 to 28/08/2026", formatted in the user's
own locale rather than the author's.

## A project phase, at least two days long

| Property | Value |
| --- | --- |
| Start date | the phase start column |
| End date | the phase end column |
| Allow same day | `false` |
| Show duration | `true` |

Choosing the same day for both now shows "The range must cover more than one day."
and the pair is not written until it is changed.

## A leave request inside the next quarter

Bounds keep the browser's own calendar from offering a day outside the window.

| Property | Value |
| --- | --- |
| Start date | the leave start column |
| End date | the leave end column |
| Earliest date | the first day of the quarter |
| Latest date | the last day of the quarter |
| Allow same day | `true` |

:::callout{type=info}
In a canvas app these bounds can be formulas — `Today()` and
`DateAdd(Today(), 90, TimeUnit.Days)`. On a model-driven form they are fixed
dates set by the maker, so a rolling window is better expressed with a business
rule.
:::
