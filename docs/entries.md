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

The main page at `/app` shows your closed time entries — one card per
finished timer, most recent first, grouped by day.

The currently running timer, if any, lives in the timer bar and is *not*
shown in this list until you stop it.

When you press **Stop** on the timer bar the new entry springs into the
top of this list (and a **Logged** toast confirms it). If you press
**Discard** instead, no card is added and a **Discarded** toast is shown.
Saving an edit on an existing entry shows a **Saved** toast.

---

## Day groups

Entries are bucketed into a section per day, using the start date in
your timezone. Each section has a header with the day label and a
muted total showing the sum of all durations for that day (in hours).

Day labels use this format:

- **Today** — for entries that started today in your timezone.
- **Yesterday** — for entries that started the previous day.
- **`Mon, Sep 28`** — weekday + month + day (short forms) for anything
  older.

---

## Card rows

Each entry renders as a card with:

- A **two-line description** (whatever you typed in the timer bar; long
  text is clamped to two lines).
- A meta line with the **duration** (hours, e.g. `1.25h`) followed by
  the **time range** (start–end in your timezone; end is `…` for a
  running entry, only visible if you filter it in).
- Chips for the entry's **project**, **tags**, and, if billable, a
  **billable** marker with the computed amount.
- An **edit** control (pencil icon, 44 × 44 px tap target) that opens
  the edit sheet, and a delete control (×) to remove the entry.

The billable amount uses the *effective rate* stored on the entry —
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

Each card has a red delete (×) button.

1. Click the × button.
2. Confirm in the browser prompt.

The card is removed. Any tags attached to the entry are detached, but the
tags themselves are kept. Projects and clients are never deleted by
deleting an entry.

You cannot delete the currently running entry from this list — for that
use **Discard** on the timer bar (see [Using the timer]({{ '/timer' | relative_url }}#discard-a-timer)).

---

## Editing an entry

Tap the pencil icon on a card to open the edit sheet. From there you
can change the entry's description, project, tags, billable flag, and
start/end times, then save. The list updates in place and a **Saved**
toast confirms the change.

Editing is not available for the currently running entry — stop it
first, or use the timer bar to change its description and project.

---

## Pagination

The page loads the 50 most recent closed entries. The exports endpoint
paginates internally and covers your entire history within the date range,
so if you need older data use [CSV / PDF export]({{ '/export' | relative_url }})
rather than scrolling.
