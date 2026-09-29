import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { tags, type Tag } from "@/server/db/schema";
import { errors } from "@/lib/errors";

const MAX_NAME = 80;

function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= MAX_NAME;
}

export async function listTags(userId: string): Promise<Tag[]> {
  const db = getDb();
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name));
}

export async function createTag(userId: string, input: { name: string }): Promise<Tag> {
  if (!validName(input.name)) throw errors.validation("Name is required");
  const db = getDb();
  try {
    const [row] = await db
      .insert(tags)
      .values({ userId, name: input.name.trim() })
      .returning();
    return row;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") throw errors.conflict("Tag with this name already exists");
    throw err;
  }
}

export async function updateTag(
  userId: string,
  id: string,
  input: { name: string },
): Promise<Tag> {
  if (!validName(input.name)) throw errors.validation("Name is required");
  const db = getDb();
  try {
    const [row] = await db
      .update(tags)
      .set({ name: input.name.trim() })
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning();
    if (!row) throw errors.notFound("Tag not found");
    return row;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") throw errors.conflict("Tag with this name already exists");
    throw err;
  }
}

export async function deleteTag(userId: string, id: string): Promise<void> {
  const db = getDb();
  const res = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning({ id: tags.id });
  if (res.length === 0) throw errors.notFound("Tag not found");
}
