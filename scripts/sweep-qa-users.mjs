// Fail closed on leftover qa+<run id> users from this job.
//
// Passwords live only in the test process that generated them. This process
// starts with an empty map and never reads a password file. When a leftover
// email has no in-memory password, print the email and exit 1. Do not delete
// rows, and do not use an admin session.

import pg from "pg";

const passwords = new Map();

function prefix() {
  const runId = process.env.GITHUB_RUN_ID ?? "";
  if (!/^\d+$/.test(runId)) return null;
  return `qa+${runId}-`;
}

function likePattern(value) {
  return `${value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").toLowerCase()}%`;
}

const runPrefix = prefix();
if (!runPrefix) {
  console.log("sweep: GITHUB_RUN_ID unset; nothing to sweep");
  process.exit(0);
}

const connectionString =
  process.env.NODE_ENV === "test"
    ? process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
    : process.env.DATABASE_URL;

if (!connectionString) {
  console.error("sweep: database url is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
let emails = [];
try {
  const result = await client.query(
    "SELECT email FROM users WHERE lower(email) LIKE $1 ESCAPE '\\' ORDER BY email",
    [likePattern(runPrefix)],
  );
  emails = result.rows.map((row) => String(row.email));
} finally {
  await client.end();
}

const missing = [];
for (const email of emails) {
  if (!passwords.has(email.trim().toLowerCase())) missing.push(email);
}

if (missing.length === 0) {
  console.log(`sweep: no leftover users for ${runPrefix}`);
  process.exit(0);
}

for (const email of missing) {
  console.error(`sweep: no in-memory password for ${email}`);
}
process.exit(1);
