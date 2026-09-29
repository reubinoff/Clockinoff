---
title: Getting started
layout: default
nav_order: 2
---

# Getting started
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

## What you need

Just a browser. Clockinoff is a web app; there is nothing to install.

You will need:

- An **email address** — used as your login.
- A **password** — at least 8 characters.
- Optionally, your **timezone** in [IANA form](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
  (for example, `Asia/Jerusalem`, `Europe/Berlin`, `America/New_York`). The
  default is `Asia/Jerusalem`; change it during registration or later from
  the account settings.

---

## Create an account

1. Go to `/register` on your Clockinoff instance.
2. Fill in:
   - **Email** — used to sign in.
   - **Password** — minimum 8 characters. Stored as an argon2id hash; the
     server never sees your plaintext after registration.
   - **Timezone** — pre-filled with `Asia/Jerusalem`. Change it now if you
     work outside that zone.
3. Click **Create account**.

On success, Clockinoff issues a session cookie and drops you on the main
`/app` page with the timer bar visible at the top.

If you see an error like *"email already registered"*, use the
[sign-in flow](#sign-in-later) instead.

---

## Sign in later

1. Go to `/login`.
2. Enter the email and password you used to register.
3. Click **Sign in**.

You will be sent to `/app` unless you followed a link deeper in the app; in
that case Clockinoff returns you to the page you were trying to reach.

### Too many failed sign-ins

After a handful of failed login attempts for the same email from the same
network within a short window, Clockinoff temporarily blocks further
attempts and responds with `429 Too many login attempts. Please try again
later.` Wait a few minutes and try again — a successful sign-in clears the
counter immediately. The message is deliberately generic and does not
reveal whether the email is registered.

### Session lifetime

- Your session is stored in the database and referenced by an
  `httpOnly / SameSite=Lax` cookie called `timely_session`.
- In production the cookie is also `Secure` (HTTPS-only).
- To end the session, use the **Sign out** button in the top right of
  `/app/*` — this deletes the row in the sessions table and clears the
  cookie.

---

## What you see after signing in

At the top of every `/app/*` page you get two rows:

1. **Nav bar** with links to Timer, Projects, Clients, Tags, Export, plus
   your email and a **Sign out** button.
2. **Timer bar** with a description field, project dropdown, billable
   ($) toggle, elapsed time, and a **Start** button (or **Stop** /
   **Discard** while a timer is running).

The main area shows recent time entries, which are populated once you start
using the timer.

---

## Next step

Head to [Using the timer]({{ '/timer' | relative_url }}) to log your first
entry.
