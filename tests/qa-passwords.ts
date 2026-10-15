// In-memory passwords for this process only. Never written to disk, logs,
// or CI artifacts. A later process that does not have the password reports
// the email and stops.

const passwords = new Map<string, string>();

type Deleter = (email: string, password: string) => Promise<void>;

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
  for (const [email, password] of entries) {
    if (!deleter) {
      console.error(`qa sweep: no in-memory password path for ${email}`);
      throw new Error("qa sweep: password is not available for a leftover user");
    }
    await deleter(email, password);
    passwords.delete(email);
  }
}
