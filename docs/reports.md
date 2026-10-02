---
title: Reports
layout: default
nav_order: 8
---

# Reports
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Clockinoff ships a single, read-only **Reports** screen at
`/app/reports`. It renders a **Quiet Pulse Summary** of your tracked
hours over a date range — total hours, a bar chart of hours per day, and
a Group by Project list with a matching donut.

It does **not** try to clone a full competitor "Time Report" suite — no
Detailed / Weekly / Shared tabs, no Team filter, no Apply Filter bar, no
rounding toggle, no Create invoice. For the authoritative CSV / PDF
download of a range, use the **Export this range** button in the top-
right of the Reports page, which jumps to the normal
[Export page]({{ '/export' | relative_url }}) with your dates pre-filled.

---

## Opening Reports

- Desktop header: click **Reports** in the primary nav bar.
- Mobile: tap the **Reports** tab in the bottom tab bar.
- Direct URL: `/app/reports`.

The page opens on **This month** (from the 1st of the current month
through today), scoped to your account timezone.

---

## Picking a range

The range chips at the top mirror the ones on the Export page so your
muscle memory carries over:

- **Today**
- **This week** — Monday-first ISO week, from this week's Monday
  through today.
- **Last week** — the whole previous Monday-to-Sunday week.
- **This month** — from the 1st of the current month through today.
- **Last month** — the whole previous calendar month.
- **Custom** — reveals **From** and **To** date inputs. Both are
  inclusive and interpreted in your timezone. If **From** is after
  **To**, the page warns and skips the fetch.

Changing any date flips the chips to **Custom** so the preset label
never lies about what's being summarised.

---

## What the page shows

### Total

The large number is the **sum of closed entries** in the range, in
decimal hours (e.g. `2.49h`). A running timer is **not** included —
stop or discard it first if you want it to count.

The small line underneath restates the range (e.g.
`Sep 1 – Sep 30, 2026`) and the peak day in the chart.

### Bar chart — hours per day

One bar per day in the range, left-to-right in chronological order.
Height is decimal hours. Days with zero tracked time render as a thin
baseline tick — not a gap — so you can tell "I didn't track anything on
Tue Sep 15" apart from "there's no bar at all".

The y-axis snaps to a readable round-hours top (1h minimum). Hover (or
tap) a bar to see the full `Weekday Mon dd: X.XXh` tooltip. The chart
uses the Quiet Pulse accent purple on both light and dark themes.

### By project

A list of every project represented in the range, sorted by hours
descending. Each row shows a color dot (same per-project color used in
the entries list), the project name, the share of the range total as a
percentage, and the hours.

Entries without a project are grouped under a muted **No project**
bucket at the end if there are any.

### Distribution donut

The donut right next to the project list renders the same groups as
proportional ring segments, with the range total in the center. The
segment colors match the project list dots so you can read either side
first.

---

## Export this range

The **Export this range** button in the top-right of the Reports page
hands your current **From** / **To** off to the Export page, which uses
the same `/api/export/csv` and `/api/export/pdf` endpoints that the
Export form uses. The exported CSV/PDF are the authoritative artefact
for invoicing — the Reports page is intentionally read-only chrome, not
a replacement.

---

## Not in v1

To keep Reports a calm Summary rather than a dashboard, these are
explicitly deferred:

- **Detailed / Weekly / Shared** report tabs.
- **Team** filter, **Rounding**, **Show estimate**, **Create invoice**,
  Share / print chrome.
- Group by **Description** / **Client** / **Tag** switch — the v1 group
  is always by Project.
- Filtering by project / client / tag / billable from the Reports page.
  The underlying endpoints support `project_id` / `client_id` /
  `tag_id` / `billable=true|false` query params (see the
  [Export]({{ '/export' | relative_url }}) page) if you need to script a
  narrower range.
- Mobile-first chart polish (the Reports page re-stacks total → bar →
  list → donut on narrow widths, but the chart densities are tuned
  for `md+`).

See the [FAQ]({{ '/faq' | relative_url }}) for the full "not in v1"
list.
