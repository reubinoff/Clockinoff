import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closeDb } from "./client";

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "__migrations" (
  "name" text PRIMARY KEY,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);
`;

export async function runMigrations(migrationsDir?: string): Promise<string[]> {
  const dir =
    migrationsDir ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../drizzle");
  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(MIGRATIONS_TABLE);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const { rows } = await client.query<{ name: string }>(
        'SELECT name FROM "__migrations" WHERE name = $1',
        [file],
      );
      if (rows.length > 0) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        const statements = sql
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query('INSERT INTO "__migrations" (name) VALUES ($1)', [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

async function main(): Promise<void> {
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log("No migrations to apply.");
  } else {
    console.log(`Applied migrations:\n  - ${applied.join("\n  - ")}`);
  }
  await closeDb();
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
