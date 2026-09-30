import { register } from "@/server/auth/service";
import { getDb } from "@/server/db/client";
import { clients, projects, tags } from "@/server/db/schema";
import type { SessionUser, CreatedSession } from "@/server/auth/session";

export async function makeUser(email = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ex.com`): Promise<{
  user: SessionUser;
  session: CreatedSession;
  cookie: string;
}> {
  const res = await register({
    email,
    password: "correct-horse-battery",
    timezone: "Asia/Jerusalem",
  });
  return {
    user: res.user,
    session: res.session,
    cookie: `timely_session=${res.session.id}`,
  };
}

export async function makeClient(userId: string, name = "Acme"): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [row] = await db.insert(clients).values({ userId, name }).returning();
  return { id: row.id, name: row.name };
}

export async function makeProject(
  userId: string,
  opts: {
    name?: string;
    clientId?: string | null;
    defaultBillable?: boolean;
    defaultRate?: string | null;
  } = {},
): Promise<{ id: string }> {
  const db = getDb();
  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: opts.name ?? "Project",
      clientId: opts.clientId ?? null,
      defaultBillable: opts.defaultBillable ?? false,
      defaultRate: opts.defaultRate ?? null,
    })
    .returning();
  return { id: row.id };
}

export async function makeTag(userId: string, name = "focus"): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [row] = await db.insert(tags).values({ userId, name }).returning();
  return { id: row.id, name: row.name };
}
