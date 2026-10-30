/**
 * Registrar Service — Factory
 *
 * Returns the configured registrar provider.
 *
 * Max Booster IS the registrar. The default provider is MaxBoosterRegistrarProvider
 * which handles all domain registrations natively — no EPP or third-party API.
 *
 * Provider selection (REGISTRAR_PROVIDER env var):
 *   "maxbooster" (default) — Max Booster built-in registrar (DNS + DB)
 *   "internal"             — alias for maxbooster (legacy compat)
 *   "epp"                  — External EPP registrar (Verisign OT&E, etc.)
 */

import { MaxBoosterRegistrarProvider } from "./MaxBoosterRegistrarProvider.js";
import { EppRegistrarProvider } from "./EppRegistrarProvider.js";
import type { RegistrarProvider } from "./types.js";
import { logger } from "../../logger.js";

export type { RegistrarProvider };
export type {
  AvailabilityResult,
  RegisterParams,
  RegisterResult,
  RenewResult,
  DomainInfo,
  ContactProfile,
  TransferParams,
  TransferResult,
  DomainPrice,
  DomainLifecycleState,
  DomainEventType,
} from "./types.js";

export { MaxBoosterRegistrarProvider } from "./MaxBoosterRegistrarProvider.js";
export { buildRdapResponse } from "./MaxBoosterRegistrarProvider.js";

// ── Singleton ──────────────────────────────────────────────────────────────

let provider: RegistrarProvider | null = null;

export function getRegistrarProvider(): RegistrarProvider {
  if (provider) return provider;

  const requested = (
    process.env.REGISTRAR_PROVIDER ?? "maxbooster"
  ).toLowerCase();

  switch (requested) {
    case "epp":
      provider = new EppRegistrarProvider();
      logger.info("[RegistrarFactory] Using EPP provider (external registrar)");
      break;

    case "maxbooster":
    case "internal":
    default:
      provider = new MaxBoosterRegistrarProvider();
      logger.info(
        "[RegistrarFactory] Using Max Booster registrar (built-in DNS + DB)",
      );
      break;
  }

  return provider;
}

/** Replace the provider at runtime (useful for tests or hot-swapping). */
export function setRegistrarProvider(newProvider: RegistrarProvider): void {
  provider = newProvider;
  logger.info(
    { provider: provider.name },
    "[RegistrarFactory] Provider overridden",
  );
}
