---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- Two **Date Only** columns on the same table, one for the start and one for the
  end of the range.
- **Code components for canvas apps** switched on at the environment level, for
  canvas and custom page use only. Model-driven forms need nothing extra.
- No premium licence. The control declares
  `<external-service-usage enabled="false" />` because it never leaves the browser.

The control uses React and Fluent UI from the platform rather than bundling them,
so the environment must be on a release that serves them — any current environment
is.
