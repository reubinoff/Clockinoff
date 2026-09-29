---
title: Home
layout: default
nav_order: 1
description: "Clockinoff / Timely — user documentation home."
permalink: /
---

# Clockinoff user guide

Clockinoff (internally named **Timely**) is a small, single-user time tracker
built for freelancers and solo consultants who want to log hours without
learning enterprise software.

You get:

- **One running timer** at a time, with a big Start / Stop bar at the top
  of every page.
- **Projects, clients, and tags** to organise entries.
- **Billable flag** with an optional rate on each project.
- **CSV and PDF export** over any date range.

That's the whole product. There is intentionally no calendar view, no team
management, no Google or Clockify sync, and no dashboards beyond the entry
list and the exports.

---

## Start here

1. [Getting started]({{ '/getting-started' | relative_url }}) — create an account
   and sign in.
2. [Using the timer]({{ '/timer' | relative_url }}) — start, stop, discard, and
   edit the running entry.
3. [Time entries]({{ '/entries' | relative_url }}) — view, filter, and delete
   past entries.
4. [Projects]({{ '/projects' | relative_url }}) — create billable projects with
   default rates.
5. [Clients]({{ '/clients' | relative_url }}) — attach clients to projects.
6. [Tags]({{ '/tags' | relative_url }}) — label individual entries.
7. [Export CSV & PDF]({{ '/export' | relative_url }}) — pull hours out for
   invoicing or reporting.
8. [Account & timezone]({{ '/account' | relative_url }}) — change your
   timezone and sign out.
9. [FAQ]({{ '/faq' | relative_url }}) — one-timer rule, overlaps, and other
   design decisions.

---

## Product principles

Clockinoff intentionally keeps the surface small. The design principles you
will feel while using it:

- **Solo, not team.** Every row in the database is scoped to your user — no
  workspaces, no shared entries.
- **One running timer per user.** Trying to start a second one returns an
  error; the current entry stays running. See the [FAQ]({{ '/faq' | relative_url }}#one-running-timer)
  for why.
- **Closed entries are immutable-ish.** You can delete a closed entry, but
  editing rich fields on it is not offered in the v1 UI.
- **Overlaps between closed entries are allowed by design.** You can have two
  finished entries that overlap in wall-clock time (e.g. from correcting a
  forgotten stop).
- **Everything is stored in UTC** and rendered in your timezone.

---

## Reporting a problem

Docs live in [`/docs`](https://github.com/reubinoff/Clockinoff/tree/main/docs).
Open an issue in the [GitHub repo](https://github.com/reubinoff/Clockinoff/issues)
if something on the site does not match what the product actually does — the
docs are meant to describe real behaviour, not aspirations.
