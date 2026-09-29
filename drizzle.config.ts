import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://timely:timely@localhost:5432/timely",
  },
  strict: true,
  verbose: true,
} satisfies Config;
