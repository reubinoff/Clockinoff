import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // password_hash is nullable since users created via Google OAuth
    // (`google_sub` set, no local password) can exist. Email/password users
    // still have a hash — attaching Google to an existing user never clears it.
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    timezone: text("timezone").notNull().default("Asia/Jerusalem"),
    // 'user' | 'admin'. Check constraint lives in 0005_admin_role.sql.
    role: text("role").notNull().default("user"),
    blockedAt: timestamp("blocked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    googleSubIdx: uniqueIndex("users_google_sub_unique")
      .on(t.googleSub)
      .where(sql`${t.googleSub} IS NOT NULL`),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    // sha256(hex) of the cookie token — never the raw token (#124).
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("clients_user_idx").on(t.userId),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    defaultBillable: boolean("default_billable").notNull().default(false),
    defaultRate: numeric("default_rate", { precision: 12, scale: 2 }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("projects_user_idx").on(t.userId),
    clientIdx: index("projects_client_idx").on(t.clientId),
  }),
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userNameUnique: uniqueIndex("tags_user_name_unique").on(t.userId, sql`lower(${t.name})`),
  }),
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    description: text("description").notNull().default(""),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }),
    billable: boolean("billable").notNull().default(true),
    billed: boolean("billed").notNull().default(false),
    rate: numeric("rate", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("time_entries_user_idx").on(t.userId),
    startIdx: index("time_entries_user_start_idx").on(t.userId, t.startAt),
    projectIdx: index("time_entries_project_idx").on(t.projectId),
    oneRunningPerUser: uniqueIndex("time_entries_one_running_per_user")
      .on(t.userId)
      .where(sql`${t.endAt} IS NULL`),
  }),
);

export const timeEntryTags = pgTable(
  "time_entry_tags",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.entryId, t.tagId] }),
    tagIdx: index("time_entry_tags_tag_idx").on(t.tagId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
