---
title: Account & timezone
layout: default
nav_order: 10
---

# Account & timezone
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>

- TOC
{:toc}
</details>

---

Clockinoff keeps account management deliberately thin. There is one user
per account, no roles, no invitations, no billing.

---

## Your email

The email you registered with is your login. On a wide desktop it
appears in the top-right of every `/app/*` page next to **Account**,
**Docs**, **Appearance**, and **Log out**. Around tablet width those
controls collapse into an account menu (your initial) so the header
does not overflow.

Open **Account** from the header (wide desktop) or the account menu
(tablet and phone) to see your sign-in methods. The timer dock is
hidden on this page. A running timer still shows as a small elapsed
counter in the header, or on the **Timer** tab on a phone.

The v1 UI does not include a "change email" flow. Support for that is a
future improvement.

---

## Sign-in methods

The Account page shows how you can sign in:

- **Password · On** when the account was created with an email and
  password.
- **Google** with a **Connect Google** button when Google is not linked
  yet. After you connect, the row reads **Google · connected** and shows
  the Google email in muted text. A toast confirms: *"Google connected.
  You can now sign in either way."*

Connect Google only accepts a Google account whose verified email
matches your Clockinoff email. A mismatch shows: *"That Google account
uses a different email. Connect one that matches {email}."*

There is no disconnect control in v1. Password accounts never get
Google attached from the login / register **Continue with Google**
button — sign in with your password first, then connect here.

---

## Password

Passwords are stored as argon2id hashes. The plaintext is never written
to the database or logs.

The v1 UI does not include a password-change or password-reset flow. If
you lose your password, either:

- Recover access via the database directly (see the repository README
  for local dev setup), or
- Ask the operator of your instance to reset your session.

If you created your account by clicking **Continue with Google** on
`/register`, it has **no password** at all — the only way to sign back
in is to use **Continue with Google** again from the same Google
account. See
[Continue with Google]({{ '/getting-started' | relative_url }}#or-continue-with-google)
for the full flow.

---

## Timezone

Your timezone controls:

- How dates and times are shown in the [entries]({{ '/entries' | relative_url }})
  list.
- How the export form interprets **From** / **To** and formats the
  `date`, `start`, and `end` columns.
- The timezone label in the timer bar.

You set your timezone during [registration]({{ '/getting-started' | relative_url }}#create-an-account);
the default is `Asia/Jerusalem`.

To change it later, `PATCH /api/auth/me` with `{ "timezone": "Area/City" }`
using an IANA timezone name. A UI control for this may be added in a
future release.

Timestamps themselves are always stored in UTC, so switching timezones
does not corrupt existing entries — it just changes how they are
displayed.

---

## Appearance

Clockinoff has a light and a dark theme. Pick one from the **Appearance**
control:

- On a wide desktop, next to your email in the top-right of every
  `/app/*` page.
- On tablet, inside the compact account menu (your initial).
- On mobile, inside the account menu (`⋯` button in the header) above
  **Log out**.

Open **Appearance** and choose one. The choices are listed on the page
(including inside the account menu), and the choice applies immediately.

The options are:

- **System** — follows your device's colour scheme and switches
  automatically when you flip between light and dark in the OS. Labelled
  *Matches your device*.
- **Light** — always the light Quiet Pulse palette.
- **Dark** — always the dark Quiet Pulse palette (deep violet accent).

The pref is stored in your browser (`localStorage`) and applied on both
the app and the sign-in / register screens. The desktop control and the
one in the account menu share that setting: changing either one updates
the other, and the timer dock (including the `00:00:00` digits) picks up
the new colours immediately. Because it is browser-local there is no
server profile field for it — each browser you sign in from keeps its
own choice.

---

## Sign out

Click **Log out** in the top-right of `/app/*` (or inside the account
menu on tablet and phone). Clockinoff:

1. Deletes your session row in the database.
2. Clears the `timely_session` cookie in your browser.

You are redirected back to `/login`.

Any other browsers or devices where you were signed in with a *different*
session cookie remain signed in — signing out only affects the current
device.

You can stay signed in on up to 20 browsers or devices at the same
time. Signing in on an additional device signs out the oldest session.

---

## Deleting your account

The v1 UI does not offer self-service account deletion. If you need to
remove an account, the operator of your instance can delete the row in
the `users` table; the cascading foreign keys will clean up your
sessions, projects, clients, tags, entries, and tag links.
