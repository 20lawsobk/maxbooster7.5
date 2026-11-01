/**
 * Shared MaxCore (model server) connection config — single source of truth so
 * the URL and API key are not duplicated across modules.
 *
 * The supervised local service inherits its non-administrative channel key.
 */
export const MAXCORE_URL = `http://localhost:${process.env.MODEL_API_PORT || "9878"}`;

export const MAXCORE_API_KEY =
  process.env.PDIM_LOCAL_CHANNEL_TOKEN || process.env.AI_SERVER_KEY || "";
