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
- **You already have a Clockinoff password for that email.** Clockinoff
  does **not** attach Google automatically. You land back on `/login`
  with an info banner at the top of the card (above Email): *"This
  email already has a Clockinoff password. Sign in with it first,
  then connect Google from Settings."* The email field is not filled
  in. **Sign in with password** is a secondary outline button — it
  focuses Email so you can type. **Log in** stays the only solid
  purple action. Sign in with your password, then open **Account**
  and click **Connect Google**.
- **You already have a Google-only Clockinoff account (no password)
  with the same email.** We attach your Google identity and sign you
  in — same as a first-time Google sign-in returning later.
- **Your Google email is not verified.** Clockinoff refuses to sign you
  in and shows a red message under **Continue with Google**:
  *"Google email isn't verified."* Verify the email in your Google
  account, then try again.
- **You cancel at Google's screen.** You come back to `/login` with a
  red message under **Continue with Google**: *"Google sign-in was
  cancelled."* No account change, no session.
- **Network / other failure.** You come back to `/login` with a red
  message under **Continue with Google**: *"Couldn't connect to
  Google. Try again."* A Google start or callback that is retried
  too many times from the same network (about 20 in 10 minutes) is
  also rejected with `429` and a `Retry-After` header — wait and
  click **Continue with Google** again. Repeating a finished Google
  callback does not retry the sign-in; start the flow again.
- **Google isn't configured on this instance.** A neutral info banner
  at the top of the sign-in card (above Email) says *"Google sign-in
  isn't available right now. Sign in with your email and password, or
  try again later."* It is not a red error. Email and password still
  work.

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

If **Create account** fails after the fields look valid, the form
stays on `/register` and shows *"Couldn't complete sign-up. Sign in,
or try again."* **Sign in** in that message is a link to `/login`.
The wording is the same when the email is already a password account,
already a Google-only account, or the sign-up failed for another
reason — Clockinoff does not say which, and it does not say the
address is registered. Use [Sign in](#sign-in-later) if you think
you already track time here. The sign-in page's failure message is
equally generic, but a valid password just works.

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
An off-site `?next=` value (for example `https://evil.example`) is ignored
and you still land on `/app`.

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
- The cookie holds a random token. The database stores only a SHA-256
  hash of that token, so a copy of the database is not enough to take
  over a session.
- In production the cookie is also `Secure` (HTTPS-only).
- A session lasts 30 days. You can stay signed in on up to 20 browsers
  or devices at once; signing in somewhere new beyond that signs out
  the oldest session.
- To end the session, use the **Log out** control in the top right of
  `/app/*` — this deletes the row in the sessions table and clears the
  cookie.

---

## What you see after signing in

At the top of every `/app/*` page you get a **thin header** with the
Clockinoff mark, top nav (**Timer**, **Library**, **Reports**,
**Export**), and the account cluster. **Library** is sentence case and
groups **Projects**, **Clients**, and **Tags** in a menu — there is no
left sidebar. The right side of that header is a single account
control, not another nav item. On a wide desktop it shows your email
(truncated when it is long). Around tablet width it shows your
initial, so the row stays full width and never scrolls sideways.
Either one opens the same menu: **Account**, **Docs**, **Appearance**,
and **Log out**. Admins also see **Admin** in that menu.

On the **Timer**, **Reports**, and **Export** pages a **timer dock**
sits as a full-width band *under* the header (not inside it) with a
description field, a project dropdown, a billable toggle, elapsed
time, and a **Start** button (or **Stop** / **Discard** while a timer
is running). The project dropdown and the Billable chip are always
visible in that dock — they are not tucked behind a details control.

On **Projects**, **Clients**, **Tags**, and **Account** the dock is
hidden so you can edit configuration without the Start bar in the way.
If a timer is already running, the header shows a small elapsed
counter (desktop). On a phone that counter replaces the **Timer**
label in the bottom tab bar. Either one links back to the Timer page.

On phones the chrome stays a bottom tab bar — **Timer**, **Library**,
**Reports**, and **Export** — where **Library** groups the projects,
clients, and tags pages and defaults to projects. Inside Library, a
**Projects / Clients / Tags** segment control at the top of the page
lets you switch between the three. **Account**, **Docs**,
**Appearance**, and **Log out** live in the overflow menu (`⋯`) in
the top header. Admins also see **Admin** there.

The main area shows recent time entries, which are populated once you start
using the timer.

---

## Next step

Head to [Using the timer]({{ '/timer' | relative_url }}) to log your first
entry.
