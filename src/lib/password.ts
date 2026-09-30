export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_COPY = {
  helper: `At least ${PASSWORD_MIN_LENGTH} characters.`,
  tooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  tooWeak: "That password is too easy to guess. Try a longer phrase.",
} as const;

export type PasswordCheck =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_weak"; message: string };

// Kept intentionally tiny — Dana + Ariel explicitly rejected an upper/number/
// symbol checklist, and HIBP is parked for v1. We only reject the obviously
// trivial shapes that a single-second guess would find (all-one-char, the
// classic top-of-the-charts strings, and ascending/descending keyboard runs).
const TRIVIAL_PASSWORDS = new Set<string>([
  "passphrase",
  "qwertyuiop",
  "qwertyuiopas",
  "qwertyuiopasdf",
  "1234567890",
  "12345678901",
  "123456789012",
  "1234567890123",
  "0123456789",
  "01234567890",
  "012345678901",
  "abcdefghij",
  "abcdefghijk",
  "abcdefghijkl",
  "abcdefghijklm",
  "letmeinletmein",
  "iloveyouiloveyou",
  "changemechangeme",
  "welcomewelcome",
]);

// Match the "password" family (password, password1, password123,
// password123456, …) with an optional trailing digit run. Anything
// following that shape is considered too easy to guess regardless of
// length so bumping to 12+ chars by appending "123456" does not sneak
// past the policy.
const PASSWORD_PREFIX_RE = /^password[0-9]{0,20}$/i;
const ADMIN_PREFIX_RE = /^admin[0-9!]{0,20}$/i;
const WELCOME_PREFIX_RE = /^welcome[0-9!]{0,20}$/i;

function hasOnlyOneDistinctChar(pw: string): boolean {
  if (pw.length === 0) return false;
  const first = pw[0];
  for (let i = 1; i < pw.length; i++) {
    if (pw[i] !== first) return false;
  }
  return true;
}

function isMonotonicSequence(pw: string): boolean {
  if (pw.length < 4) return false;
  const first = pw.charCodeAt(0);
  const delta = pw.charCodeAt(1) - first;
  if (delta !== 1 && delta !== -1) return false;
  for (let i = 2; i < pw.length; i++) {
    if (pw.charCodeAt(i) - pw.charCodeAt(i - 1) !== delta) return false;
  }
  return true;
}

function isTinyRepeat(pw: string): boolean {
  // Detects "ababababab…" and "abcabcabcabc…" style fills built from a
  // very small (≤3-char) unit.
  for (let unit = 1; unit <= 3; unit++) {
    if (pw.length < unit * 4) continue;
    if (pw.length % unit !== 0) continue;
    const head = pw.slice(0, unit);
    let allMatch = true;
    for (let i = unit; i < pw.length; i += unit) {
      if (pw.slice(i, i + unit) !== head) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }
  return false;
}

export function validatePassword(password: unknown): PasswordCheck {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "too_short", message: PASSWORD_COPY.tooShort };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    // Argon2's input is bounded to keep hashing bounded; treat as weak because
    // "too long" is not a user-facing concept we want to encourage.
    return { ok: false, reason: "too_weak", message: PASSWORD_COPY.tooWeak };
  }
  const normalised = password.toLowerCase();
  if (TRIVIAL_PASSWORDS.has(normalised)) {
    return { ok: false, reason: "too_weak", message: PASSWORD_COPY.tooWeak };
  }
  if (
    PASSWORD_PREFIX_RE.test(password) ||
    ADMIN_PREFIX_RE.test(password) ||
    WELCOME_PREFIX_RE.test(password)
  ) {
    return { ok: false, reason: "too_weak", message: PASSWORD_COPY.tooWeak };
  }
  if (hasOnlyOneDistinctChar(password)) {
    return { ok: false, reason: "too_weak", message: PASSWORD_COPY.tooWeak };
  }
  if (isMonotonicSequence(password)) {
    return { ok: false, reason: "too_weak", message: PASSWORD_COPY.tooWeak };
  }
  if (isTinyRepeat(password)) {
    return { ok: false, reason: "too_weak", message: PASSWORD_COPY.tooWeak };
  }
  return { ok: true };
}
