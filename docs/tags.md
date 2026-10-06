---
title: Tags
layout: default
nav_order: 7
---

# Tags
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Tags are lightweight labels you can attach to individual time entries.
They are handy for slicing your hours by kind of work (e.g. `research`,
`meetings`, `deep-work`) without spinning up a full project.

Manage tags at `/app/tags`. On desktop, open **Library** in the top nav
and pick **Tags**. On a phone, tap the **Library** tab, then the Tags
segment.

Before you add your first tag the page shows:

> No tags yet. Tags help you filter exports later.

---

## Add a tag

The Tags page has a single field:

- **Name** (required, unique per user).

Click **Add**. The new tag appears at the top of the list.

---

## Tag table

| Column | Meaning |
|---|---|
| Name | Tag name. |

Action per row:

- **Delete** — permanently remove the tag. The confirm dialog asks
  first. Entries that had the tag lose it (the entry itself stays).

Unlike clients and projects, **tags do not support archive** in v1 —
they are always active or gone.

---

## Attaching tags to entries

The v1 timer bar and entries table do not include an inline tag picker;
tag attachment is currently exposed via the API (`POST /api/entries` and
`PATCH /api/entries/:id` accept `tag_ids: string[]`).

The [entries list]({{ '/entries' | relative_url }}) and both exports do
render the tags attached to each entry, so if you tag entries through
the API they appear everywhere else in the UI and downloads.

---

## Uniqueness

Tag names are unique per user. Trying to add a tag whose name already
exists gets rejected with a validation error — no accidental duplicates.
