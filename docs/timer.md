---
title: Using the timer
layout: default
nav_order: 3
---

# Using the timer
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Clockinoff has a single, always-visible timer at the top of every `/app/*`
page. You can only have **one running timer at a time**.

If you forgot to start the timer, you don't have to pretend otherwise:
Clockinoff also lets you add an entry **manually** with explicit
start/end times — see [Add a manual entry](#add-a-manual-entry) below.

---

## Anatomy of the timer dock

The timer dock is always visible while you're signed in. Its colours
follow the **Appearance** setting immediately — you do not need to
reload for the digits to match light or dark.

- **Desktop** — it sits as a full-width band under the thin site header
  and sticks with that chrome as you scroll.
  A quiet **Timer | Manual** segmented toggle sits above the dock while
  idle so you can switch between starting a live timer and logging past
  time (see [Add a manual entry](#add-a-manual-entry)).
- **Mobile** — it sticks to the bottom of the screen, floating just
  above the bottom tab bar as a **thin collapsed band** by default.
  While idle the band shows a secondary **Manual** button alongside the
  primary purple **Start** so you can open the manual-entry sheet
  without leaving the page.

The dock stays compact by default and contains, left to right (or top
to bottom on narrow screens):

- **Description** — free text for "What are you working on?".
  On tablet/desktop this is an inline input you can type into right in
  the dock. On phones the collapsed band shows the description as a
  tappable label — tap it (or the grabber above the band) to open the
  expanded editor with a full input.
- **Elapsed time** — `HH:MM:SS`, updates every second while a timer is
  running.
- **Buttons** — **Start** when idle, or **Stop** while a timer is
  running. **Start** is the sole solid-purple primary. On
  tablet/desktop a quiet **Discard** ghost button sits next to **Stop**
  while running; on phones **Discard** lives in the expanded panel so
  the collapsed band stays focused on the primary action.
- **Grabber / details chevron** — on phones a short pill-shaped
  grabber at the top of the dock expands the full editor (description
  input, project, billable, Discard). On tablet/desktop a chevron
  button on the right of the dock expands the Project dropdown and
  the Billable chip inline.

### Details (collapsed by default)

On phones, tap the grabber at the top of the dock (or the description
label) to expand the editor. On tablet/desktop, click the chevron on
the right of the dock. In both cases the expanded panel reveals:

- **Project dropdown** — pick a project you already created, or leave as
  **No project**.
- **Billable chip** — quiet toggle labelled **Billable** (tooltip:
  *Billable — counts toward client work*). **Default is on**, so a new
  timer is billable unless you explicitly turn it off. The value is
  persisted server-side on the running entry, so a refresh keeps
  whatever you last picked, and it is copied onto the entry when you
  hit **Stop**. Flipping the switch shows a **Billable on** /
  **Billable off** toast so the change is visible without pulling
  attention.

On tablet / desktop (`md+`, ≥ 768 px wide) opening Details does **not**
add a second row — the project dropdown and the Billable chip slot into
the same horizontal band as the description, duration and Start, so the
whole dock stays on one baseline. On phones the Project dropdown and the
Billable chip stack below the Start row until you close Details again.

The expanded panel closes again on the next grabber tap (phones) or
chevron click (tablet/desktop). On phones the entry list reserves
extra scroll padding while the panel is open so the expanded dock
never permanently covers the first entry card — the list scrolls up
to meet the dock instead of hiding under it. The collapsed band
itself is thin by design, so the first entry card is always visible
in the default state.

Your current timezone no longer appears inside the timer dock. It is
shown in the desktop footer (as `Clockinoff · <timezone>`) and on the
[Account & timezone]({{ '/account' | relative_url }}) page.

The **Already billed** flag is *not* available on the running dock —
you can only mark an entry as billed after it has been stopped (see
[Time entries → Mark as billed]({{ '/entries' | relative_url }}#mark-an-entry-as-billed)).

### Running wash

While a timer is running the whole dock swaps to a soft purple tint —
the same accent-soft colour used elsewhere in the app — so it's obvious
at a glance that time is currently being tracked.

### Pending feedback (never frozen)

Clockinoff's clicks are not sync — pressing **Start**, **Stop**, or
**Discard** fires a request to the server and waits for the response.
While that request is in flight:

- The button you clicked is disabled (greyed out) so a double-tap
  doesn't fire a second request.
- The elapsed digits keep ticking if a timer is already running.
- The dock swaps to the running wash (or back to idle) as soon as the
  server responds — not after a second reload. If your network is
  slow this is where the lag shows up, but the dock never looks
  frozen: the primary button stays in its pending state until the
  response lands.
- If your session has expired, Clockinoff takes you back to the
  sign-in page (preserving where you came from) instead of leaving a
  stale "Logged" or empty dock on screen.

---

## Start a timer

1. Type a description (optional, but useful for the [entry list]({{ '/entries' | relative_url }})
   and exports).
2. Pick a project if you want to group this entry. The project's default
   billable and default rate carry into the entry (rate is used only when
   **Billable** is on).
3. Leave **Billable** on (default) or toggle it off if this time is not
   billable.
4. Click **Start**.

The elapsed counter begins ticking and the button set switches to
**Discard** / **Stop**.

### One running timer at a time

Trying to start a second timer while one is already running is rejected by
the server (error code `TIMER_ALREADY_RUNNING`, with the id of the entry
that is already running). The UI does not offer a "start" button while a
timer is active — you must **Stop** or **Discard** the current one first.
The same rule applies to the per-entry **▶ play** button on the
[entries list]({{ '/entries' | relative_url }}#resume-an-entry): while
a timer is running, every row's Play button is dimmed; if a race still
lands a tap, the server rejects it and Clockinoff surfaces a short
*A timer is already running* toast instead of double-starting.

---

## Edit the running entry

While the timer is running you can change:

- **Description**
- **Project**
- **Billable** flag

Edits are auto-saved to the server about half a second after you stop
typing/toggling. You do not need to click Save.

Changing the project after starting also updates the *effective rate* on
the entry (the rate is inherited from the project's default rate).

The **start time** of a running entry is set when you press **Start** and
is not editable from the UI. If you notice you started a timer late,
either **Discard** and start again, or leave it and delete the entry
after Stop and record the corrected times manually via the API.

---

## Stop a timer

Click **Stop**. Clockinoff:

1. Sets the entry's `end_at` to the current server time.
2. Computes the duration and, if the entry is billable, the amount using
   the effective rate.
3. Springs the new entry into your [entries list]({{ '/entries' | relative_url }}) and shows a small
   **Logged** toast.

The timer bar returns to its idle state (empty description, no project,
billable off, `00:00:00`, **Start** button).

---

## Discard a timer

Click **Discard** if you started a timer by mistake. Clockinoff will:

1. Ask you to confirm.
2. If confirmed, delete the running entry outright — it never appears in
   the entries list, exports, or totals. A small **Discarded** toast
   confirms the action.

Use **Discard** for typos and false starts. Use **Stop** followed by
**Delete** (on the entries list) if you already finished the entry and
only later decided it should be thrown away.

---

## Recovering from a forgotten stop

Clockinoff does not auto-stop timers. If you leave one running overnight
you have two options:

- **Stop it now**, then delete the entry from the [entries list]({{ '/entries' | relative_url }}).
  If you need to record the *actual* time you worked, delete the stale
  entry and recreate it with [Add a manual entry](#add-a-manual-entry).
- **Discard it** — the running entry is thrown away entirely.

See [FAQ → Overlapping entries]({{ '/faq' | relative_url }}#overlapping-entries)
for what happens if you re-record time that overlaps another closed entry.

---

## Add a manual entry

If you forgot to run the timer, open the manual-entry form and type the
start / end you actually worked. There is no live clock involved — the
duration is derived from the times you enter, and the entry lands in
the list straight away.

### Where to find it

- **Desktop** (`md+`, ≥ 768 px wide): the dock header shows a quiet
  **Timer | Manual** segmented toggle while no timer is running. Click
  **Manual** to swap the live-timer controls for the manual-entry form
  inline in the dock. Click **Timer** to go back; the form state is
  cleared when you add an entry.
- **Mobile** (`< md`): the dock shows a secondary **Manual** button to
  the left of the purple **Start** button while idle. Tapping it opens
  a full-width bottom sheet with the same fields and a full-width
  purple **Add** button.

The manual-entry entry point is only available while idle. As soon as a
live timer is running Clockinoff hides the desktop toggle and the mobile
**Manual** button so the running dock stays the only control surface.

### Fields

The manual-entry form takes the same metadata as the timer plus the
times you worked:

- **Description** — optional, same rules as the timer description.
- **Project** — optional; defaults to **No project**. The project's
  billable + rate are *not* automatically applied here (the form is
  explicit about billable).
- **Billable** — quiet chip, default **on**.
- **Start** and **End** — time inputs in your [timezone]({{ '/account' | relative_url }}#timezone).
  Both default to the current time, so the initial duration is `00:00`
  until you move at least one of them.
- **Date** — single date picker, default **Today**.
- **Duration** — read-only `HH:MM` readback computed from start/end.
  Edit the times to change the duration.
- **Add** — the purple primary. Disabled until **End** is strictly
  after **Start**; if you drag End back before Start the form shows an
  inline **End must be after start** message and keeps the button
  disabled.

### What happens on Add

Clockinoff sends `POST /api/entries` with the exact timestamps you
chose. On success:

1. A new row springs into the [entries list]({{ '/entries' | relative_url }}),
   just like a stopped timer, and the short **Logged** toast appears.
2. The form resets to its defaults (empty description, no project,
   billable on, start = end = now, date = Today). On desktop the dock
   stays in **Manual** mode so you can add another entry back-to-back;
   on mobile the sheet dismisses.
3. If you dismiss the mobile sheet (tap the backdrop, **Close**, or
   **Esc**) **without** pressing Add, the fields you typed are
   discarded — manual-entry drafts are not kept across sessions.

Manual entries have no "running" state: they ship with both `start_at`
and `end_at` set, and are editable from the row **Edit** sheet like any
other closed entry.
