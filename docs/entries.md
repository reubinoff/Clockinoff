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

## Entry rows

On a phone each entry renders as a card with:

- A **two-line description** (whatever you typed in the timer bar; long
  text is clamped to two lines).
- A right-aligned **duration** (hours, e.g. `1.25h`).
- A meta line with the **time range** (start–end in your timezone; end is
  `…` for a running entry, only visible if you filter it in) followed by
  the project name if the entry has one.
- Tag chips underneath and, if the entry has been marked as billed, a
  muted **Billed** pill — no loud badge, no colour.
- An **edit** control (pencil icon, 44 × 44 px tap target) that opens
  the edit sheet, and a **more** control (**⋯**) with Mark as billed /
  Mark as unbilled / Delete.

On tablets and desktops (`md+`, ≥ 768 px wide) the same data lays out
as a **flat one-line row**: description · project chip (on `lg+`) ·
muted **Billed** pill (if billed) · time range · right-aligned
duration · Edit · **⋯**. The old permanent red × delete column is
gone — Delete now lives inside the **⋯** menu for a quieter default
view. Day groups still render as rounded cards with hairline dividers
between rows.

The billable amount uses the *effective rate* stored on the entry —
either the entry's own rate or, if that is null, the project's
`default_rate` at the time the entry was closed.

The billable amount uses the *effective rate* stored on the entry —
either the entry's own rate or, if that is null, the project's
`default_rate` at the time the entry was closed.

---

## Filtering

Above the list there are four controls:

- **Search box** — matches the description field, case-insensitive.
- **Project dropdown** — pick a single project (or **All projects**).
- **Unbilled chip** — a single quiet toggle. Off (default) shows every
  entry; on shows only entries that are **billable and not yet billed**,
  i.e. work you have done but not invoiced. When the chip is on and no
  entries match, the list shows *Nothing unbilled in this range.*
  instead of the usual empty state.
- **Select** — enter bulk-select mode (see
  [Bulk-mark entries as billed](#bulk-mark-entries-as-billed) below).

Changing any of these controls while you are in select mode clears your
selection and exits select mode so the sticky bar count can never
reference a hidden row.

Filtering runs client-side over the loaded entries; the counter to the
right shows *N of M* matching rows.

---

## Delete an entry

On a phone, open the row's **⋯** menu and tap **Delete**. On tablet /
desktop, Delete lives in the same **⋯** menu — there is no permanent
red × column in the day list.

1. Open **⋯** on the entry's row.
2. Tap **Delete**.
3. Confirm in the browser prompt.

The card is removed. Any tags attached to the entry are detached, but the
tags themselves are kept. Projects and clients are never deleted by
deleting an entry.

You cannot delete the currently running entry from this list — for that
use **Discard** on the timer bar (see [Using the timer]({{ '/timer' | relative_url }}#discard-a-timer)).

---

## Editing an entry

Tap the pencil icon on a card to open the edit sheet. On phones the
sheet slides up from the bottom; on desktop it fades in and scales up
slightly in place. Closing it (Cancel, ×, Esc, or tapping the backdrop)
reverses the same motion a touch faster. If your system has
**reduce motion** turned on the sheet still opens and closes, just
without the travel.

From there you can change the entry's description, project, tags,
**Billable** flag, **Already billed** flag (only visible when
**Billable** is on), and start/end times, then save. The list updates
in place and a **Saved** toast confirms the change.

Turning **Billable** off in the edit sheet hides the **Already billed**
sub-toggle and clears the flag; the server enforces the same
invariant, so the two switches can never disagree.

Editing is not available for the currently running entry — stop it
first, or use the timer bar to change its description and project.

---

## Mark an entry as billed

Once you have invoiced or been paid for an entry you can mark it as
billed without opening the edit sheet:

1. Tap the **⋯** button on a billable row.
2. Choose **Mark as billed** from the small menu (or **Mark as
   unbilled** if the entry is already billed and you want to undo).

The row stays in place, its row action menu goes away, a muted
**Billed** meta appears next to its other chips, and a **Marked as
billed** / **Marked as unbilled** toast confirms the change. The two
menu items are mutually exclusive: a billable, not-yet-billed row sees
Mark as billed, a billable + billed row sees Mark as unbilled, and a
non-billable entry sees neither.

For anything more involved (change the flag alongside other edits) use
the edit sheet.

---

## Bulk-mark entries as billed

For end-of-month invoicing you can flip the **billed** flag on many
entries at once.

1. Tap **Select** on the toolbar (right of the Unbilled chip).
2. The per-row Edit, **⋯**, and Delete buttons are hidden; a 44 × 44 px
   checkbox appears on the left of every **billable, closed** entry.
   Non-billable rows show a locked, greyed-out checkbox and a *Not
   billable — not selectable* note; the running timer is never
   selectable.
3. Tap the rows you want. A sticky action bar appears at the bottom of
   the screen (above the tab bar on mobile; floating bottom-right on
   desktop) showing *N selected*.
4. In the bar you can:
   - **Select all** / **Clear all** — toggles every currently visible
     selectable row. "All" is scoped to the entries you can actually
     see; filters still apply, and nothing off-screen is selected
     silently.
   - **Clear** — drops the selection without exiting select mode.
   - **Mark as billed** — flips `billed=true` on every selected row that
     is billable + not yet billed.
   - **Mark as unbilled** — flips `billed=false` on every selected row
     that is billable + billed.
5. When the request succeeds the selection clears, select mode exits,
   and a counted toast confirms: *Marked N as billed.* or *Marked N as
   unbilled.*

The request is **all-or-nothing**: if any row in the batch is not
yours, is non-billable, or is unknown to the server, no rows change
and a *Couldn't update entries. Try again.* toast appears. Changing
any filter (search, project, Unbilled, etc.) while in select mode
clears the selection and exits select mode so the count stays
truthful.

To leave select mode without acting, tap **Done** on the toolbar.

---

## Pagination

The page loads the 50 most recent closed entries. The exports endpoint
paginates internally and covers your entire history within the date range,
so if you need older data use [CSV / PDF export]({{ '/export' | relative_url }})
rather than scrolling.
