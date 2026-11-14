import { defineConfig } from "drizzle-kit";
import { selectApplicationDatabaseUrl } from "./server/config/databaseTarget.js";

const dbUrl = selectApplicationDatabaseUrl(process.env);

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
  schema: [
    "./shared/schema.ts",
    "./shared/registration-consent-schema.ts",
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ...(useSSL ? { ssl: "require" } : {}),
  },
});
