/**
 * Shared MaxCore (model server) connection config — single source of truth so
 * the URL and API key are not duplicated across modules.
 *
 * `ADMIN_KEY` must be supplied via the environment.
 */
export const MAXCORE_URL = `http://localhost:${process.env.MODEL_API_PORT || "9878"}`;

const adminKey = process.env.ADMIN_KEY;
if (!adminKey) {
  throw new Error("ADMIN_KEY is required to connect to MaxCore");
}

export const MAXCORE_API_KEY = adminKey;
