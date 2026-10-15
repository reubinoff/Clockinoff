// In-memory passwords for this process only. Never written to disk, logs,
// artifacts, or another process. The sweep walks this map and calls
// DELETE /api/auth/me. It does not read the users table.

const passwords = new Map<string, string>();

type Deleter = (email: string, password: string) => Promise<boolean>;

let deleter: Deleter | null = null;

export function qaSweepPrefix(): string {
  return `qa+${process.env.GITHUB_RUN_ID ?? "local"}-`;
}

export function rememberQaSweepPassword(email: string, password: string): void {
  const normalized = email.trim().toLowerCase();
  if (!normalized.startsWith(qaSweepPrefix().toLowerCase())) return;
  passwords.set(normalized, password);
}

export function forgetQaSweepPassword(email: string): void {
  passwords.delete(email.trim().toLowerCase());
}

export function setQaSweepDeleter(fn: Deleter | null): void {
  deleter = fn;
}

export async function sweepRememberedQaUsers(): Promise<void> {
  const entries = [...passwords.entries()];
  const stillThere: string[] = [];
  for (const [email, password] of entries) {
    const gone = deleter ? await deleter(email, password) : false;
    if (gone) passwords.delete(email);
    else stillThere.push(email);
  }
  if (stillThere.length === 0) return;
  for (const email of stillThere) {
    console.error(`qa sweep: user still exists: ${email}`);
  }
  throw new Error("qa sweep: remembered user still exists");
}
