---
title: FAQ
layout: default
nav_order: 10
---

# FAQ
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

## One running timer

**Why can I only have one timer running?**

Clockinoff is designed around a single person's attention. In practice
you can only be doing one thing at a time, so the app enforces that at
the database level (a partial unique index on time entries with
`end_at IS NULL`).

If you try to start a second timer while one is already running the API
responds with `409 TIMER_ALREADY_RUNNING` and includes the id of the
running entry. The UI hides the **Start** button entirely while a timer
is active — you get **Stop** and **Discard** instead.

## Overlapping entries

**Can I have two entries that overlap in time?**

**Closed** entries: yes. Overlaps between finished entries are allowed
by design — you might correct a forgotten stop, or log two things you
did during the same window and split the accounting yourself.

**Running** entries: no, because there is [only one running timer](#one-running-timer).

## Billable and Already billed

**How do Clockinoff's billable and billed flags interact?**

Every time entry has two independent booleans:

- **Billable** — is this time client-facing work? Default **on** so
  the common case (tracking billable work) is one less click. Turn it
  off for meetings, admin, learning, etc. Turning it off also clears
  **Already billed** — that's a server-enforced invariant, not a UI
  convenience.
- **Already billed** — have you invoiced or been paid for this entry
  yet? Default **off**. Only meaningful when **Billable** is on, and
  the API refuses `{ billable: false, billed: true }` with a `400
  VALIDATION`. There is a DB `CHECK` constraint behind that too, so a
  broken client cannot bypass it.

The running timer only carries **Billable** (visible in the timer
dock's *Details* section). **Already billed** is only reachable after
you stop the timer, either from the row **⋯** menu (**Mark as
billed** / **Mark as unbilled**) on a billable entry, from the edit
sheet, or by tapping **Select** on the Entries toolbar and flipping
many at once from the sticky bar — see
[Bulk-mark entries as billed]({{ '/entries' | relative_url }}#bulk-mark-entries-as-billed).

For roadmap items around rates, invoices, and export of the *Unbilled*
filter see [What's not in v1](#whats-not-in-v1).

## Currency

**What currency are amounts in?**

Clockinoff does not track currency. The `default_rate` on a project and
the `rate` on an entry are plain numbers, and `amount` is `hours ×
effective_rate`. Pick a currency and stick to it per instance; the
export columns are labelled `rate` and `amount` without a currency
symbol.

## Timezones

**Where are timestamps stored?**

All timestamps are stored in **UTC** (`timestamptz`). The UI and the
CSV/PDF exports render them in *your* timezone, which defaults to
`Asia/Jerusalem` and can be changed per user. See
[Account & timezone]({{ '/account' | relative_url }}#timezone).

## Editing closed entries

**Can I fix a typo in a closed entry's description?**

The v1 UI does not include an editor for closed entries — only
**Delete**. Editing is exposed via the API (`PATCH /api/entries/:id`),
so if you host your own instance you can update entries from a script.

## Manual entries

**Can I add an entry without running a timer?**

The v1 UI does not have a "New entry" form — every entry is created by
starting a timer and later stopping it. The API accepts manual entry
creation (`POST /api/entries`), so scripted imports work; a UI for it is
not part of v1.

## Empty exports

**What if my date range has no entries?**

- **CSV** returns a `200 OK` response with a header row and nothing
  after it.
- **PDF** returns a valid PDF that says "No entries".

Neither surfaces as an error.

## Data reset

**How do I wipe everything?**

There is no "reset my account" button. If you self-host, deleting rows
from the `time_entries`, `projects`, `clients`, `tags`, and
`time_entry_tags` tables (scoped by your `user_id`) is the supported
path. Session rows in the `sessions` table are safe to clear as well —
it just signs you out.

## Light and dark

**Does Clockinoff have a dark mode?**

Yes. The **Appearance** control in the account cluster (desktop) or
account menu (mobile) offers *System*, *Light*, and *Dark*. *System*
follows your device's colour scheme; *Light* and *Dark* force one
palette regardless of the OS. See [Account & timezone]({{ '/account' | relative_url }}#appearance)
for details.

The pref lives in your browser only — there is no per-account setting
synced across devices in v1.

---

## What's *not* in v1

By design, Clockinoff does not include:

- Calendar view or Gantt-style planning.
- Team, workspace, or shared entries.
- Clockify / Toggl / Harvest sync.
- Google / OAuth sign-in.
- Reporting dashboards beyond the entries list and the CSV/PDF exports.
- Rates or invoice generation on top of **Billable / Already billed**.
  The two flags are recorded per entry; interpreting them is up to you.
- **Undo** on bulk mark-as-billed. The sticky bar flips the flag and
  the toast is the only confirmation; use **Mark as unbilled** on the
  same selection if you need to roll back.
- Select-all across your entire history. **Select all** in the sticky
  bar only ticks the entries you can currently see; it never silently
  reaches into older pages.
- **Unbilled** filter column in the CSV / PDF export. The chip only
  exists in the entries list; the export ships the plain `billable` and
  `billed` columns.

These are intentional trade-offs to keep the app tiny.
