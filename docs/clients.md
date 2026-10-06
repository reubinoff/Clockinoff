---
title: Clients
layout: default
nav_order: 6
---

# Clients
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Clients group projects for reporting. They are optional — a project can
live without a client — but attaching them makes filtering and exports
more useful.

Manage clients at `/app/clients`. On desktop, open **Library** in the
top nav and pick **Clients**. On a phone, tap the **Library** tab, then
the Clients segment.

The timer dock is not shown on this page. If a timer is running, use
the elapsed counter in the header (or the **Timer** tab on a phone) to
jump back and stop it.

Before you add your first client the page shows:

> No clients yet. Link them to projects when you’re ready.

---

## Add a client

The Clients page has a single field:

- **Name** (required, unique per user).

Click **Add**. New clients appear at the top of the table with status
`Active`.

---

## Client table

| Column | Meaning |
|---|---|
| Name | Client name. |
| Status | `Active` or `Archived`. |

Actions per row:

- **Archive / Unarchive** — hide the client from the project form's
  client dropdown without deleting anything. Projects that already
  reference an archived client keep the reference and continue to show
  the client name on old entries and exports.
- **Delete** — permanently remove the client. The confirm dialog asks
  first. Projects and entries that referenced the client keep their
  historical rows.

Both active and archived clients are listed on this page; the archived
ones are filtered out of the project form's client dropdown.

---

## What clients affect

- On the [entries]({{ '/entries' | relative_url }}) view and in exports,
  each entry inherits its client from its project. Entries that have no
  project show a blank client.
- The [export]({{ '/export' | relative_url }}) endpoint accepts a
  `client_id` filter to include only entries whose project belongs to a
  given client.

Clients do not carry a default rate or billable flag themselves — those
live on projects.
