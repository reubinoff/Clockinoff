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

The main page at `/app` shows your closed time entries, most recent
first, grouped Week → Day. On a phone each entry is a card; on tablet
and desktop (`md+`, ≥ 768 px) the same data is a real table — one
continuous table per week.

The currently running timer lives in the timer bar. On tablet /
desktop it *also* appears as a pinned purple-wash row at the top of
the **Today** day group (no Play / Edit / ⋯ — **Stop** stays in the
dock). On a phone the dock is the only running surface; there is no
pinned card.

When the list is genuinely empty — a fresh account, or after you delete
every entry — Clockinoff shows **Quiet Pulse**, the little purple
character that greets you above *Nothing tracked yet — start a timer
when you're ready.*. Pulse is a static illustration by default; on
systems that allow motion the ring around it fades gently (~3 s). Under
**reduce motion** the ring stays still. If the list is only empty
because of a filter, Pulse stays hidden — that is a transient filter
state, not an empty state. The **Unbilled** chip keeps its own copy
(*Nothing unbilled in this range.*); any other active filter (search or
project) shows *No entries match these filters.*. Filtered-empty also
hides the week band (including a **0.00h** total), the day header, and
the pinned running row, even if a timer is currently live — those
belong to the list, not to a filter miss.

When you press **Stop** on the timer bar the new entry springs into the
top of this list (and a **Logged** toast confirms it). If you press
**Discard** instead, no card is added and a **Discarded** toast is shown.
Saving an edit on an existing entry shows a **Saved** toast.

While the page is still loading entries from the server (first paint, or
when you navigate back to `/app` from another page) you'll see 3–5 soft
grey skeleton rows under a day header instead of a blank screen. If your
system has **reduce motion** turned on the skeletons stay as a static
soft wash rather than pulsing.

---

## Week and day groups

Entries are bucketed Week → Day → Entry, newest first. Each week
section is introduced by a **week band** — the heaviest heading on
the list — showing the Monday-first range (e.g. **`Sep 14 – Sep 20`**)
with a right-aligned **hours total** for the whole week (closed
entries only — a live timer does not add to the day or week total).
The current
week is prefixed **This week ·** and the previous week **Last week ·**
so you don't have to read the dates to orient yourself. The band
carries a soft tinted wash and a hairline so the eye reads it as a
section spine, well above the quieter day headers underneath.

On a phone the week band is **sticky** below the top app header, so
as you scroll a long range you always see which week the rows
underneath belong to. On tablet / desktop (`md+`, ≥ 768 px) the band
is also sticky — it pins just below the app header (whose height
tracks the timer dock as you expand or collapse it) so the current
week stays visible while you scroll a long range. Column labels and
day headers below are *not* sticky, so only one layer of chrome ever
floats over the scrolling rows.

Inside each week, entries are then bucketed into a section per day,
using the start date in your timezone. Each day section has a quieter
header — a small uppercase label — with the day on the left and a
muted total of all durations for that day (in hours) on the right.
There is a touch of extra air between the header and the first card
so the day group reads as a sub-section, not as another row. On a
phone, cards in the same day sit **8 px** apart; one day group sits
**16 px** below the next.

Day labels use this format:

- **Today** — for entries that started today in your timezone.
- **Yesterday** — for entries that started the previous day.
- **`Mon, Sep 28`** — weekday + month + day (short forms) for anything
  older.

Weeks are **ISO weeks** (Monday → Sunday) regardless of your locale,
so the week boundary never shifts when you switch regions.

---

## Entry rows

On a phone each entry renders as a card scanned top-to-bottom:

- **Top row** — the **project chip** on the left (small coloured dot
  plus the project name so you can tell projects apart at a glance;
  a long name truncates inside the chip). The chip is a label, not a
  button: hovering it does not highlight it, and it does not filter
  the list. Beside it, a right-aligned
  cluster with the **duration** (hours, e.g. `1.25h`), an **edit**
  control (pencil icon) that opens the edit sheet, and a **more**
  control (**⋯**) with Mark as billed / Mark as unbilled / Delete.
  Entries with no project show a muted *No project* placeholder in
  the same slot. Edit and ⋯ are **48 × 48 px** tap targets; the
  icons stay the same size so the cluster does not crowd the
  project name.
- **Middle** — the **description** in primary ink (whatever you
  typed in the timer bar; long text is clamped to two lines). Empty
  descriptions render as a muted *No description* so the card never
  collapses to a bare chip.
- **Bottom row** — the **time range** (start–end in your timezone;
  end is `…` for a running entry, only visible if you filter it in),
  any tag chips, a muted `$` if the entry is billable (the billable
  flag — not an amount), and the **Billed** pill if the entry
  has been invoiced — `$` sits immediately before **Billed**. Tag
  chips and the Billed pill are labels too (solid fill, readable
  ink, no hover highlight). The
  **play** control (▶, a 48 × 48 px tap target, see
  [Resume an entry](#resume-an-entry) below) sits on the right, well
  clear of Edit so it reads as the primary row action.

On tablets and desktops (`md+`, ≥ 768 px wide) the same data renders
as a **real table** — one continuous table per week, with a header row
showing column labels, a row per day-group heading, and one row per
entry underneath. The columns, left to right, are **Project** (chip
with the coloured dot), **Description** (truncates to one line; hover
to see the full text), **Tags / Billed / $** (meta column — tag pills
plus a muted `$` for billable entries and a **Billed** pill when
the row has been invoiced), **Time** (start–end in your timezone),
**Duration** (right-aligned tabular hours — `1.50h`), and the row
**actions** (Play, Edit, **⋯**) on the far right.

Between 768 px and 1023 px (`md`) the meta column is dropped to make
room for description, and the **Billed** pill moves inline right
after the description so the state stays legible without horizontal
scroll. Tags and the **Billed** pill stay on one line so every entry
row stays **44 px** tall — they never wrap the row. The actions column
keeps its reserved width at every size so the row never jumps when you
move the mouse.

The actions are hidden by default and appear when you hover a row or
move keyboard focus into it (Tab goes Play → Edit → **⋯**). On a
touch-only screen the actions stay visible permanently so you never
have to hover to reach them. The old permanent red × delete column is
gone — Delete lives inside the **⋯** menu for a quieter default view.

If a timer is currently running, a **pinned purple-wash row** appears
at the top of the **Today** day group with a small purple dot, the
word **Running**, the project, the description, the start time
followed by *now*, and a live `0:00:00` elapsed counter that advances
once per second in step with the dock. The row carries **no actions**
on purpose — **Stop** stays in the timer dock, which is the single
primary control for the live timer. Screen readers hear "Controlled
from the timer" when they land on the row. The row is desktop-only;
on a phone the collapsed dock is the running surface.

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
  On a phone the control is full-width so the **All projects** label
  is fully visible; a long selected name ellipsises inside the
  control instead of clipping mid-word.
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

Delete, Mark as billed, and Save are **optimistic**: the row disappears
or updates immediately and Clockinoff then confirms with the server. If
the server rejects the change (session expired, network drop, or a
validation error) Clockinoff puts the row back where it was and shows a
*Couldn't delete entry. Try again.* / *Couldn't update entry. Try
again.* toast — the UI never leaves a "ghost" delete or a half-saved
state on screen. If your session has expired Clockinoff takes you back
to the sign-in page preserving the current URL.

While a row's mutation is in flight the row body dims to ~70 % opacity
and its action menu is locked, so a double-tap can't fire two requests
on top of each other. Day totals keep their last value — they don't
flash em-dash while the request is pending.

You cannot delete the currently running entry from this list — for that
use **Discard** on the timer bar (see [Using the timer]({{ '/timer' | relative_url }}#discard-a-timer)).

---

## Resume an entry

Tap the **▶ play** icon on an entry's row to pick up where you left
off. Clockinoff starts a **brand-new** timer with that entry's
description, project, billable flag, and tags copied forward — the
historical row stays untouched in the list, and a fresh entry begins
in the timer dock with `start_at = now`. A short **Timer resumed**
toast confirms the hand-off.

Because Clockinoff only allows **one running timer at a time**, the
Play button is dimmed (half opacity) while a timer is already
running. The pointer becomes a not-allowed cursor, and hovering the
dimmed ▶ does not light it up or lift it. Its tooltip stays
**Stop the current timer first**. The moment you **Stop** or
**Discard** that timer from the dock, every Play
button on the list re-enables — the dock pings the list over an
in-memory bus, no page reload required. If you tap Play anyway (for
example right as another tab started one), the server rejects the
second start with `TIMER_ALREADY_RUNNING` and Clockinoff shows the
gentle *A timer is already running* toast instead of double-starting.
Stop or Discard the current timer first, then try again.

Resume is not offered for the currently running entry — it is already
live in the dock.

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

   On phones the **Mark as unbilled** and **Mark as billed** buttons
   render as an equal-width pair in a 2-column grid so neither label
   crowds the other, and the sticky bar sits as a single band above the
   bottom tab bar — it never stacks a second dock over the timer dock
   or the nav.
5. When the request succeeds the selection clears, select mode exits,
   and a counted toast confirms: *Marked N as billed.* or *Marked N as
   unbilled.*

While the batch is in flight the active primary button in the sticky
bar swaps its label to **Saving…** and shows a small Quiet Pulse
spinner; the other sticky controls are all disabled so you can't
re-send the batch or clear mid-flight. If the server rejects the batch
Clockinoff puts every row back to its pre-click state and shows a
*Couldn't update entries. Try again.* toast — the selection stays so
you can retry without re-ticking.

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
