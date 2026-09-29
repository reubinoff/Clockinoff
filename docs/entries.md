---
title: Time entries
layout: default
nav_order: 4
---

# Time entries
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

The main page at `/app` shows your closed time entries — one row per
finished timer, most recent first.

The currently running timer, if any, lives in the timer bar and is *not*
shown in this list until you stop it.

When you press **Stop** on the timer bar the new entry springs into the
top of this list (and a **Logged** toast confirms it). If you press
**Discard** instead, no row is added and a **Discarded** toast is shown.
Saving an edit on an existing entry shows a **Saved** toast.

---

## Columns

| Column | Meaning |
|---|---|
| Date | The start date of the entry, in your timezone. |
| Start | Start time (HH:MM in your timezone). |
| End | End time in your timezone; `…` for a running entry (only visible if you filter it in). |
| Hours | Duration formatted as hours (e.g. `1.25`). |
| Description | Whatever you typed in the timer bar. |
| Project | Project name if the entry has one, or `—`. |
| Tags | Tag pills for tags attached to the entry. |
| Amount | Billable amount = duration × effective rate. Blank if not billable or no rate. |

The **Amount** column uses the *effective rate* stored on the entry —
either the entry's own rate or, if that is null, the project's
`default_rate` at the time the entry was closed.

---

## Filtering

Above the table there are three controls:

- **Search box** — matches the description field, case-insensitive.
- **Project dropdown** — pick a single project (or **All projects**).
- **Billable dropdown** — **Any**, **Billable only**, or **Not billable
  only**.

Filtering runs client-side over the loaded entries; the counter to the
right shows *N of M* matching rows.

---

## Delete an entry

Each row has a red **Delete** button on the far right.

1. Click **Delete**.
2. Confirm in the browser prompt.

The row is removed. Any tags attached to the entry are detached, but the
tags themselves are kept. Projects and clients are never deleted by
deleting an entry.

You cannot delete the currently running entry from this list — for that
use **Discard** on the timer bar (see [Using the timer]({{ '/timer' | relative_url }}#discard-a-timer)).

---

## What is *not* editable from this page

The v1 UI intentionally keeps the entries table read-only apart from
delete. To change an entry's description, project, tags, billable flag,
or times you would need to:

- Delete the entry, or
- Use the API (the UI does not currently expose an editor for closed
  entries).

This keeps the workflow "timer + occasional cleanup" rather than a general
time-sheet editor.

---

## Pagination

The page loads the 50 most recent closed entries. The exports endpoint
paginates internally and covers your entire history within the date range,
so if you need older data use [CSV / PDF export]({{ '/export' | relative_url }})
rather than scrolling.
