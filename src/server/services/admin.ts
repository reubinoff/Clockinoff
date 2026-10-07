import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";
import { ADMIN_GUARD } from "@/lib/admin-copy";
import { asUserRole, type UserRole, type UserStatus } from "@/lib/admin-role";
import { errors } from "@/lib/errors";
import { computeAmount } from "@/lib/money";
import { enumerateDayKeys } from "@/lib/report";
import { endOfDayExclusiveInZone, formatDate, startOfDayInZone } from "@/lib/tz";
import { getDb } from "@/server/db/client";
import { projects, sessions, timeEntries, users } from "@/server/db/schema";

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

export async function listAdminUsers(input: {
  q?: string;
  page?: number;
}): Promise<AdminUserList> {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : 1;
  const q = input.q?.trim() ?? "";
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
    .orderBy(desc(users.createdAt), desc(users.id))
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

async function mutate(
  actorId: string,
  targetId: string,
  action: GuardAction,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const lockAdmins = action === "remove" || action === "demote";
    const adminRows = lockAdmins
      ? await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, "admin"))
          .orderBy(asc(users.id))
          .for("update")
      : [];
    const [target] = await tx
      .select({
        id: users.id,
        role: users.role,
        blockedAt: users.blockedAt,
      })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1)
      .for("update");
    if (!target) throw errors.notFound("User not found");

    const soleAdmin = target.role === "admin" && adminRows.length <= 1;
    if ((action === "remove" || action === "demote") && soleAdmin) {
      throw errors.conflict(ADMIN_GUARD.lastAdmin);
    }
    if (action === "remove" && actorId === targetId) {
      throw errors.conflict(ADMIN_GUARD.selfRemove);
    }
    if (action === "demote" && actorId === targetId) {
      throw errors.conflict(ADMIN_GUARD.selfDemote);
    }
    if (action === "block" && actorId === targetId) {
      throw errors.conflict(ADMIN_GUARD.selfBlock);
    }
    if (action === "demote" && target.role !== "admin") {
      throw errors.validation("User is not an admin");
    }

    if (action === "remove") {
      await tx.delete(users).where(eq(users.id, targetId));
      return;
    }
    if (action === "block") {
      if (!target.blockedAt) {
        await tx.update(users).set({ blockedAt: new Date() }).where(eq(users.id, targetId));
      }
      await tx.delete(sessions).where(eq(sessions.userId, targetId));
      return;
    }
    if (action === "unblock") {
      await tx.update(users).set({ blockedAt: null }).where(eq(users.id, targetId));
      return;
    }
    if (action === "promote") {
      if (target.role !== "admin") {
        await tx.update(users).set({ role: "admin" }).where(eq(users.id, targetId));
      }
      return;
    }
    await tx.update(users).set({ role: "user" }).where(eq(users.id, targetId));
  });
}

export async function removeAdminUser(actorId: string, targetId: string): Promise<void> {
  await mutate(actorId, targetId, "remove");
}

export async function blockAdminUser(actorId: string, targetId: string): Promise<AdminUserView> {
  await mutate(actorId, targetId, "block");
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
  const [counts] = await db
    .select({
      users: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${users.blockedAt} is null)::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
    })
    .from(users);

  const signupRows = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(and(gte(users.createdAt, from), lt(users.createdAt, to)));

  const facts = await entryFacts(
    and(gte(timeEntries.startAt, from), lt(timeEntries.startAt, to)),
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
