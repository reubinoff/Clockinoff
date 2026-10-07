#!/usr/bin/env node
// One-shot ops helper to promote existing users to admin by email.
//
// There is no admin to click Promote for the first operator, so this
// script (and the ADMIN_EMAILS env list, applied on sign-in) is the
// bootstrap. Promoting never demotes anyone who is left off the list.
//
// Usage:
//
//   # Dry-run: show matches, change nothing.
//   DATABASE_URL=postgres://... node scripts/promote-admins.mjs \
//     owner@example.com
//
//   # Apply:
//   DATABASE_URL=postgres://... node scripts/promote-admins.mjs --yes \
//     owner@example.com
//
//   # Or comma-separated ADMIN_EMAILS (same variable the app reads):
//   DATABASE_URL=... ADMIN_EMAILS="a@x.com,b@x.com" \
//     node scripts/promote-admins.mjs --yes
//
// Email match is case-insensitive. Missing emails are reported and do
// not fail the run. Never accepts a password on the command line.

import pg from "pg";

const { Pool } = pg;

function parseArgs(argv) {
  const emails = [];
  let confirm = false;
  for (const raw of argv.slice(2)) {
    if (raw === "--yes" || raw === "-y") {
      confirm = true;
      continue;
    }
    if (raw.startsWith("--")) {
      throw new Error(`Unknown flag: ${raw}`);
    }
    emails.push(raw);
  }
  if (process.env.ADMIN_EMAILS) {
    for (const e of process.env.ADMIN_EMAILS.split(",")) {
      const trimmed = e.trim();
      if (trimmed) emails.push(trimmed);
    }
  }
  if (process.env.EMAILS) {
    for (const e of process.env.EMAILS.split(",")) {
      const trimmed = e.trim();
      if (trimmed) emails.push(trimmed);
    }
  }
  return { emails, confirm };
}

export async function promoteAdminsByEmail(pool, emails, { confirm }) {
  if (emails.length === 0) {
    return { matched: [], missing: [], promoted: 0, dryRun: !confirm };
  }
  const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
  const client = await pool.connect();
  try {
    const { rows: found } = await client.query(
      'SELECT id, email, role FROM "users" WHERE lower(email) = ANY($1::text[]) ORDER BY email',
      [lowered],
    );
    const foundLower = new Set(found.map((r) => r.email.toLowerCase()));
    const missing = emails.filter((e) => !foundLower.has(e.toLowerCase()));
    if (!confirm || found.length === 0) {
      return { matched: found, missing, promoted: 0, dryRun: !confirm };
    }
    await client.query("BEGIN");
    try {
      const ids = found.map((r) => r.id);
      const { rowCount } = await client.query(
        `UPDATE "users" SET role = 'admin' WHERE id = ANY($1::uuid[]) AND role IS DISTINCT FROM 'admin'`,
        [ids],
      );
      await client.query("COMMIT");
      return { matched: found, missing, promoted: rowCount ?? 0, dryRun: false };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}

async function main() {
  const { emails, confirm } = parseArgs(process.argv);
  if (emails.length === 0) {
    console.error(
      "Usage: DATABASE_URL=... node scripts/promote-admins.mjs [--yes] <email> [email ...]",
    );
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const result = await promoteAdminsByEmail(pool, emails, { confirm });
    console.log(`Matched ${result.matched.length} user(s):`);
    for (const row of result.matched) {
      console.log(`  - ${row.email} (${row.id}) role=${row.role}`);
    }
    if (result.missing.length > 0) {
      console.log(`Not found: ${result.missing.join(", ")}`);
    }
    if (result.dryRun) {
      console.log("Dry-run: no roles changed. Re-run with --yes to promote.");
    } else {
      console.log(`Promoted ${result.promoted} user(s) to admin.`);
    }
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("promote-admins.mjs");
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
