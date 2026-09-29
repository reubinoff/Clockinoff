import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { clients, type Client } from "@/server/db/schema";
import { errors } from "@/lib/errors";

const MAX_NAME = 200;

function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= MAX_NAME;
}

export async function listClients(
  userId: string,
  opts: { archived?: boolean } = {},
): Promise<Client[]> {
  const db = getDb();
  const cond = opts.archived
    ? eq(clients.userId, userId)
    : and(eq(clients.userId, userId), isNull(clients.archivedAt));
  return db.select().from(clients).where(cond).orderBy(desc(clients.createdAt));
}

export async function createClient(userId: string, input: { name: string }): Promise<Client> {
  if (!validName(input.name)) throw errors.validation("Name is required");
  const db = getDb();
  const [row] = await db
    .insert(clients)
    .values({ userId, name: input.name.trim() })
    .returning();
  return row;
}

export async function updateClient(
  userId: string,
  id: string,
  input: { name?: string; archived?: boolean },
): Promise<Client> {
  const patch: Partial<typeof clients.$inferInsert> = {};
  if (input.name !== undefined) {
    if (!validName(input.name)) throw errors.validation("Name is required");
    patch.name = input.name.trim();
  }
  if (input.archived !== undefined) {
    patch.archivedAt = input.archived ? new Date() : null;
  }
  if (Object.keys(patch).length === 0) throw errors.validation("No fields to update");
  const db = getDb();
  const [row] = await db
    .update(clients)
    .set(patch)
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .returning();
  if (!row) throw errors.notFound("Client not found");
  return row;
}

export async function deleteClient(userId: string, id: string): Promise<void> {
  const db = getDb();
  const res = await db
    .delete(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .returning({ id: clients.id });
  if (res.length === 0) throw errors.notFound("Client not found");
}

export const _sqlProbe = sql;
