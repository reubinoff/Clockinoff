import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { users } from "@/server/db/schema";
import { errors } from "@/lib/errors";
import { validatePassword } from "@/lib/password";
import { REGISTER_FAILURE_COPY } from "@/lib/register-copy";
import { applyBootstrapRole, initialRoleForEmail } from "./admin-bootstrap";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./passwords";
import { createSession, sessionUserFromRow, type CreatedSession, type SessionUser } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same status, same shape, same string for a duplicate email (password or
// Google-only) as for any other unexpected register failure. The copy
// nudges Sign in without naming the account type (#159).

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
      .values({ email, passwordHash, timezone, role: initialRoleForEmail(email) })
      .returning({
        id: users.id,
        email: users.email,
        timezone: users.timezone,
        role: users.role,
        blockedAt: users.blockedAt,
      });
    const session = await createSession(row.id);
    return { user: sessionUserFromRow(row), session };
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505") {
      throw errors.validation(REGISTER_FAILURE_COPY);
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
      role: users.role,
      blockedAt: users.blockedAt,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email})`)
    .limit(1);
  const row = rows[0];
  // Missing row *and* Google-only (`password_hash` NULL) still run a
  // full argon2id verify against the module-load dummy hash so timing
  // cannot distinguish "no account" / "Google-only" / "wrong password"
  // (#149). The unauthorized body is identical on every failure.
  const storedHash = row?.passwordHash;
  const hash = storedHash ?? (await dummyPasswordHash());
  const ok = await verifyPassword(hash, input.password);
  if (!row || !storedHash || !ok) throw errors.unauthorized("Invalid email or password");
  // Same body as a bad password so a blocked account is not an oracle.
  // The verify above already ran, so this branch is not cheaper.
  if (row.blockedAt) throw errors.unauthorized("Invalid email or password");
  const role = await applyBootstrapRole(row.id, row.email, row.role);
  const session = await createSession(row.id);
  return {
    user: sessionUserFromRow({ ...row, role, blockedAt: null }),
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
    .returning({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      role: users.role,
      blockedAt: users.blockedAt,
    });
  if (!row) throw errors.notFound("User not found");
  return sessionUserFromRow(row);
}
