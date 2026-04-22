/**
 * Registrar Service — Factory
 *
 * Returns the configured registrar provider.
 *
 * Provider selection (env var REGISTRAR_PROVIDER):
 *   "internal"  (default) — Max Booster built-in DB + DNS, no external calls
 *   "epp"                 — Real EPP / reseller API (OpenSRS, Namecheap, Enom, etc.)
 *
 * Future providers can be added here without changing any other code.
 */

import { InternalRegistrarProvider } from './InternalRegistrarProvider.js';
import { EppRegistrarProvider }      from './EppRegistrarProvider.js';
import type { RegistrarProvider }    from './types.js';
import { logger }                    from '../../logger.js';

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
} from './types.js';

// ── Singleton ─────────────────────────────────────────────────────────────────

let _provider: RegistrarProvider | null = null;

export function getRegistrarProvider(): RegistrarProvider {
  if (_provider) return _provider;

  const requested = (process.env.REGISTRAR_PROVIDER ?? 'internal').toLowerCase();

  switch (requested) {
    case 'epp':
      _provider = new EppRegistrarProvider();
      logger.info('[RegistrarFactory] Using EPP provider');
      break;

    case 'internal':
    default:
      _provider = new InternalRegistrarProvider();
      logger.info('[RegistrarFactory] Using Internal provider (Max Booster built-in DNS)');
      break;
  }

  return _provider;
}

/** Replace the provider at runtime (useful for tests or hot-swapping) */
export function setRegistrarProvider(provider: RegistrarProvider): void {
  _provider = provider;
  logger.info({ provider: provider.name }, '[RegistrarFactory] Provider overridden');
}
