/**
 * Evolution Registry — the REAL, bounded, reversible bridge between the
 * Self-Evolution Engine and the running platform.
 *
 * The Self-Evolution Engine detects genuine industry/competitor changes
 * (RSS + Tavily/Exa) and, in response, writes bounded "enhancement" entries
 * into this registry. Live subsystems (autopilot posting-time selection,
 * autopilot content generation) read these entries at runtime, so a generated
 * enhancement actually changes platform behavior — instead of being written to
 * an inert `.ts` file that nothing imports.
 *
 * Safety model:
 *  - Only a fixed set of KNOWN, bounded knob categories can be written.
 *  - Every payload is sanitized/clamped to safe ranges before it is stored.
 *  - Only CONSUMED_CATEGORIES are actually read by a live subsystem; an
 *    enhancement is "applied" only when its category is consumed and stored.
 *  - Everything is reversible: deactivating an entry reverts behavior to the
 *    real-data / static-default layers below it.
 *  - Real per-artist learned data always wins over these heuristic knobs;
 *    the registry only sits BELOW learned data and ABOVE static fallbacks.
 */

import { logger } from '../logger.js';
import { storageService } from './storageService.js';

export type EnhancementCategory =
  | 'posting_optimization'
  | 'content_optimization'
  | 'distribution_config'
  | 'platform_compliance'
  | 'feature_flag';

/**
 * Categories the running platform actually reads at runtime. An enhancement in
 * one of these is genuinely "applied". Other categories may be recorded for
 * future wiring but are NEVER reported as applied behavior changes.
 */
export const CONSUMED_CATEGORIES: ReadonlySet<EnhancementCategory> = new Set<EnhancementCategory>([
  'posting_optimization',
  'content_optimization',
]);

/**
 * The payload fields that a LIVE subsystem actually reads today, per category.
 * An enhancement is only reported as genuinely `applied` (a real runtime
 * behavior change) when its sanitized payload contains at least one of these
 * effective fields. Other sanitized-but-unread fields are stored for forward
 * compatibility but NEVER counted as an applied behavior change — being in a
 * consumed category is not enough; the payload must carry a knob a reader uses.
 *
 *  - posting_optimization → `optimalHours` (read by getOptimalHoursOverride,
 *    consumed by autopilot posting-window selection), `contentFormatPriority`
 *    and `engagementTargeting` (read by getPostingOptimization, consumed by
 *    autopilot content-type selection and the generation objective).
 *  - content_optimization → `variantCount` / `visualPriority` /
 *    `hashtagStrategy` / `captionLength` / `callToActionStrength` (read by
 *    getContentOptimization, consumed by autopilot content generation and
 *    passed through to advancedSocialAIService.generateAdvancedContent).
 */
const EFFECTIVE_FIELDS: Partial<Record<EnhancementCategory, readonly string[]>> = {
  posting_optimization: ['optimalHours', 'contentFormatPriority', 'engagementTargeting'],
  content_optimization: [
    'variantCount',
    'visualPriority',
    'hashtagStrategy',
    'captionLength',
    'callToActionStrength',
  ],
};

export interface EvolutionEnhancement {
  id: string;
  upgradeId: string;
  changeId: string;
  category: EnhancementCategory;
  title: string;
  source: string;
  payload: Record<string, unknown>;
  active: boolean;
  appliedAt: string;
  deactivatedAt?: string;
}

interface RegistryState {
  enhancements: EvolutionEnhancement[];
  updatedAt: string;
}

export interface ApplyResult {
  applied: boolean;
  consumed: boolean;
  reason?: string;
  enhancement?: EvolutionEnhancement;
}

const HASHTAG_STRATEGIES = ['trending', 'niche', 'branded', 'balanced'] as const;
const CAPTION_LENGTHS = ['short', 'optimal', 'long'] as const;
const CTA_STRENGTHS = ['low', 'medium', 'high'] as const;
const COMPLIANCE_LEVELS = ['standard', 'strict'] as const;
const URGENCIES = ['low', 'medium', 'high', 'critical'] as const;
const CONTENT_FORMATS = ['video', 'carousel', 'image', 'text', 'reel', 'story'] as const;

function oneOf<T extends readonly string[]>(allowed: T, v: unknown): T[number] | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T[number])
    : undefined;
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeHours(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const hours = Array.from(
    new Set(
      v
        .map((h) => clampInt(h, 0, 23))
        .filter((h): h is number => typeof h === 'number'),
    ),
  ).slice(0, 6);
  return hours.length > 0 ? hours : undefined;
}

function sanitizeFormats(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const formats = Array.from(
    new Set(v.map((f) => oneOf(CONTENT_FORMATS, f)).filter((f): f is string => !!f)),
  ).slice(0, CONTENT_FORMATS.length);
  return formats.length > 0 ? formats : undefined;
}

class EvolutionRegistry {
  private readonly STORAGE_KEY = 'evolution-state/registry.json';
  private readonly REFRESH_TTL_MS = 30_000;
  private readonly MAX_ENTRIES = 200;

  private enhancements: EvolutionEnhancement[] = [];
  private lastLoadedAt = 0;
  private loadInFlight: Promise<void> | null = null;

  isCategoryConsumed(category: EnhancementCategory): boolean {
    return CONSUMED_CATEGORIES.has(category);
  }

  /**
   * True only when the sanitized payload carries at least one field a live
   * consumer actually reads. Membership in a consumed category is NOT enough —
   * an enhancement is "applied" only when it can produce a real behavior change.
   */
  private hasEffectiveField(category: EnhancementCategory, payload: Record<string, unknown>): boolean {
    const fields = EFFECTIVE_FIELDS[category];
    if (!fields) return false;
    return fields.some((f) => payload[f] !== undefined);
  }

  /**
   * Sanitize + bound a payload for a category. Returns the cleaned payload, or
   * null with a reason when the payload has no usable, in-bounds content.
   */
  sanitize(
    category: EnhancementCategory,
    raw: Record<string, unknown>,
  ): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
    const p = raw || {};
    switch (category) {
      case 'posting_optimization': {
        const out: Record<string, unknown> = {};
        if (typeof p.platform === 'string') out.platform = p.platform.toLowerCase().slice(0, 40);
        const hours = sanitizeHours(p.optimalHours);
        if (hours) out.optimalHours = hours;
        const formats = sanitizeFormats(p.contentFormatPriority);
        if (formats) out.contentFormatPriority = formats;
        const engagement = oneOf(['standard', 'high'] as const, p.engagementTargeting);
        if (engagement) out.engagementTargeting = engagement;
        if (!out.optimalHours && !out.contentFormatPriority && !out.engagementTargeting) {
          return { ok: false, reason: 'posting_optimization has no usable bounded knobs' };
        }
        return { ok: true, payload: out };
      }
      case 'content_optimization': {
        const out: Record<string, unknown> = {};
        if (typeof p.platform === 'string') out.platform = p.platform.toLowerCase().slice(0, 40);
        const hs = oneOf(HASHTAG_STRATEGIES, p.hashtagStrategy);
        if (hs) out.hashtagStrategy = hs;
        const cl = oneOf(CAPTION_LENGTHS, p.captionLength);
        if (cl) out.captionLength = cl;
        const cta = oneOf(CTA_STRENGTHS, p.callToActionStrength);
        if (cta) out.callToActionStrength = cta;
        if (typeof p.visualPriority === 'boolean') out.visualPriority = p.visualPriority;
        const vc = clampInt(p.variantCount, 1, 5);
        if (vc !== undefined) out.variantCount = vc;
        if (Object.keys(out).filter((k) => k !== 'platform').length === 0) {
          return { ok: false, reason: 'content_optimization has no usable bounded knobs' };
        }
        return { ok: true, payload: out };
      }
      case 'distribution_config': {
        const out: Record<string, unknown> = {};
        if (typeof p.autoFormat === 'boolean') out.autoFormat = p.autoFormat;
        if (typeof p.qualityCheck === 'boolean') out.qualityCheck = p.qualityCheck;
        if (typeof p.metadataValidation === 'boolean') out.metadataValidation = p.metadataValidation;
        const level = oneOf(COMPLIANCE_LEVELS, p.complianceLevel);
        if (level) out.complianceLevel = level;
        if (Object.keys(out).length === 0) {
          return { ok: false, reason: 'distribution_config has no usable bounded knobs' };
        }
        return { ok: true, payload: out };
      }
      case 'platform_compliance': {
        const out: Record<string, unknown> = {};
        if (typeof p.platform === 'string') out.platform = p.platform.toLowerCase().slice(0, 40);
        if (typeof p.requirement === 'string') out.requirement = p.requirement.slice(0, 500);
        const urgency = oneOf(URGENCIES, p.urgency);
        if (urgency) out.urgency = urgency;
        if (typeof p.autoApply === 'boolean') out.autoApply = p.autoApply;
        if (!out.platform || !out.requirement) {
          return { ok: false, reason: 'platform_compliance requires platform + requirement' };
        }
        return { ok: true, payload: out };
      }
      case 'feature_flag': {
        const name = typeof p.name === 'string' ? p.name.slice(0, 80) : '';
        if (!name) return { ok: false, reason: 'feature_flag requires a name' };
        const out: Record<string, unknown> = { name };
        out.enabled = typeof p.enabled === 'boolean' ? p.enabled : false;
        const rollout = clampInt(p.rolloutPercentage, 0, 100);
        out.rolloutPercentage = rollout ?? 0;
        return { ok: true, payload: out };
      }
      default:
        return { ok: false, reason: `unknown category ${String(category)}` };
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  async load(force = false): Promise<void> {
    if (!force && Date.now() - this.lastLoadedAt < this.REFRESH_TTL_MS) return;
    if (this.loadInFlight) return this.loadInFlight;
    this.loadInFlight = (async () => {
      try {
        const buf = await storageService.downloadFile(this.STORAGE_KEY);
        const state = JSON.parse(buf.toString('utf-8')) as RegistryState;
        if (Array.isArray(state.enhancements)) {
          this.enhancements = state.enhancements;
          logger.info(
            `[EvolutionRegistry] Loaded ${this.enhancements.length} enhancement(s) ` +
              `(${this.enhancements.filter((e) => e.active).length} active)`,
          );
        }
      } catch {
        // No prior registry — start empty (first boot or fresh install).
      } finally {
        this.lastLoadedAt = Date.now();
        this.loadInFlight = null;
      }
    })();
    return this.loadInFlight;
  }

  private async persist(): Promise<void> {
    try {
      const state: RegistryState = {
        enhancements: this.enhancements,
        updatedAt: new Date().toISOString(),
      };
      await storageService.uploadFile(
        Buffer.from(JSON.stringify(state, null, 2), 'utf-8'),
        this.STORAGE_KEY,
        'application/json',
      );
    } catch (e) {
      logger.warn({ err: e }, '[EvolutionRegistry] Failed to persist registry:');
    }
  }

  /** Fire-and-forget TTL refresh so other cluster workers converge over time. */
  private maybeRefresh(): void {
    if (Date.now() - this.lastLoadedAt >= this.REFRESH_TTL_MS) {
      void this.load().catch(() => {});
    }
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  /**
   * Apply (upsert) an enhancement. Sanitizes the payload, stores it active, and
   * persists. `applied` is true only when the category is genuinely consumed by
   * a live subsystem AND the payload was valid.
   */
  async apply(input: {
    upgradeId: string;
    changeId: string;
    category: EnhancementCategory;
    title: string;
    source: string;
    payload: Record<string, unknown>;
  }): Promise<ApplyResult> {
    await this.load();
    const clean = this.sanitize(input.category, input.payload);
    if (!clean.ok) {
      return { applied: false, consumed: this.isCategoryConsumed(input.category), reason: clean.reason };
    }

    const id = `${input.category}:${input.changeId}`;
    const enhancement: EvolutionEnhancement = {
      id,
      upgradeId: input.upgradeId,
      changeId: input.changeId,
      category: input.category,
      title: input.title.slice(0, 200),
      source: input.source,
      payload: clean.payload,
      active: true,
      appliedAt: new Date().toISOString(),
    };

    const existingIdx = this.enhancements.findIndex((e) => e.id === id);
    if (existingIdx >= 0) {
      this.enhancements[existingIdx] = enhancement;
    } else {
      this.enhancements.push(enhancement);
    }
    if (this.enhancements.length > this.MAX_ENTRIES) {
      this.enhancements = this.enhancements.slice(-this.MAX_ENTRIES);
    }
    await this.persist();

    const consumed = this.isCategoryConsumed(input.category);
    const effective = consumed && this.hasEffectiveField(input.category, clean.payload);
    return {
      applied: effective,
      consumed,
      enhancement,
      reason:
        consumed && !effective
          ? `payload has no consumer-read (effective) knob for "${input.category}" yet — recorded as advisory`
          : undefined,
    };
  }

  /** Deactivate every active entry (used by rollback). Returns count reverted. */
  async deactivateAll(): Promise<number> {
    await this.load();
    let count = 0;
    const now = new Date().toISOString();
    for (const e of this.enhancements) {
      if (e.active) {
        e.active = false;
        e.deactivatedAt = now;
        count++;
      }
    }
    if (count > 0) await this.persist();
    return count;
  }

  /** Deactivate all entries produced by a specific upgrade. */
  async deactivateByUpgrade(upgradeId: string): Promise<number> {
    await this.load();
    let count = 0;
    const now = new Date().toISOString();
    for (const e of this.enhancements) {
      if (e.active && e.upgradeId === upgradeId) {
        e.active = false;
        e.deactivatedAt = now;
        count++;
      }
    }
    if (count > 0) await this.persist();
    return count;
  }

  // ── Consumer getters (read by live subsystems) ──────────────────────────

  private activeOfCategory(category: EnhancementCategory): EvolutionEnhancement[] {
    return this.enhancements.filter((e) => e.active && e.category === category);
  }

  /** Most-recent matching active posting-hours override, or null. */
  getOptimalHoursOverride(platform: string): number[] | null {
    this.maybeRefresh();
    const key = platform.toLowerCase();
    const entries = this.activeOfCategory('posting_optimization')
      .filter((e) => Array.isArray((e.payload as { optimalHours?: number[] }).optimalHours))
      .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
    // Platform-specific first, then global (no platform), most-recent wins.
    const match =
      entries.find((e) => (e.payload as { platform?: string }).platform === key) ||
      entries.find((e) => !(e.payload as { platform?: string }).platform);
    const hours = match ? (match.payload as { optimalHours?: number[] }).optimalHours : undefined;
    return hours && hours.length > 0 ? hours : null;
  }

  /** Merged active content-optimization knobs for a platform (or global), or null. */
  getContentOptimization(platform?: string): {
    hashtagStrategy?: string;
    captionLength?: string;
    callToActionStrength?: string;
    visualPriority?: boolean;
    variantCount?: number;
  } | null {
    this.maybeRefresh();
    const key = platform?.toLowerCase();
    const entries = this.activeOfCategory('content_optimization').sort((a, b) =>
      a.appliedAt.localeCompare(b.appliedAt),
    );
    if (entries.length === 0) return null;
    const merged: Record<string, unknown> = {};
    // Apply global first, then platform-specific so the platform override wins.
    for (const e of entries) {
      const ep = e.payload as Record<string, unknown>;
      if (!ep.platform) Object.assign(merged, ep);
    }
    if (key) {
      for (const e of entries) {
        const ep = e.payload as Record<string, unknown>;
        if (ep.platform === key) Object.assign(merged, ep);
      }
    }
    delete merged.platform;
    return Object.keys(merged).length > 0 ? merged : null;
  }

  /**
   * Merged active posting-optimization knobs (excluding optimalHours, which has
   * its own getter) for a platform (or global), or null. Read by autopilot
   * content-type selection (contentFormatPriority) and the generation objective
   * (engagementTargeting). Global entries apply first, then platform-specific
   * entries override them; most-recent wins within each scope.
   */
  getPostingOptimization(platform?: string): {
    contentFormatPriority?: string[];
    engagementTargeting?: 'standard' | 'high';
  } | null {
    this.maybeRefresh();
    const key = platform?.toLowerCase();
    const entries = this.activeOfCategory('posting_optimization').sort((a, b) =>
      a.appliedAt.localeCompare(b.appliedAt),
    );
    if (entries.length === 0) return null;
    const merged: { contentFormatPriority?: string[]; engagementTargeting?: 'standard' | 'high' } = {};
    const take = (ep: Record<string, unknown>): void => {
      if (Array.isArray(ep.contentFormatPriority) && ep.contentFormatPriority.length > 0) {
        merged.contentFormatPriority = ep.contentFormatPriority as string[];
      }
      if (ep.engagementTargeting === 'standard' || ep.engagementTargeting === 'high') {
        merged.engagementTargeting = ep.engagementTargeting;
      }
    };
    // Apply global first, then platform-specific so the platform override wins.
    for (const e of entries) {
      const ep = e.payload as Record<string, unknown>;
      if (!ep.platform) take(ep);
    }
    if (key) {
      for (const e of entries) {
        const ep = e.payload as Record<string, unknown>;
        if (ep.platform === key) take(ep);
      }
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }

  // ── Status / introspection ──────────────────────────────────────────────

  getActiveEnhancements(limit = 50): EvolutionEnhancement[] {
    return this.enhancements
      .filter((e) => e.active)
      .slice(-limit)
      .map((e) => ({ ...e }));
  }

  getStats(): {
    total: number;
    active: number;
    consumedActive: number;
    byCategory: Record<string, number>;
  } {
    const active = this.enhancements.filter((e) => e.active);
    const byCategory: Record<string, number> = {};
    for (const e of active) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    }
    return {
      total: this.enhancements.length,
      active: active.length,
      consumedActive: active.filter((e) => this.isCategoryConsumed(e.category)).length,
      byCategory,
    };
  }
}

export const evolutionRegistry = new EvolutionRegistry();
