import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { errors } from "@/lib/errors";
import { validatePassword } from "@/lib/password";
import { hashPassword, verifyPassword } from "./passwords";
import { createSession, type CreatedSession, type SessionUser } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generic, deliberately unhelpful message returned for any register failure
// past client-side field validation. Ariel + Dana aligned: same status, same
// shape, same string for "email already exists" as for any other unexpected
// register failure so the endpoint cannot be used to enumerate accounts.
const GENERIC_REGISTER_ERROR = "Unable to complete sign-up. Please try again.";

function validEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

function validTimezone(tz: unknown): tz is string | undefined {
  if (tz === undefined || tz === null) return true;
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  timezone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: SessionUser;
  session: CreatedSession;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  if (!validEmail(input.email)) throw errors.validation("Invalid email");
  const pwCheck = validatePassword(input.password);
  if (!pwCheck.ok) throw errors.validation(pwCheck.message);
  if (!validTimezone(input.timezone)) throw errors.validation("Invalid timezone");

  const email = input.email.trim();
  const timezone = input.timezone?.trim() || "Asia/Jerusalem";
  // Hash before the insert so the "email already exists" branch and the
  // happy path do comparable CPU work. Combined with the generic error
  // below this keeps timing + response shape indistinguishable.
  const passwordHash = await hashPassword(input.password);

  const db = getDb();
  try {
    const [row] = await db
      .insert(users)
      .values({ email, passwordHash, timezone })
      .returning({ id: users.id, email: users.email, timezone: users.timezone });
    const session = await createSession(row.id);
    return { user: row, session };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      throw errors.validation(GENERIC_REGISTER_ERROR);
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  if (!validEmail(input.email) || typeof input.password !== "string") {
    throw errors.validation("Invalid credentials");
  }
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email})`)
    .limit(1);
  const row = rows[0];
  if (!row) throw errors.unauthorized("Invalid email or password");
  // Google-only accounts have no password_hash. We still return the same
  // generic unauthorized error so this path cannot be used to probe which
  // accounts were created via Google vs. email/password.
  const hash = row.passwordHash ?? "";
  const ok = await verifyPassword(hash, input.password);
  if (!ok) throw errors.unauthorized("Invalid email or password");
  const session = await createSession(row.id);
  return {
    user: { id: row.id, email: row.email, timezone: row.timezone },
    session,
  };
}

export async function updateTimezone(userId: string, timezone: string): Promise<SessionUser> {
  if (!validTimezone(timezone) || !timezone) throw errors.validation("Invalid timezone");
  const db = getDb();
  const [row] = await db
    .update(users)
    .set({ timezone })
    .where(eq(users.id, userId))
    .returning({ id: users.id, email: users.email, timezone: users.timezone });
  if (!row) throw errors.notFound("User not found");
  return row;
}
