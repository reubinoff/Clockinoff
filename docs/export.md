---
title: Export CSV & PDF
layout: default
nav_order: 8
---

# Export CSV & PDF
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Clockinoff produces two kinds of downloads: a **CSV** you can open in a
spreadsheet or hand to your accountant, and a **PDF** summary suitable
for invoices and timesheet snapshots.

Both are generated from the `/app/export` page and cover **closed
entries only** — a running timer is not included until you stop it.

---

## The export form

Go to `/app/export`. You will see:

- **From** — start date (inclusive). Required.
- **To** — end date (inclusive). Required.
- **Format** — pick **CSV** or **PDF**.
- **Download** — opens the export in a new browser tab. The browser
  triggers the download automatically.

Defaults: **From** is 30 days before today, **To** is today. Both dates
are interpreted in your account timezone.

If either date is missing or invalid, the server returns a validation
error. If `From` is after `To`, you also get a validation error.

---

## CSV format

The CSV has a header row followed by one row per entry. Columns:

| Column | Contents |
|---|---|
| `date` | Entry start date in your timezone (`YYYY-MM-DD`). |
| `start` | Start time (`HH:MM`) in your timezone. |
| `end` | End time (`HH:MM`) in your timezone. |
| `duration` | Duration as decimal hours (e.g. `1.25`). |
| `description` | The description you typed. |
| `project` | Project name, or blank. |
| `client` | Client name, or blank. |
| `tags` | Comma-separated tag names, or blank. |
| `billable` | `yes` / `no`. |
| `rate` | Effective rate, formatted to 2 decimals, or blank. |
| `amount` | Billable amount (`duration × effective_rate`), 2 decimals, or blank. |

If there are no entries in the range, the CSV still contains a **header
row** and nothing else — the response is `200 OK`, not an error.

---

## PDF format

The PDF is generated with `@react-pdf/renderer` and contains:

- A title header with the date range.
- A table of entries with the same columns as the CSV, formatted for
  print.
- A totals footer showing total hours and total billable amount.

Empty date ranges produce a valid PDF that says "No entries" rather than
an error.

---

## Time zone details

- Dates in the form are interpreted **in your timezone**, i.e. `From =
  2025-09-01` means midnight local time on 1 September.
- `date`, `start`, and `end` in the CSV/PDF are rendered in your
  timezone.
- Underneath, entries are stored in UTC; the export handles the
  conversion for you (including day-boundary rounding).

Change your timezone from the [Account]({{ '/account' | relative_url }})
page if the exports look off by hours.

---

## Filters (via URL / API)

The export page uses the underlying `/api/export/csv` and
`/api/export/pdf` endpoints, which accept extra optional query
parameters:

- `project_id`
- `client_id`
- `tag_id`
- `billable=true|false`

These are not exposed as controls in the v1 UI but are respected if you
call the endpoint directly (for example from a script).
