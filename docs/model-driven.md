---
title: Model-driven apps
description: Adding Date Range Picker to a form.
order: 4
---

# Using it on a model-driven form

:::steps
1. Open the form in the modern form designer.
2. Select the column holding the **start** date.
3. Under **Components -> Add component**, choose **Date Range Picker**.
4. When asked for **End date**, choose the column holding the end of the range.
5. Enable it for **Web**, **Phone** and **Tablet** as appropriate.
6. Save and publish.
:::

:::callout{type=info}
Step 4 is the part that looks unusual. Most code components bind to exactly one
column, so being asked for a second one reads like a mistake. It is not — a date
range genuinely is two columns, and this is how you say which one holds the end.
:::

## Column types

| Column type | Supported | Notes |
| --- | --- | --- |
| Date Only | Yes | Whole days. |
| Date and Time | Yes | From 0.3.0. A time box beside each date; the time is on the Dataverse user's clock, as the native field's is. |
| Anything else | No | The control does not appear in the component list for the column. |

## Form state it honours

- **Read-only fields** and read-only forms render the range without opening a
  calendar. The picker edits one range, so it needs both columns writable: a
  read-only end date leaves the whole field read-only rather than opening a
  calendar that could only commit one end.
- **Field-level security is read per column.** A user permitted the start date and
  denied the end date sees exactly that — the start date, and "Hidden" in place of
  the end — rather than the whole control disappearing or, worse, an empty end
  date that looks like missing data. Denied both, they are told so.
- **Business rule and validation errors** are surfaced per column, underneath the
  field they belong to, and kept separate from the control's own range message —
  they are different failures and one should not hide the other.
- **The field label** from the form is used as the accessible name of the range
  field and of the calendar that opens from it.
- **The user's date settings** decide the first day of the week and the month and
  day names, and every date shown is formatted by the platform rather than by the
  browser — so the calendar agrees with the rest of the form.

:::callout{type=info}
The control is localised into English, Spanish, French, German and Japanese. The
language follows the user's own setting; there is nothing to configure per form.
:::
