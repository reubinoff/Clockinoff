#!/usr/bin/env node
// One-shot ops helper to demote users from admin by email.
//
// QA admin accounts are short-lived: demote them after their gate
// passes. Dry-run unless --yes. Does not take a password, and does
// not write credentials anywhere.
//
// Usage:
//
//   DATABASE_URL=postgres://... node scripts/demote-user.mjs \
//     person@example.com
//
//   DATABASE_URL=postgres://... node scripts/demote-user.mjs --yes \
//     person@example.com
//
// Email match is case-insensitive. Missing emails are reported and do
// not fail the run.

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
    if (raw === "--help" || raw === "-h") {
      return { emails, confirm, help: true };
    }
    if (raw.startsWith("--")) {
      throw new Error(`Unknown flag: ${raw}`);
    }
    emails.push(raw);
  }
  if (process.env.EMAILS) {
    for (const e of process.env.EMAILS.split(",")) {
      const trimmed = e.trim();
      if (trimmed) emails.push(trimmed);
    }
  }
  return { emails, confirm, help: false };
}

export async function demoteUsersByEmail(pool, emails, { confirm }) {
  if (emails.length === 0) {
    return { matched: [], missing: [], demoted: 0, dryRun: !confirm };
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
      return { matched: found, missing, demoted: 0, dryRun: !confirm };
    }
    await client.query("BEGIN");
    try {
      const ids = found.map((r) => r.id);
      const { rowCount } = await client.query(
        `UPDATE "users" SET role = 'user' WHERE id = ANY($1::uuid[]) AND role IS DISTINCT FROM 'user'`,
        [ids],
      );
      await client.query("COMMIT");
      return { matched: found, missing, demoted: rowCount ?? 0, dryRun: false };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}

async function main() {
  const { emails, confirm, help } = parseArgs(process.argv);
  if (help || emails.length === 0) {
    console.error(
      "Usage: DATABASE_URL=... node scripts/demote-user.mjs [--yes] <email> [email ...]",
    );
    process.exit(help ? 0 : 2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const result = await demoteUsersByEmail(pool, emails, { confirm });
    console.log(`Matched ${result.matched.length} user(s):`);
    for (const row of result.matched) {
      console.log(`  - ${row.email} (${row.id}) role=${row.role}`);
    }
    if (result.missing.length > 0) {
      console.log(`Not found: ${result.missing.join(", ")}`);
    }
    if (result.dryRun) {
      console.log("Dry-run: no roles changed. Re-run with --yes to demote.");
    } else {
      console.log(`Demoted ${result.demoted} user(s).`);
    }
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("demote-user.mjs");
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
