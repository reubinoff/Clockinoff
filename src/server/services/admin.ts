import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { AdminActionKind } from "@/lib/admin-bulk";
import { ADMIN_GUARD, BULK_REMOVE_CAP, BULK_REMOVE_COPY } from "@/lib/admin-copy";
import { asUserRole, type UserRole, type UserStatus } from "@/lib/admin-role";
import {
  parseAdminUserSort,
  type AdminUserSortKey,
} from "@/lib/admin-sort";
import { ApiError, errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { computeAmount } from "@/lib/money";
import { enumerateDayKeys } from "@/lib/report";
import { endOfDayExclusiveInZone, formatDate, startOfDayInZone } from "@/lib/tz";
import { getDb } from "@/server/db/client";
import {
  auditEvents,
  projects,
  sessions,
  timeEntries,
  users,
  type AuditResultBody,
  type AuditTarget,
} from "@/server/db/schema";

export const ADMIN_PAGE_SIZE = 25;
const MAX_STATS_DAYS = 366;

export interface AdminUserView {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  blocked_at: string | null;
  entries_count: number;
}

export interface AdminUserList {
  users: AdminUserView[];
  page: number;
  page_size: number;
  total: number;
  admins_count: number;
}

export interface AdminUserStats {
  entries: number;
  hours: number;
  billable_amount: number | null;
  last_active_at: string | null;
}

export interface AdminUserDetail {
  user: AdminUserView;
  admins_count: number;
  stats: AdminUserStats;
}

export interface AdminDayCount {
  date: string;
  count: number;
}

export interface AdminDayHours {
  date: string;
  hours: number;
}

export interface AdminStats {
  users: number;
  active: number;
  admins: number;
  hours: number;
  entries: number;
  billable_amount: number | null;
  active_users_in_range: number;
  signups_by_day: AdminDayCount[];
  active_users_by_day: AdminDayCount[];
  hours_by_day: AdminDayHours[];
}

function roundHours(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round((seconds / 3600) * 100) / 100;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function toView(
  row: {
    id: string;
    email: string;
    role: string;
    blockedAt: Date | null;
    createdAt: Date;
    entriesCount: number | string;
  },
): AdminUserView {
  return {
    id: row.id,
    email: row.email,
    role: asUserRole(row.role),
    status: row.blockedAt ? "blocked" : "active",
    created_at: row.createdAt.toISOString(),
    blocked_at: row.blockedAt ? row.blockedAt.toISOString() : null,
    entries_count: Number(row.entriesCount) || 0,
  };
}

// Explicit SQL so the subquery stays correlated to the outer `users`
// row. Interpolating Drizzle columns here can bind `users.id` as a
// parameter instead of a column reference, which counts zero rows.
const entriesCountSql = sql<number>`(select count(*)::int from time_entries te where te.user_id = "users"."id")`;

async function countAdmins(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  return Number(row?.n ?? 0);
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Status is derived from blocked_at. Postgres sorts nulls as larger
// than any timestamp, which would put blocked users first on ASC.
// Rank active as 0 so A–Z style "active then blocked" matches the column.
const statusRankSql = sql`case when ${users.blockedAt} is null then 0 else 1 end`;

// Request strings are never concatenated into ORDER BY. parseAdminUserSort
// allowlists the key, then this map yields a Drizzle column (or a fixed
// expression built only from columns). Activity has no users column; the
// count subquery is the same constant the SELECT list uses.
const ADMIN_USER_SORT_COLUMNS = {
  email: users.email,
  role: users.role,
  status: statusRankSql,
  created: users.createdAt,
  activity: entriesCountSql,
} as const satisfies Record<AdminUserSortKey, SQLWrapper>;

function adminUserOrder(sort: string | null | undefined, dir: string | null | undefined): SQL[] {
  const parsed = parseAdminUserSort(sort, dir);
  const primary = ADMIN_USER_SORT_COLUMNS[parsed.sort];
  // Same direction on id so equal keys stay a total order and a flip
  // reverses the tie group as well. dir is only the allowlisted asc|desc,
  // which selects asc() or desc() — it is not interpolated.
  return parsed.dir === "asc"
    ? [asc(primary), asc(users.id)]
    : [desc(primary), desc(users.id)];
}

export async function listAdminUsers(input: {
  q?: string;
  page?: number;
  sort?: string | null;
  dir?: string | null;
}): Promise<AdminUserList> {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : 1;
  const q = input.q?.trim() ?? "";
  const parsedSort = parseAdminUserSort(input.sort, input.dir);
  const db = getDb();
  const filter =
    q.length > 0
      ? ilike(users.email, `%${escapeLike(q)}%`)
      : undefined;

  const [totalRow] = await db
    .select({ n: count() })
    .from(users)
    .where(filter);
  const total = Number(totalRow?.n ?? 0);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      blockedAt: users.blockedAt,
      createdAt: users.createdAt,
      entriesCount: entriesCountSql,
    })
    .from(users)
    .where(filter)
    .orderBy(...adminUserOrder(parsedSort.sort, parsedSort.dir))
    .limit(ADMIN_PAGE_SIZE)
    .offset((page - 1) * ADMIN_PAGE_SIZE);

  return {
    users: rows.map(toView),
    page,
    page_size: ADMIN_PAGE_SIZE,
    total,
    admins_count: await countAdmins(),
  };
}

async function loadView(id: string): Promise<AdminUserView> {
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      blockedAt: users.blockedAt,
      createdAt: users.createdAt,
      entriesCount: entriesCountSql,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) throw errors.notFound("User not found");
  return toView(row);
}

interface EntryFact {
  userId: string;
  startAt: Date;
  endAt: Date | null;
  billable: boolean;
  rate: string | null;
  projectRate: string | null;
}

async function entryFacts(where: SQL | undefined): Promise<EntryFact[]> {
  const db = getDb();
  return db
    .select({
      userId: timeEntries.userId,
      startAt: timeEntries.startAt,
      endAt: timeEntries.endAt,
      billable: timeEntries.billable,
      rate: timeEntries.rate,
      projectRate: projects.defaultRate,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(projects.id, timeEntries.projectId))
    .where(where);
}

function foldAmounts(rows: readonly EntryFact[]): {
  seconds: number;
  billable: number | null;
} {
  let seconds = 0;
  let billable: number | null = null;
  for (const row of rows) {
    if (!row.endAt) continue;
    const ms = row.endAt.getTime() - row.startAt.getTime();
    if (ms > 0) seconds += ms / 1000;
    const amount = computeAmount({
      billable: row.billable,
      startAt: row.startAt,
      endAt: row.endAt,
      entryRate: row.rate,
      projectRate: row.projectRate,
    });
    if (amount == null) continue;
    billable = roundMoney((billable ?? 0) + amount);
  }
  return { seconds, billable };
}

export async function getAdminUser(id: string): Promise<AdminUserDetail> {
  const user = await loadView(id);
  const rows = await entryFacts(eq(timeEntries.userId, id));
  const folded = foldAmounts(rows);
  let last: Date | null = null;
  for (const row of rows) {
    const stamp = row.endAt ?? row.startAt;
    if (!last || stamp > last) last = stamp;
  }
  return {
    user,
    admins_count: await countAdmins(),
    stats: {
      entries: user.entries_count,
      hours: roundHours(folded.seconds),
      billable_amount: folded.billable,
      last_active_at: last ? last.toISOString() : null,
    },
  };
}

type GuardAction = "remove" | "block" | "unblock" | "promote" | "demote";

interface MutateOptions {
  requestId?: string;
  recordAudit?: boolean;
  clientIp?: string | null;
  forwardedFor?: string | null;
  userAgent?: string | null;
  sessionIdHash?: string | null;
}

function resolveRequestId(requestId: string | undefined): string {
  return requestId && requestId.length > 0 ? requestId : randomUUID();
}

interface ClosedAuditInput {
  actorId: string;
  actorEmail: string;
  action: "remove" | "block";
  targets: AuditTarget[];
  requestId: string;
  clientIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  sessionIdHash: string | null;
  result: AuditResultBody;
}

async function insertClosedAudit(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  input: ClosedAuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values({
    actorUserId: input.actorId,
    actorEmail: input.actorEmail,
    action: input.action,
    targets: input.targets,
    requestId: input.requestId,
    clientIp: input.clientIp,
    forwardedFor: input.forwardedFor,
    userAgent: input.userAgent,
    sessionIdHash: input.sessionIdHash,
    status: "completed",
    result: input.result,
    completedAt: new Date(),
  });
}

export interface PendingAuditRow {
  actorUserId: string;
  actorEmail: string;
  action: "remove" | "block";
  targets: AuditTarget[];
  requestId: string;
  clientIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  sessionIdHash: string | null;
}

async function insertPendingAudit(row: PendingAuditRow): Promise<string> {
  const [inserted] = await getDb()
    .insert(auditEvents)
    .values({
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail,
      action: row.action,
      targets: row.targets,
      requestId: row.requestId,
      clientIp: row.clientIp,
      forwardedFor: row.forwardedFor,
      userAgent: row.userAgent,
      sessionIdHash: row.sessionIdHash,
      status: "pending",
    })
    .returning({ id: auditEvents.id });
  if (!inserted) throw new Error("audit insert returned no row");
  return inserted.id;
}

let insertPendingAuditFn = insertPendingAudit;
let beforeBulkTarget: ((index: number, id: string) => void | Promise<void>) | null = null;

export function setPendingAuditInsert(
  fn: ((row: PendingAuditRow) => Promise<string>) | null,
): void {
  insertPendingAuditFn = fn ?? insertPendingAudit;
}

export function setBeforeBulkTarget(
  fn: ((index: number, id: string) => void | Promise<void>) | null,
): void {
  beforeBulkTarget = fn;
}

function deleteRowCount(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0;
}

function auditRequestFields(opts: MutateOptions | undefined): {
  userAgent: string | null;
  sessionIdHash: string | null;
} {
  return {
    userAgent: opts?.userAgent ?? null,
    sessionIdHash: opts?.sessionIdHash ?? null,
  };
}

async function mutate(
  actorId: string,
  targetId: string,
  action: GuardAction,
  opts?: MutateOptions,
): Promise<number> {
  const db = getDb();
  const requestId = resolveRequestId(opts?.requestId);
  const recordAudit = opts?.recordAudit !== false;
  return db.transaction(async (tx) => {
    const lockAdmins = action === "demote";
    const adminRows = lockAdmins
      ? await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, "admin"))
          .orderBy(asc(users.id))
          .for("update")
      : [];
    const [actor] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);
    const [target] = await tx
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        blockedAt: users.blockedAt,
      })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1)
      .for("update");
    if (!target) throw errors.notFound("User not found");

    const soleAdmin = target.role === "admin" && adminRows.length <= 1;
    if (action === "demote" && soleAdmin) {
      throw errors.conflict(ADMIN_GUARD.lastAdminDemote);
    }
    if (action === "remove" && actorId === targetId) {
      throw errors.validation(ADMIN_GUARD.selfRemove);
    }
    if (action === "remove" && target.role === "admin") {
      throw errors.validation(ADMIN_GUARD.adminRemove);
    }
    if (action === "demote" && actorId === targetId) {
      throw errors.conflict(ADMIN_GUARD.selfDemote);
    }
    if (action === "block" && actorId === targetId) {
      throw errors.conflict(ADMIN_GUARD.selfBlock);
    }
    if (action === "block" && target.role === "admin") {
      throw errors.validation(ADMIN_GUARD.adminBlock);
    }
    if (action === "demote" && target.role !== "admin") {
      throw errors.validation("User is not an admin");
    }

    if (action === "remove") {
      const deleted = deleteRowCount(await tx.delete(users).where(eq(users.id, targetId)));
      if (recordAudit) {
        await insertClosedAudit(tx, {
          actorId,
          actorEmail: actor?.email ?? "",
          action: "remove",
          targets: [{ id: targetId, email: target.email }],
          requestId,
          clientIp: opts?.clientIp ?? null,
          forwardedFor: opts?.forwardedFor ?? null,
          ...auditRequestFields(opts),
          result: { removed: [{ id: targetId, deleted }], skipped: [], failed: [] },
        });
      }
      return deleted;
    }
    if (action === "block") {
      if (!target.blockedAt) {
        await tx.update(users).set({ blockedAt: new Date() }).where(eq(users.id, targetId));
      }
      const deleted = deleteRowCount(
        await tx.delete(sessions).where(eq(sessions.userId, targetId)),
      );
      if (recordAudit) {
        await insertClosedAudit(tx, {
          actorId,
          actorEmail: actor?.email ?? "",
          action: "block",
          targets: [{ id: targetId, email: target.email }],
          requestId,
          clientIp: opts?.clientIp ?? null,
          forwardedFor: opts?.forwardedFor ?? null,
          ...auditRequestFields(opts),
          result: { removed: [{ id: targetId, deleted }], skipped: [], failed: [] },
        });
      }
      return deleted;
    }
    if (action === "unblock") {
      await tx.update(users).set({ blockedAt: null }).where(eq(users.id, targetId));
      return 0;
    }
    if (action === "promote") {
      if (target.role !== "admin") {
        await tx.update(users).set({ role: "admin" }).where(eq(users.id, targetId));
      }
      return 0;
    }
    await tx.update(users).set({ role: "user" }).where(eq(users.id, targetId));
    return 0;
  });
}

export async function removeAdminUser(
  actorId: string,
  targetId: string,
  opts?: MutateOptions,
): Promise<number> {
  return mutate(actorId, targetId, "remove", opts);
}

export async function blockAdminUser(
  actorId: string,
  targetId: string,
  opts?: MutateOptions,
): Promise<AdminUserView> {
  await mutate(actorId, targetId, "block", opts);
  return loadView(targetId);
}

export async function unblockAdminUser(actorId: string, targetId: string): Promise<AdminUserView> {
  await mutate(actorId, targetId, "unblock");
  return loadView(targetId);
}

export async function promoteAdminUser(actorId: string, targetId: string): Promise<AdminUserView> {
  await mutate(actorId, targetId, "promote");
  return loadView(targetId);
}

export async function demoteAdminUser(actorId: string, targetId: string): Promise<AdminUserView> {
  await mutate(actorId, targetId, "demote");
  return loadView(targetId);
}

export interface BulkAdminResult {
  applied: number;
  skipped: number;
}

function isBulkSkip(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "CONFLICT" || err.code === "VALIDATION" || err.code === "NOT_FOUND")
  );
}

export interface BulkAdminOptions {
  confirmCount?: unknown;
  requestId?: string;
  clientIp?: string | null;
  forwardedFor?: string | null;
  userAgent?: string | null;
  sessionIdHash?: string | null;
}

function confirmCountMatches(value: unknown, expected: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value === expected;
}

// Ids that bulk remove will try to delete: still present, not the caller,
// and not an admin. Already-removed ids are left out of this count, so a
// replay of the same confirmCount is a mismatch and never reaches DELETE.
async function bulkRemovalTargets(
  actorId: string,
  ids: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  const db = getDb();
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, unique));
  const roleOf = new Map(rows.map((row) => [row.id, row.role]));
  return unique.filter((id) => {
    const role = roleOf.get(id);
    if (role === undefined) return false;
    return id !== actorId && role !== "admin";
  });
}

async function assertBulkBlockAllowed(actorId: string, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.includes(actorId)) throw errors.validation(ADMIN_GUARD.selfBlock);
  const db = getDb();
  const rows = await db
    .select({ role: users.role })
    .from(users)
    .where(inArray(users.id, unique));
  if (rows.some((row) => row.role === "admin")) {
    throw errors.validation(ADMIN_GUARD.adminBlock);
  }
}

async function actorEmailOf(actorId: string): Promise<string> {
  const [row] = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  return row?.email ?? "";
}

async function targetsWithEmail(ids: readonly string[]): Promise<AuditTarget[]> {
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [...ids]));
  const emailOf = new Map(rows.map((row) => [row.id, row.email]));
  return ids.map((id) => ({ id, email: emailOf.get(id) ?? null }));
}

async function finishAudit(
  id: string,
  status: "completed" | "failed",
  result: AuditResultBody,
): Promise<void> {
  await getDb()
    .update(auditEvents)
    .set({ status, result, completedAt: new Date() })
    .where(eq(auditEvents.id, id));
}

// Applies one existing single-user mutator per id. Remove goes through
// `removeAdminUser` (`DELETE FROM users`) so sessions, clients, projects,
// tags, and time_entries → time_entry_tags leave with the FK cascade.
// Bulk remove skips admins and the caller, then requires confirmCount to
// equal that effective length. More than BULK_REMOVE_CAP ids is a 400
// and the list is not truncated. Bulk block refuses an admin or the
// caller up front. Other actions still skip ineligible ids.
export async function bulkAdminUsers(
  actorId: string,
  action: AdminActionKind,
  ids: string[],
  options: BulkAdminOptions = {},
): Promise<BulkAdminResult> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw errors.validation("ids must not be empty");
  }
  if (action === "remove" && ids.length > BULK_REMOVE_CAP) {
    throw errors.validation(BULK_REMOVE_COPY.overCap);
  }
  if (ids.length > ADMIN_PAGE_SIZE) {
    throw errors.validation(`Too many ids (max ${ADMIN_PAGE_SIZE})`);
  }
  const requestId = resolveRequestId(options.requestId);
  const unique = [...new Set(ids)];
  unique.sort((a, b) => {
    if (a === actorId) return 1;
    if (b === actorId) return -1;
    return 0;
  });

  let targets = unique;
  if (action === "remove") {
    targets = await bulkRemovalTargets(actorId, unique);
    if (!confirmCountMatches(options.confirmCount, targets.length)) {
      throw errors.validation(BULK_REMOVE_COPY.mismatch);
    }
  } else if (action === "block") {
    await assertBulkBlockAllowed(actorId, unique);
  }

  const audited = action === "remove" || action === "block";
  let auditId: string | null = null;
  if (audited) {
    try {
      auditId = await insertPendingAuditFn({
        actorUserId: actorId,
        actorEmail: await actorEmailOf(actorId),
        action,
        targets: await targetsWithEmail(targets),
        requestId,
        clientIp: options.clientIp ?? null,
        forwardedFor: options.forwardedFor ?? null,
        userAgent: options.userAgent ?? null,
        sessionIdHash: options.sessionIdHash ?? null,
      });
    } catch (err) {
      logger.exception("[audit] pending insert failed", err);
      throw err;
    }
  }

  const auditOpts = { requestId, recordAudit: false as const };
  let applied = 0;
  const removed: AuditResultBody["removed"] = [];
  const skippedIds: string[] = [];
  const failed: string[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const id = targets[index] ?? "";
    try {
      if (beforeBulkTarget) await beforeBulkTarget(index, id);
      let deleted = 0;
      if (action === "remove") deleted = await removeAdminUser(actorId, id, auditOpts);
      else if (action === "block") deleted = await mutate(actorId, id, "block", auditOpts);
      else if (action === "unblock") await unblockAdminUser(actorId, id);
      else if (action === "promote") await promoteAdminUser(actorId, id);
      else await demoteAdminUser(actorId, id);
      applied += 1;
      if (audited) removed.push({ id, deleted });
    } catch (err) {
      if (isBulkSkip(err)) {
        skippedIds.push(id);
        continue;
      }
      failed.push(id);
      if (auditId) {
        try {
          await finishAudit(auditId, "failed", { removed, skipped: skippedIds, failed });
        } catch (updateErr) {
          logger.exception("[audit] result update failed", updateErr);
        }
      }
      throw err;
    }
  }
  if (auditId) {
    await finishAudit(auditId, "completed", { removed, skipped: skippedIds, failed });
  }
  return { applied, skipped: unique.length - applied };
}

function assertRange(fromKey: string, toKey: string, timezone: string): { from: Date; to: Date; days: string[] } {
  let from: Date;
  let to: Date;
  try {
    from = startOfDayInZone(fromKey, timezone);
    to = endOfDayExclusiveInZone(toKey, timezone);
  } catch {
    throw errors.validation("Invalid date range");
  }
  if (!(from < to)) throw errors.validation("Invalid date range");
  const days = enumerateDayKeys(fromKey, toKey);
  if (days.length === 0 || days.length > MAX_STATS_DAYS) {
    throw errors.validation("Invalid date range");
  }
  return { from, to, days };
}

export async function getAdminStats(
  timezone: string,
  fromKey: string,
  toKey: string,
): Promise<AdminStats> {
  const { from, to, days } = assertRange(fromKey, toKey, timezone);
  const db = getDb();
  // Instance KPIs and series are product aggregates (#195). QA seeds
  // (users.is_test) stay on Admin Users; they do not count here.
  const productUsers = eq(users.isTest, false);
  const [counts] = await db
    .select({
      users: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${users.blockedAt} is null)::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
    })
    .from(users)
    .where(productUsers);

  const signupRows = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(and(productUsers, gte(users.createdAt, from), lt(users.createdAt, to)));

  const facts = await entryFacts(
    and(
      gte(timeEntries.startAt, from),
      lt(timeEntries.startAt, to),
      sql`${timeEntries.userId} in (select ${users.id} from ${users} where ${users.isTest} = false)`,
    ),
  );

  const signups = new Map<string, number>();
  const active = new Map<string, Set<string>>();
  const seconds = new Map<string, number>();
  for (const key of days) {
    signups.set(key, 0);
    active.set(key, new Set());
    seconds.set(key, 0);
  }
  for (const row of signupRows) {
    const key = formatDate(row.createdAt, timezone);
    if (signups.has(key)) signups.set(key, (signups.get(key) ?? 0) + 1);
  }
  const activeInRange = new Set<string>();
  let totalSeconds = 0;
  let billable: number | null = null;
  let entries = 0;
  for (const row of facts) {
    const key = formatDate(row.startAt, timezone);
    if (!signups.has(key)) continue;
    entries += 1;
    active.get(key)?.add(row.userId);
    activeInRange.add(row.userId);
    if (!row.endAt) continue;
    const ms = row.endAt.getTime() - row.startAt.getTime();
    if (ms > 0) {
      const sec = ms / 1000;
      totalSeconds += sec;
      seconds.set(key, (seconds.get(key) ?? 0) + sec);
    }
    const amount = computeAmount({
      billable: row.billable,
      startAt: row.startAt,
      endAt: row.endAt,
      entryRate: row.rate,
      projectRate: row.projectRate,
    });
    if (amount != null) billable = roundMoney((billable ?? 0) + amount);
  }

  return {
    users: Number(counts?.users ?? 0),
    active: Number(counts?.active ?? 0),
    admins: Number(counts?.admins ?? 0),
    hours: roundHours(totalSeconds),
    entries,
    billable_amount: billable,
    active_users_in_range: activeInRange.size,
    signups_by_day: days.map((date) => ({ date, count: signups.get(date) ?? 0 })),
    active_users_by_day: days.map((date) => ({
      date,
      count: active.get(date)?.size ?? 0,
    })),
    hours_by_day: days.map((date) => ({ date, hours: roundHours(seconds.get(date) ?? 0) })),
  };
}
