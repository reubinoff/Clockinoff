---
title: Projects
layout: default
nav_order: 5
---

# Projects
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Projects are the primary way to group entries. Each project can be
attached to a **Client**, and can carry a **default billable** flag and
**default rate** that new entries inherit.

Manage projects at `/app/projects`. On desktop, open **Library** in the
top nav and pick **Projects**. On a phone, tap the **Library** tab
(then the Projects segment if you landed on another library page).

When you have no projects yet the page shows the nudge:

> No projects yet — add one so timers stay organized.

---

## Add a project

Fill in the form at the top of the Projects page:

- **Name** (required) — free text.
- **Client** — pick from your existing clients, or leave as **No client**.
  Only non-archived clients appear in the dropdown. Add clients first on
  [Clients]({{ '/clients' | relative_url }}) if the list is empty.
- **Default rate** — an optional non-negative number. Used only when the
  entry (or the project) is marked billable.
- **Billable** — toggle if entries under this project default to
  billable. Note that entries themselves default to **billable = on**
  regardless (see [Using the timer]({{ '/timer' | relative_url }}#details-collapsed-by-default));
  this per-project flag only matters if you want a specific project's
  entries to default the other way.

Click **Add**. The new project appears at the top of the table.

---

## Project table

| Column | Meaning |
|---|---|
| Name | Project name. |
| Client | Attached client, or `—`. |
| Billable | `Yes` if the project defaults to billable, else `No`. |
| Rate | Default rate as a plain number (currency is not enforced — see [FAQ]({{ '/faq' | relative_url }}#currency)). |
| Status | `Active` or `Archived`. |

Actions per row:

- **Archive / Unarchive** — hide the project from active dropdowns
  (like the timer bar) without deleting it. Archived projects keep their
  history and continue to appear on old entries and in exports.
- **Delete** — permanently remove the project.  Time entries that were
  attached to the project keep their `project` column blank going
  forward, but the historical amount / rate that was already computed
  stays on the entry.  A browser confirm asks first.

Both archived and active projects are listed here (with a status column);
the archived ones are hidden from the timer bar's project selector.

---

## How rates work

When you start a timer against a project:

- The **effective rate** for the entry is `entry.rate ?? project.default_rate`.
- If **Billable** is on for the entry, `amount = duration_hours * effective_rate`.
- If **Billable** is off, `amount` is null and the export shows a blank
  amount cell.

If you change the project's `default_rate` **later**, entries that were
already closed keep the amount they were saved with. Only new entries
inherit the new default.

Marking the project as billable by default just pre-fills the
**Billable** switch on the timer bar; you can still toggle it off per
entry. Entries default to **billable = on** even without a project, so
turning this on is only necessary if a specific project's default
should differ from the global one.

---

## Archiving vs deleting

Prefer **Archive**:

- To keep exports and totals accurate for old work.
- When a project has ended but might come back.

Use **Delete** only if a project was created by mistake and you are sure
you never want it in a dropdown or on an entry again. Existing entries
survive the deletion but lose their link to the project name.
