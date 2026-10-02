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
- A **password** — at least 12 characters. Very obvious passwords
  (`aaaaaaaaaaaa`, `password123`, `123456789012`, …) are rejected.
  Longer passphrases are stronger than short strings with symbols.
- Optionally, your **timezone** in [IANA form](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
  (for example, `Asia/Jerusalem`, `Europe/Berlin`, `America/New_York`). The
  default is `Asia/Jerusalem`; change it during registration or later from
  the account settings.

---

## Create an account

On tablet and larger viewports both `/register` and `/login` show a
small **Quiet Pulse** flourish between the title and the form — it is
decorative, sits next to the Clockinoff wordmark, and never replaces
the brand mark. On narrow phone screens it is omitted so the form
never feels crowded.

1. Go to `/register` on your Clockinoff instance.
2. Fill in:
   - **Email** — used to sign in.
   - **Password** — minimum 12 characters, with obviously trivial
     strings ("all one letter", `password123`, `123456789012`, …)
     rejected. There is no upper/number/symbol checklist — a long
     passphrase is fine. Stored as an argon2id hash; the server never
     sees your plaintext after registration.
   - **Timezone** — pre-filled with `Asia/Jerusalem`. Change it now if you
     work outside that zone.
3. Click **Create account**.

### Or continue with Google

Below the password form, both `/register` and `/login` show a
**Continue with Google** button. Clicking it hands you to Google's
sign-in screen; once you consent, Google sends you back to Clockinoff
and you land on `/app` just like a password sign-in.

What happens behind the scenes depends on your Google email:

- **No Clockinoff account yet.** We create one for you, tag it with
  your Google identity, and sign you in. You will see the usual
  `/app?welcome=1` hero on first load. The account has **no password**
  until you choose to set one; use **Continue with Google** to sign in
  again.
- **You already have a Clockinoff account with the same email.** We
  attach your Google identity to that account and sign you in. Your
  existing password keeps working — nothing is replaced, there is no
  second account, and we never show an "account already exists" error.
- **Your Google email is not verified.** Clockinoff refuses to sign you
  in and shows *"Google email isn't verified."* Verify the email in
  your Google account, then try again.
- **You cancel at Google's screen.** You come back to `/login` with
  *"Google sign-in was cancelled."* No account change, no session.
- **Network / other failure.** You come back to `/login` with
  *"Couldn't connect to Google. Try again."*

The Google button is deliberately a secondary visual — email/password
remains the primary purple action. The icon is Google's official
multicolor **G** so you can tell it apart at a glance from Clockinoff
chrome.

On success, Clockinoff issues a session cookie and drops you on the main
`/app?welcome=1` page with the timer bar visible at the top.

The `?welcome=1` query flags a short first-run hero above the entries
list that reads **"Your timer is ready"** with two buttons:

- **Focus Start** — jumps focus to the timer's description field so you
  can start typing immediately.
- **I'll explore** — dismisses the hero.

The hero is inline (not a modal), only shows while the account has
zero entries, and disappears as soon as you dismiss it or log your
first entry. Later visits to `/app` (without `?welcome=1`) never show
it again, so it stays a one-time nudge.

Register only returns a single generic error string — *"Unable to
complete sign-up. Please try again."* — for any failure past the field
validation, including when the email is already in use. This is on
purpose: Clockinoff never tells a stranger whether a given email is
registered. If you know the account exists, use the
[sign-in flow](#sign-in-later) instead; if you see the generic error
and you *don't* know whether you have an account, try signing in — the
sign-in page's failure message is equally generic but a valid password
just works.

Clockinoff also caps the number of registration attempts from the same
network within a short window. If you exceed the budget — regardless
of whether each attempt succeeded — the server responds with
`429 Too many sign-up attempts. Please try again later.` and a
`Retry-After` header. Wait a few minutes and try again.

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
later.` with a `Retry-After` header telling the client how long to wait.
Wait a few minutes and try again — a successful sign-in clears the counter
immediately. The message is deliberately generic and does not reveal
whether the email is registered.

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

On phones the chrome collapses to a bottom tab bar with three tabs —
**Timer**, **Library**, and **Export** — where **Library** groups the
projects, clients, and tags pages and defaults to projects. Inside
Library, a **Projects / Clients / Tags** segment control at the top of
the page lets you switch between the three. Your email and **Log out**
live in an overflow menu in the top header.

The main area shows recent time entries, which are populated once you start
using the timer.

---

## Next step

Head to [Using the timer]({{ '/timer' | relative_url }}) to log your first
entry.
