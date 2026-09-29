#!/usr/bin/env node
// One-shot ops helper to permanently delete users (and everything they own)
// from the timely database by email.
//
// All owned rows — sessions, clients, projects, tags, time_entries,
// time_entry_tags — are removed automatically via `ON DELETE CASCADE`
// on `user_id`, so deleting the `users` row is sufficient.
//
// Usage (from a machine with DATABASE_URL pointing at the target Postgres):
//
//   # Dry-run: show which users match, delete nothing.
//   DATABASE_URL=postgres://... node scripts/delete-users.mjs \
//     pentest-ariel-a@example.com pentest-ariel-b@example.com
//
//   # Actually delete (requires --yes):
//   DATABASE_URL=postgres://... node scripts/delete-users.mjs --yes \
//     pentest-ariel-a@example.com pentest-ariel-b@example.com
//
//   # Emails can also be supplied via the EMAILS env var, comma-separated:
//   DATABASE_URL=... EMAILS="a@x.com,b@x.com" node scripts/delete-users.mjs --yes
//
// Notes:
// - Email match is case-insensitive (matches the `lower(email)` unique index).
// - Missing emails are reported but do not fail the run.
// - Deletion runs inside a single transaction; either all matched users go
//   away or none do.
// - Never accepts a password on the command line.

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
  if (process.env.EMAILS) {
    for (const e of process.env.EMAILS.split(",")) {
      const trimmed = e.trim();
      if (trimmed) emails.push(trimmed);
    }
  }
  return { emails, confirm };
}

export async function deleteUsersByEmail(pool, emails, { confirm }) {
  if (emails.length === 0) {
    return { matched: [], missing: [], deleted: 0, dryRun: !confirm };
  }
  const lowered = emails.map((e) => e.toLowerCase());
  const client = await pool.connect();
  try {
    const { rows: found } = await client.query(
      'SELECT id, email FROM "users" WHERE lower(email) = ANY($1::text[])',
      [lowered],
    );
    const foundLower = new Set(found.map((r) => r.email.toLowerCase()));
    const missing = emails.filter((e) => !foundLower.has(e.toLowerCase()));

    if (!confirm || found.length === 0) {
      return { matched: found, missing, deleted: 0, dryRun: !confirm };
    }

    await client.query("BEGIN");
    try {
      const ids = found.map((r) => r.id);
      const { rowCount } = await client.query(
        'DELETE FROM "users" WHERE id = ANY($1::uuid[])',
        [ids],
      );
      await client.query("COMMIT");
      return { matched: found, missing, deleted: rowCount ?? 0, dryRun: false };
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
      "Usage: DATABASE_URL=... node scripts/delete-users.mjs [--yes] <email> [email ...]",
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
    const result = await deleteUsersByEmail(pool, emails, { confirm });
    console.log(`Matched ${result.matched.length} user(s):`);
    for (const row of result.matched) {
      console.log(`  - ${row.email} (${row.id})`);
    }
    if (result.missing.length > 0) {
      console.log(`Not found: ${result.missing.join(", ")}`);
    }
    if (result.dryRun) {
      console.log(
        "Dry-run: no rows deleted. Re-run with --yes to permanently delete.",
      );
    } else {
      console.log(`Deleted ${result.deleted} user row(s) (owned data cascaded).`);
    }
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("delete-users.mjs");
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
