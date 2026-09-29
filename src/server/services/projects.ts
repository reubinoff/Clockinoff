import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { clients, projects, type Project } from "@/server/db/schema";
import { errors } from "@/lib/errors";

const MAX_NAME = 200;

function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= MAX_NAME;
}

function normalizeRate(rate: unknown): string | null | undefined {
  if (rate === undefined) return undefined;
  if (rate === null || rate === "") return null;
  const n = typeof rate === "string" ? Number(rate) : (rate as number);
  if (!Number.isFinite(n) || n < 0) throw errors.validation("Invalid rate");
  return n.toFixed(2);
}

async function assertClientOwned(userId: string, clientId: string | null | undefined): Promise<void> {
  if (!clientId) return;
  const db = getDb();
  const row = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .limit(1);
  if (row.length === 0) throw errors.validation("Client not found");
}

export async function listProjects(
  userId: string,
  opts: { archived?: boolean } = {},
): Promise<Project[]> {
  const db = getDb();
  const cond = opts.archived
    ? eq(projects.userId, userId)
    : and(eq(projects.userId, userId), isNull(projects.archivedAt));
  return db.select().from(projects).where(cond).orderBy(desc(projects.createdAt));
}

export interface CreateProjectInput {
  name: string;
  client_id?: string | null;
  default_billable?: boolean;
  default_rate?: number | string | null;
}

export async function createProject(userId: string, input: CreateProjectInput): Promise<Project> {
  if (!validName(input.name)) throw errors.validation("Name is required");
  await assertClientOwned(userId, input.client_id ?? null);
  const defaultRate = normalizeRate(input.default_rate);
  const db = getDb();
  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: input.name.trim(),
      clientId: input.client_id ?? null,
      defaultBillable: input.default_billable ?? false,
      defaultRate: defaultRate ?? null,
    })
    .returning();
  return row;
}

export interface UpdateProjectInput {
  name?: string;
  client_id?: string | null;
  default_billable?: boolean;
  default_rate?: number | string | null;
  archived?: boolean;
}

export async function updateProject(
  userId: string,
  id: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const patch: Partial<typeof projects.$inferInsert> = {};
  if (input.name !== undefined) {
    if (!validName(input.name)) throw errors.validation("Name is required");
    patch.name = input.name.trim();
  }
  if (input.client_id !== undefined) {
    await assertClientOwned(userId, input.client_id);
    patch.clientId = input.client_id ?? null;
  }
  if (input.default_billable !== undefined) patch.defaultBillable = input.default_billable;
  if (input.default_rate !== undefined) {
    const norm = normalizeRate(input.default_rate);
    patch.defaultRate = norm === undefined ? null : norm;
  }
  if (input.archived !== undefined) {
    patch.archivedAt = input.archived ? new Date() : null;
  }
  if (Object.keys(patch).length === 0) throw errors.validation("No fields to update");
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  if (!row) throw errors.notFound("Project not found");
  return row;
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const db = getDb();
  const res = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  if (res.length === 0) throw errors.notFound("Project not found");
}
