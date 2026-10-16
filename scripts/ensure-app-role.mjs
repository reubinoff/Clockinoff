#!/usr/bin/env node
// Creates the NOLOGIN roles local and CI migrations expect.
// Cluster-wide: run once per Postgres instance, before db:migrate.
// Production already has clockinoff-prod (Entra). audit_purge is
// pre-created out of band there too — 0011 never runs CREATE ROLE.
// Do not run this script against production.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
  const { rows } = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'clockinoff-prod'",
  );
  if (rows.length === 0) {
    await client.query('CREATE ROLE "clockinoff-prod" NOLOGIN');
    console.log('created role "clockinoff-prod" NOLOGIN');
  } else {
    console.log('role "clockinoff-prod" already exists');
  }

  const purge = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'audit_purge'",
  );
  if (purge.rows.length === 0) {
    await client.query("CREATE ROLE audit_purge NOLOGIN");
    console.log("created role audit_purge NOLOGIN");
  } else {
    await client.query("ALTER ROLE audit_purge NOLOGIN");
    console.log("role audit_purge already exists");
  }
  await client.query("GRANT audit_purge TO CURRENT_USER");
} finally {
  client.release();
  await pool.end();
}
