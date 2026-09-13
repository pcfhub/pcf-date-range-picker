---
title: Canvas apps
description: Adding Date Range Picker to a canvas app or custom page.
order: 3
---

# Using it in a canvas app

:::steps
1. From **Insert -> Get more components**, open the **Code** tab and import
   **Date Range Picker**.
2. Place it from **Insert -> Code components**.
3. Bind the properties below.
:::

:::callout{type=warning}
**Bind both dates to variables, not to fixed dates.** A canvas code component does
not write back to its own inputs: it raises `OnChange` and the app decides what to
store. Bound to a constant, every edit is overwritten on the next render and the
control appears frozen — even though `OnChange` is firing correctly each time.
:::

### 1. Create the variables

In `App.OnStart`, or the screen's `OnVisible`:

```powerfx
Set(varStart, Today());
Set(varEnd, DateAdd(Today(), 7, TimeUnit.Days))
```

:::callout{type=warning}
The time unit must be written **`TimeUnit.Days`**, not `Days`. A bare `Days` is
not a name Power Fx resolves, and the formula fails to save with an error about
an unrecognised identifier. The same applies to `TimeUnit.Months`,
`TimeUnit.Years` and the rest.
:::

### 2. Bind the variables to the two date properties

This is the step that decides whether the control works at all, and it is not
the same as typing a date into the properties pane.

:::steps
1. Select the control on the canvas.
2. In the formula bar's property dropdown — the one on the left, which starts
   on `OnChange` — choose **startDate**.
3. Type `varStart` into the formula bar. Not a date, not `Today()`: the name of
   the variable.
4. Choose **endDate** in the same dropdown and type `varEnd`.
:::

The properties are named `startDate` and `endDate` in the formula bar, matching
the manifest, while the **Advanced** pane on the right shows the same two under
their display names **Start date** and **End date**. Either place works; they
are the same property.

Both must be a variable. Binding `startDate` to `Today()` or to a fixed date
looks right and then behaves as though the control is locked — see the warning
above.

### 3. The full property list

For reference, with the two bindings from step 2 at the top. Everything below
them takes a plain value and can be set in the **Advanced** pane:

| Property | Formula-bar name | Value |
| --- | --- | --- |
| Start date | `startDate` | `varStart` — a variable, never a literal |
| End date | `endDate` | `varEnd` — a variable, never a literal |
| Earliest date | `minDate` | `Today()` (optional) |
| Latest date | `maxDate` | `DateAdd(Today(), 90, TimeUnit.Days)` (optional) |
| Same day | `sameDay` | `"allow"` or `"block"` (optional, defaults to allow) |
| Duration | `duration` | `"show"` or `"hide"` (optional, defaults to show) |
| Time of day | `time` | `"show"` to offer a time beside each date; `"auto"` (the default) means whole days in a canvas app, where there is no column to follow |
| Quick ranges | `presets` | `"today,last7,last30,thisMonth,next7,next30"` (optional) |

### 4. Write the changes back

Select **OnChange** in the formula bar and set the two variables from the
control's own outputs:

```powerfx
Set(varStart, DateRangePicker1.startDate);
Set(varEnd, DateRangePicker1.endDate)
```

This closes the loop. The control raises `OnChange`, the app stores the result
in the variables, and the variables feed straight back into `startDate` and
`endDate` on the next render — which is why step 2 has to be a variable and not
a value.

`OnChange` fires only when the pair is valid, so a range with the end before the
start never reaches your formula. The control shows the user why — though from
the calendar that is hard to reach at all, since clicking the earlier day second
swaps the pair rather than refusing it.

## Saving to a record

The variables hold the range; patch them wherever the record lives:

```powerfx
Patch(Bookings, ThisItem, { CheckIn: varStart, CheckOut: varEnd })
```

:::callout{type=info}
A canvas app has no Dataverse column behind the control, so there is no column
metadata and no field-level security to read. Both are simply absent rather than
restrictive, so the control behaves as though everything is readable and
editable.
:::
