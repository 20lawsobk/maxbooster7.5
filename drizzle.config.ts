import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Skip SSL for local/CI postgres instances; require it for Neon cloud connections.
const useSSL =
  !process.env.CI &&
  (dbUrl.includes("neon.tech") ||
    dbUrl.includes(".neon.") ||
    dbUrl.includes("pooler.supabase"));

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ...(useSSL ? { ssl: "require" } : {}),
  },
});
