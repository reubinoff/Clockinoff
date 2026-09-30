import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  clients,
  projects,
  tags,
  timeEntries,
  timeEntryTags,
  type TimeEntry,
} from "@/server/db/schema";
import { errors } from "@/lib/errors";
import { computeAmount, durationSeconds, effectiveRate } from "@/lib/money";

const MAX_DESCRIPTION = 2000;

export interface EntryView {
  id: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  client_id: string | null;
  client_name: string | null;
  start_at: string;
  end_at: string | null;
  duration_seconds: number;
  billable: boolean;
  billed: boolean;
  rate: number | null;
  effective_rate: number | null;
  amount: number | null;
  tag_ids: string[];
  tag_names: string[];
  running: boolean;
}

interface JoinedRow {
  id: string;
  description: string;
  startAt: Date;
  endAt: Date | null;
  billable: boolean;
  billed: boolean;
  rate: string | null;
  projectId: string | null;
  projectName: string | null;
  projectRate: string | null;
  clientId: string | null;
  clientName: string | null;
}

function baseSelect() {
  const db = getDb();
  return db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      startAt: timeEntries.startAt,
      endAt: timeEntries.endAt,
      billable: timeEntries.billable,
      billed: timeEntries.billed,
      rate: timeEntries.rate,
      projectId: projects.id,
      projectName: projects.name,
      projectRate: projects.defaultRate,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId));
}

async function loadTagsForEntries(entryIds: string[]): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (entryIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      entryId: timeEntryTags.entryId,
      tagId: tags.id,
      tagName: tags.name,
    })
    .from(timeEntryTags)
    .innerJoin(tags, eq(tags.id, timeEntryTags.tagId))
    .where(inArray(timeEntryTags.entryId, entryIds))
    .orderBy(asc(tags.name));
  for (const r of rows) {
    const arr = map.get(r.entryId) ?? [];
    arr.push({ id: r.tagId, name: r.tagName });
    map.set(r.entryId, arr);
  }
  return map;
}

function toView(row: JoinedRow, tagList: { id: string; name: string }[] = []): EntryView {
  const eff = effectiveRate(row.rate, row.projectRate);
  const amount = computeAmount({
    billable: row.billable,
    startAt: row.startAt,
    endAt: row.endAt,
    entryRate: row.rate,
    projectRate: row.projectRate,
  });
  return {
    id: row.id,
    description: row.description,
    project_id: row.projectId,
    project_name: row.projectName,
    client_id: row.clientId,
    client_name: row.clientName,
    start_at: row.startAt.toISOString(),
    end_at: row.endAt ? row.endAt.toISOString() : null,
    duration_seconds: row.endAt ? durationSeconds(row.startAt, row.endAt) : 0,
    billable: row.billable,
    billed: row.billed,
    rate: row.rate === null ? null : Number(row.rate),
    effective_rate: eff,
    amount,
    tag_ids: tagList.map((t) => t.id),
    tag_names: tagList.map((t) => t.name),
    running: row.endAt === null,
  };
}

async function assertProjectOwned(userId: string, projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  const db = getDb();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw errors.validation("Project not found");
  return projectId;
}

async function loadOwnedTagIds(userId: string, tagIds: readonly string[] | undefined): Promise<string[]> {
  if (!tagIds || tagIds.length === 0) return [];
  const unique = Array.from(new Set(tagIds));
  const db = getDb();
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, unique)));
  if (rows.length !== unique.length) throw errors.validation("Unknown tag id");
  return unique;
}

async function setEntryTags(entryId: string, tagIds: string[]): Promise<void> {
  const db = getDb();
  await db.delete(timeEntryTags).where(eq(timeEntryTags.entryId, entryId));
  if (tagIds.length === 0) return;
  await db.insert(timeEntryTags).values(tagIds.map((tagId) => ({ entryId, tagId })));
}

// Product-locked invariant: `billed` can only be true when `billable` is
// true. Turning billable off must clear billed. Any client that tries the
// combination `{ billable: false, billed: true }` gets a 400 here (the DB
// CHECK is the second belt if a code path ever bypasses this helper).
function coerceBilledForPatch(
  input: { billable?: boolean; billed?: boolean },
  currentBillable: boolean,
): { patchBilled?: boolean } {
  const nextBillable = input.billable ?? currentBillable;
  if (input.billed === true && nextBillable !== true) {
    throw errors.validation("billed requires billable=true");
  }
  if (input.billable === false) {
    return { patchBilled: false };
  }
  if (input.billed !== undefined) {
    return { patchBilled: input.billed };
  }
  return {};
}

function normalizeRate(rate: unknown): string | null | undefined {
  if (rate === undefined) return undefined;
  if (rate === null || rate === "") return null;
  const n = typeof rate === "string" ? Number(rate) : (rate as number);
  if (!Number.isFinite(n) || n < 0) throw errors.validation("Invalid rate");
  return n.toFixed(2);
}

function validDescription(d: unknown): d is string {
  return typeof d === "string" && d.length <= MAX_DESCRIPTION;
}

function parseDate(v: unknown, field: string): Date {
  if (v instanceof Date) return v;
  if (typeof v !== "string" || v.length === 0) {
    throw errors.validation(`Invalid ${field}`);
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) throw errors.validation(`Invalid ${field}`);
  return d;
}

export async function getRunningEntry(userId: string): Promise<EntryView | null> {
  const rows = await baseSelect()
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const tagMap = await loadTagsForEntries([row.id]);
  return toView(row, tagMap.get(row.id) ?? []);
}

export async function getEntryById(userId: string, id: string): Promise<EntryView> {
  const rows = await baseSelect()
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw errors.notFound("Entry not found");
  const tagMap = await loadTagsForEntries([row.id]);
  return toView(row, tagMap.get(row.id) ?? []);
}

export interface StartTimerInput {
  description?: string;
  project_id?: string | null;
  tag_ids?: string[];
  billable?: boolean;
  rate?: number | string | null;
  start_at?: string | Date;
}

export async function startTimer(userId: string, input: StartTimerInput = {}): Promise<EntryView> {
  const description = input.description ?? "";
  if (!validDescription(description)) throw errors.validation("Invalid description");
  const projectId = await assertProjectOwned(userId, input.project_id ?? null);
  const tagIds = await loadOwnedTagIds(userId, input.tag_ids);
  const rate = normalizeRate(input.rate);
  const startAt = input.start_at ? parseDate(input.start_at, "start_at") : new Date();

  let billable = input.billable;
  let effectiveEntryRate = rate;
  if (projectId && (billable === undefined || effectiveEntryRate === undefined)) {
    const db = getDb();
    const [proj] = await db
      .select({ defaultBillable: projects.defaultBillable, defaultRate: projects.defaultRate })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (billable === undefined) billable = proj?.defaultBillable ?? true;
  }
  // Locked: running entries are always billable-by-default (Moshe). billed=true
  // is only reachable via the edit sheet / row menu, never on the running dock.
  if (billable === undefined) billable = true;

  const db = getDb();
  try {
    const [row] = await db
      .insert(timeEntries)
      .values({
        userId,
        projectId,
        description,
        startAt,
        endAt: null,
        billable,
        billed: false,
        rate: effectiveEntryRate === undefined ? null : effectiveEntryRate,
      })
      .returning({ id: timeEntries.id });
    if (tagIds.length > 0) await setEntryTags(row.id, tagIds);
    return await getEntryById(userId, row.id);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      const running = await getRunningEntry(userId);
      if (running) throw errors.timerAlreadyRunning(running.id);
      throw errors.conflict("Timer conflict");
    }
    if (code === "23514") throw errors.validation("Invalid entry timestamps");
    throw err;
  }
}

export async function stopTimer(userId: string, now: Date = new Date()): Promise<EntryView> {
  const db = getDb();
  const running = await getRunningEntry(userId);
  if (!running) throw errors.timerNotRunning();
  const startAt = new Date(running.start_at);
  const endAt = now.getTime() <= startAt.getTime() ? new Date(startAt.getTime() + 1000) : now;
  const [row] = await db
    .update(timeEntries)
    .set({ endAt })
    .where(and(eq(timeEntries.id, running.id), eq(timeEntries.userId, userId), isNull(timeEntries.endAt)))
    .returning({ id: timeEntries.id });
  if (!row) throw errors.timerNotRunning();
  return getEntryById(userId, row.id);
}

export interface PatchTimerInput {
  description?: string;
  project_id?: string | null;
  tag_ids?: string[];
  billable?: boolean;
  rate?: number | string | null;
  start_at?: string | Date;
}

export async function patchRunning(userId: string, input: PatchTimerInput): Promise<EntryView> {
  const running = await getRunningEntry(userId);
  if (!running) throw errors.timerNotRunning();
  const patch: Partial<typeof timeEntries.$inferInsert> = {};
  if (input.description !== undefined) {
    if (!validDescription(input.description)) throw errors.validation("Invalid description");
    patch.description = input.description;
  }
  if (input.project_id !== undefined) {
    patch.projectId = await assertProjectOwned(userId, input.project_id);
  }
  if (input.billable !== undefined) {
    patch.billable = input.billable;
    // Running entry can't be billed (Dana: Already-billed is edit-sheet only),
    // but if `billed` ever leaked in on the row we still snap it back to false
    // so the invariant holds.
    if (input.billable === false) patch.billed = false;
  }
  if (input.rate !== undefined) {
    const norm = normalizeRate(input.rate);
    patch.rate = norm === undefined ? null : norm;
  }
  if (input.start_at !== undefined) patch.startAt = parseDate(input.start_at, "start_at");

  const db = getDb();
  if (Object.keys(patch).length > 0) {
    await db
      .update(timeEntries)
      .set(patch)
      .where(
        and(
          eq(timeEntries.id, running.id),
          eq(timeEntries.userId, userId),
          isNull(timeEntries.endAt),
        ),
      );
  }
  if (input.tag_ids !== undefined) {
    const tagIds = await loadOwnedTagIds(userId, input.tag_ids);
    await setEntryTags(running.id, tagIds);
  }
  return getEntryById(userId, running.id);
}

export async function discardRunning(userId: string): Promise<boolean> {
  const db = getDb();
  const res = await db
    .delete(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endAt)))
    .returning({ id: timeEntries.id });
  return res.length > 0;
}

export interface CreateEntryInput {
  description?: string;
  project_id?: string | null;
  tag_ids?: string[];
  billable?: boolean;
  billed?: boolean;
  rate?: number | string | null;
  start_at: string | Date;
  end_at: string | Date;
}

export async function createEntry(userId: string, input: CreateEntryInput): Promise<EntryView> {
  const description = input.description ?? "";
  if (!validDescription(description)) throw errors.validation("Invalid description");
  const projectId = await assertProjectOwned(userId, input.project_id ?? null);
  const tagIds = await loadOwnedTagIds(userId, input.tag_ids);
  const rate = normalizeRate(input.rate);
  const startAt = parseDate(input.start_at, "start_at");
  const endAt = parseDate(input.end_at, "end_at");
  if (startAt.getTime() >= endAt.getTime()) throw errors.validation("start_at must be before end_at");

  const billable = input.billable ?? true;
  if (input.billed === true && billable !== true) {
    throw errors.validation("billed requires billable=true");
  }
  const billed = billable ? input.billed ?? false : false;

  const db = getDb();
  try {
    const [row] = await db
      .insert(timeEntries)
      .values({
        userId,
        projectId,
        description,
        startAt,
        endAt,
        billable,
        billed,
        rate: rate === undefined ? null : rate,
      })
      .returning({ id: timeEntries.id });
    if (tagIds.length > 0) await setEntryTags(row.id, tagIds);
    return await getEntryById(userId, row.id);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23514") throw errors.validation("Invalid entry timestamps");
    throw err;
  }
}

export interface UpdateEntryInput {
  description?: string;
  project_id?: string | null;
  tag_ids?: string[];
  billable?: boolean;
  billed?: boolean;
  rate?: number | string | null;
  start_at?: string | Date;
  end_at?: string | Date;
}

export async function updateEntry(
  userId: string,
  id: string,
  input: UpdateEntryInput,
): Promise<EntryView> {
  const db = getDb();
  const rows = await db
    .select({
      id: timeEntries.id,
      startAt: timeEntries.startAt,
      endAt: timeEntries.endAt,
      billable: timeEntries.billable,
      billed: timeEntries.billed,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
    .limit(1);
  const existing = rows[0];
  if (!existing) throw errors.notFound("Entry not found");
  if (existing.endAt === null) {
    throw errors.conflict("Cannot patch running entry; use /api/timer");
  }

  const patch: Partial<typeof timeEntries.$inferInsert> = {};
  if (input.description !== undefined) {
    if (!validDescription(input.description)) throw errors.validation("Invalid description");
    patch.description = input.description;
  }
  if (input.project_id !== undefined) {
    patch.projectId = await assertProjectOwned(userId, input.project_id);
  }
  if (input.billable !== undefined) patch.billable = input.billable;
  // Product-locked invariant: `billed` only when `billable`. Turning billable
  // off in the same PATCH clears billed; enabling billed while billable is
  // off (and not being turned on in this PATCH) is a client bug and gets a
  // 400. The DB CHECK is the second belt.
  const { patchBilled } = coerceBilledForPatch(
    { billable: input.billable, billed: input.billed },
    existing.billable,
  );
  if (patchBilled !== undefined) patch.billed = patchBilled;
  if (input.rate !== undefined) {
    const norm = normalizeRate(input.rate);
    patch.rate = norm === undefined ? null : norm;
  }
  const nextStart = input.start_at !== undefined ? parseDate(input.start_at, "start_at") : existing.startAt;
  const nextEnd = input.end_at !== undefined ? parseDate(input.end_at, "end_at") : existing.endAt!;
  if (input.start_at !== undefined) patch.startAt = nextStart;
  if (input.end_at !== undefined) patch.endAt = nextEnd;
  if (nextStart.getTime() >= nextEnd.getTime()) throw errors.validation("start_at must be before end_at");

  if (Object.keys(patch).length > 0) {
    await db
      .update(timeEntries)
      .set(patch)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)));
  }
  if (input.tag_ids !== undefined) {
    const tagIds = await loadOwnedTagIds(userId, input.tag_ids);
    await setEntryTags(id, tagIds);
  }
  return getEntryById(userId, id);
}

export async function deleteEntry(userId: string, id: string): Promise<void> {
  const db = getDb();
  const res = await db
    .delete(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
    .returning({ id: timeEntries.id });
  if (res.length === 0) throw errors.notFound("Entry not found");
}

export interface ListEntriesFilters {
  from?: Date;
  to?: Date;
  project_id?: string | null;
  client_id?: string | null;
  tag_id?: string | null;
  billable?: boolean;
  billed?: boolean;
  unbilled?: boolean;
  include_running?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface ListEntriesResult {
  entries: EntryView[];
  next_cursor: string | null;
}

const MAX_LIMIT = 200;

export async function listEntries(userId: string, filters: ListEntriesFilters = {}): Promise<ListEntriesResult> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), MAX_LIMIT);
  const conds = [eq(timeEntries.userId, userId)];
  if (filters.from) conds.push(gte(timeEntries.startAt, filters.from));
  if (filters.to) conds.push(lt(timeEntries.startAt, filters.to));
  if (filters.project_id) conds.push(eq(timeEntries.projectId, filters.project_id));
  if (filters.billable !== undefined) conds.push(eq(timeEntries.billable, filters.billable));
  if (filters.billed !== undefined) conds.push(eq(timeEntries.billed, filters.billed));
  if (filters.unbilled) {
    conds.push(eq(timeEntries.billable, true));
    conds.push(eq(timeEntries.billed, false));
  }
  if (filters.include_running === false) conds.push(sql`${timeEntries.endAt} IS NOT NULL`);
  if (filters.client_id) conds.push(eq(clients.id, filters.client_id));

  const db = getDb();

  if (filters.tag_id) {
    const rows = await db
      .select({ entryId: timeEntryTags.entryId })
      .from(timeEntryTags)
      .where(eq(timeEntryTags.tagId, filters.tag_id));
    const ids = rows.map((r) => r.entryId);
    if (ids.length === 0) return { entries: [], next_cursor: null };
    conds.push(inArray(timeEntries.id, ids));
  }

  if (filters.cursor) {
    const parsed = decodeCursor(filters.cursor);
    if (parsed) {
      const cursorCond = or(
        lt(timeEntries.startAt, parsed.startAt),
        and(eq(timeEntries.startAt, parsed.startAt), lt(timeEntries.id, parsed.id)),
      );
      if (cursorCond) conds.push(cursorCond);
    }
  }

  const rows = await baseSelect()
    .where(and(...conds))
    .orderBy(desc(timeEntries.startAt), desc(timeEntries.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const tagMap = await loadTagsForEntries(page.map((r) => r.id));
  const entries = page.map((r) => toView(r, tagMap.get(r.id) ?? []));
  const last = page[page.length - 1];
  const next_cursor = hasMore && last ? encodeCursor(last.startAt, last.id) : null;
  return { entries, next_cursor };
}

function encodeCursor(startAt: Date, id: string): string {
  return Buffer.from(`${startAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { startAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf("|");
    if (idx < 0) return null;
    const startAt = new Date(raw.slice(0, idx));
    const id = raw.slice(idx + 1);
    if (isNaN(startAt.getTime()) || !id) return null;
    return { startAt, id };
  } catch {
    return null;
  }
}

export const _internal = { gt, lte };
export type { TimeEntry };
