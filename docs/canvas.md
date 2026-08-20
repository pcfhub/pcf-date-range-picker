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

Create the variables first, in `App.OnStart` or the screen's `OnVisible`:

```powerfx
Set(varStart, Today());
Set(varEnd, DateAdd(Today(), 7, Days));
```

Then point the control at them:

| Property | Value |
| --- | --- |
| Start date | `varStart` — a variable, never a literal |
| End date | `varEnd` — a variable, never a literal |
| Earliest date | `Today()` (optional) |
| Latest date | `DateAdd(Today(), 90, Days)` (optional) |
| Allow same day | `true` |
| Show duration | `true` |

## Reading the output

```powerfx
// OnChange
Set(varStart, DateRangePicker1.startDate);
Set(varEnd, DateRangePicker1.endDate)
```

`OnChange` fires only when the pair is valid, so a range with the end before the
start never reaches your formula. The control shows the user why.

:::callout{type=info}
A canvas app has no Dataverse column behind the control, so there is no column
metadata and no field-level security to read. Both are simply absent rather than
restrictive, and the control behaves as though everything is readable and editable.
:::
