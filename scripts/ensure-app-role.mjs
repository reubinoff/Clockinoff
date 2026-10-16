#!/usr/bin/env node
// Creates the NOLOGIN role local and CI migrations expect.
// Cluster-wide: run once per Postgres instance, before db:migrate.
// Production already has clockinoff-prod (Entra).
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
} finally {
  client.release();
  await pool.end();
}
