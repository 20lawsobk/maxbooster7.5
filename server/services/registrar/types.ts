/**
 * Registrar Service — Type Definitions
 *
 * Defines the provider-agnostic interface Max Booster uses to register,
 * renew, transfer, and release domains.  Any backend (internal DB-only,
 * EPP, or a reseller API like OpenSRS / Namecheap) implements this contract.
 */

// ── Domain pricing ────────────────────────────────────────────────────────────

export interface DomainPrice {
  tld:               string;
  registrationCents: number;
  renewalCents:      number;
  transferCents?:    number;
  isPremium:         boolean;
}

// ── Availability ──────────────────────────────────────────────────────────────

export interface AvailabilityResult {
  fqdn:      string;
  available: boolean;
  price?:    DomainPrice;
  /** Domain is registered and managed within Max Booster's own system */
  ownedByPlatform?: boolean;
}

// ── Contact profile ───────────────────────────────────────────────────────────

export interface ContactProfile {
  name:       string;
  org?:       string;
  email:      string;
  phone?:     string;
  address?: {
    street:     string;
    city:       string;
    state:      string;
    postalCode: string;
    country:    string;   // ISO 3166-1 alpha-2
  };
}

// ── Registration ──────────────────────────────────────────────────────────────

export interface RegisterParams {
  fqdn:           string;
  userId:         string;
  contact:        ContactProfile;
  nameservers:    string[];
  years:          number;
  privacyEnabled: boolean;
}

export interface RegisterResult {
  ok:          true;
  registryId?: string;           // opaque ID from upstream registrar / registry
  expiresAt:   Date;
  nameservers: string[];
  status:      string;           // 'active' | 'pendingVerification' | 'pendingCreate'
  message?:    string;
}

// ── Renew ─────────────────────────────────────────────────────────────────────

export interface RenewResult {
  ok:        true;
  expiresAt: Date;
  years:     number;
}

// ── Transfer in ───────────────────────────────────────────────────────────────

export interface TransferParams {
  fqdn:     string;
  userId:   string;
  authCode: string;
  contact:  ContactProfile;
}

export interface TransferResult {
  ok:          true;
  status:      'pendingTransfer' | 'active';
  expiresAt?:  Date;
  message?:    string;
}

// ── Domain info ───────────────────────────────────────────────────────────────

export interface DomainInfo {
  fqdn:        string;
  status:      string;
  expiresAt?:  Date;
  nameservers: string[];
  registryId?: string;
  autoRenew:   boolean;
  locked:      boolean;
  contacts?:   Partial<Record<'registrant' | 'admin' | 'tech' | 'billing', ContactProfile>>;
}

// ── Domain lifecycle states ───────────────────────────────────────────────────
// Full state machine as surfaced in the DB claimed_domains.status field

export type DomainLifecycleState =
  | 'requested'          // user initiated, pre-registrar call
  | 'pending_create'     // submitted to registrar, awaiting confirmation
  | 'active'             // registered and DNS is live
  | 'platform_managed'  // BYOD — DNS hosted here but registered externally
  | 'pending_verification' // ICANN/registry email verification outstanding
  | 'expiring_soon'      // within 30 days of expiry
  | 'grace'              // expired at registry, in grace period (DNS still works)
  | 'non_renewing'       // subscription canceled; will not auto-renew
  | 'released'           // soft-released from quota; no longer consuming a slot
  | 'expired'            // past grace period, DNS removed
  | 'transferring'       // transfer-in in progress
  | 'suspended';         // held by registry (clientHold / serverHold)

// ── Provider interface ────────────────────────────────────────────────────────

export interface RegistrarProvider {
  /** Human-readable name of this provider backend (for logging) */
  readonly name: string;

  /** Check if a domain is available for registration */
  checkAvailability(fqdn: string): Promise<AvailabilityResult>;

  /** Register a new domain */
  registerDomain(params: RegisterParams): Promise<RegisterResult>;

  /** Renew an existing domain for N additional years */
  renewDomain(fqdn: string, years: number): Promise<RenewResult>;

  /** Update the nameservers on a registered domain */
  setNameservers(fqdn: string, nameservers: string[]): Promise<void>;

  /** Retrieve current info from the registrar */
  getDomainInfo(fqdn: string): Promise<DomainInfo>;

  /**
   * Soft-release: stop auto-renew and remove from quota count.
   * The domain stays registered at the registry until it expires naturally.
   */
  releaseDomain(fqdn: string): Promise<void>;

  /** Initiate a transfer-in from another registrar */
  initiateTransferIn(params: TransferParams): Promise<TransferResult>;

  /** Check if this provider is properly configured and reachable */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

// ── Domain event types (for the event ledger) ─────────────────────────────────

export type DomainEventType =
  | 'DomainRegistered'
  | 'DomainRenewed'
  | 'DomainReleased'
  | 'DomainTransferInitiated'
  | 'DomainTransferCompleted'
  | 'DomainNameserversUpdated'
  | 'DomainExpiringSoon'
  | 'DomainEnteredGrace'
  | 'DomainExpired'
  | 'DomainSuspended'
  | 'DomainContactUpdated'
  | 'DomainAutoRenewChanged'
  | 'QuotaEnforced'
  | 'SubscriptionCouplingUpdated';
