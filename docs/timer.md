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

---

## Anatomy of the timer dock

The timer dock is always visible while you're signed in:

- **Desktop** — it sticks to the top of the page under the site header.
- **Mobile** — it sticks to the bottom of the screen, floating just
  above the bottom tab bar.

The dock stays compact by default and contains, left to right (or top
to bottom on narrow screens):

- **Description field** — free text for "What are you working on?".
- **Elapsed time** — `HH:MM:SS`, updates every second while a timer is
  running.
- **Buttons** — **Start** when idle, or **Discard** and **Stop** while a
  timer is running. **Start** is the sole solid-purple primary; **Discard**
  is a quiet ghost button so it doesn't compete with **Stop**.
- **Details chevron** — expands the Project dropdown and the Billable
  chip inline on tablet/desktop, or on a separate row on phones.

### Details (collapsed by default)

Click the chevron on the right of the dock to reveal:

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

The details section closes again on the next chevron click. On phones
the entry list reserves extra scroll padding while Details is open so
the expanded dock never permanently covers the first entry card — the
list scrolls up to meet the dock instead of hiding under it.

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
  If you need to record the *actual* time you worked, delete and re-record
  from the API (the UI does not currently offer manual entry creation for
  arbitrary date ranges).
- **Discard it** — the running entry is thrown away entirely.

See [FAQ → Overlapping entries]({{ '/faq' | relative_url }}#overlapping-entries)
for what happens if you re-record time that overlaps another closed entry.
