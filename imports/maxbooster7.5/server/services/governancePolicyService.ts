import { db } from "../db.js";
import { systemSettings } from "../../shared/schema.js";
import { inArray } from "drizzle-orm";
import type { RequestHandler } from "express";

export class GovernancePolicyUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() { super("Governance policy unavailable"); }
}

export class RegistrationDisabledError extends Error {
  readonly statusCode = 403;
  constructor() { super("New registrations are disabled"); }
}

async function readStoredGovernancePolicy() {
  const keys = ["maintenanceMode", "userRegistrationEnabled", "apiRateLimit"];
  const rows = await db.select().from(systemSettings)
    .where(inArray(systemSettings.key, keys.map(key => `platform.${key}`)));
  const policy = { maintenanceMode: false, userRegistrationEnabled: true, apiRateLimit: 1000 };
  for (const row of rows) {
    const key = row.key.replace("platform.", "") as keyof typeof policy;
    const value = JSON.parse(row.value as string);
    if (key === "apiRateLimit") {
      if (!Number.isInteger(value) || value < 1 || value > 1_000_000) throw new Error("Invalid API rate-limit policy");
      policy.apiRateLimit = value;
    } else {
      if (typeof value !== "boolean") throw new Error(`Invalid ${key} policy`);
      policy[key] = value;
    }
  }
  return policy;
}

/** Deliberately uncached: successful writes are visible across workers. */
export async function readGovernancePolicy(): Promise<{
  maintenanceMode: boolean; userRegistrationEnabled: boolean; apiRateLimit: number;
}> {
  try { return await readStoredGovernancePolicy(); }
  catch { throw new GovernancePolicyUnavailableError(); }
}

export const enforceMaintenance: RequestHandler = async (req, res, next) => {
  try {
    const policy = await readGovernancePolicy();
    // Recovery access requires authenticated admin, never a client header.
    if (policy.maintenanceMode && req.user?.role !== "admin") {
      res.setHeader("Retry-After", "60");
      return res.status(503).json({ error: "Platform maintenance in progress" });
    }
    next();
  } catch {
    return res.status(503).json({ error: "Governance policy unavailable" });
  }
};

export async function assertRegistrationEnabled() {
  if (!(await readGovernancePolicy()).userRegistrationEnabled) {
    throw new RegistrationDisabledError();
  }
}