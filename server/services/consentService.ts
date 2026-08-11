import { db } from "../db";
import { users } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger.js";

const CURRENT_TOS_VERSION = "1.0.0";
const CURRENT_PRIVACY_VERSION = "1.0.0";

interface LogConsentInput {
  userId: string;
  consentType: "tos" | "privacy" | "marketing" | "cookies";
  action: "accepted" | "rejected" | "withdrawn";
  version?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface RegisterConsentInput {
  birthdate: Date;
  tosAccepted: boolean;
  privacyAccepted: boolean;
  marketingConsent?: boolean;
}

export class ConsentService {
  async logConsent(input: LogConsentInput): Promise<void> {
    try {
      // consent_logs table may not be in the shared schema yet; use raw insert to avoid
      // TS2305 from a missing schema export while preserving the runtime contract.
      await (db as any).execute(sql`
        INSERT INTO consent_logs (user_id, consent_type, action, version, ip_address, user_agent, metadata, created_at)
        VALUES (
          ${input.userId},
          ${input.consentType},
          ${input.action},
          ${input.version ?? null},
          ${input.ipAddress ?? null},
          ${input.userAgent ?? null},
          ${input.metadata ? JSON.stringify(input.metadata) : null},
          NOW()
        )
      `);

      logger.info(
        `Consent logged: ${input?.userId} - ${input?.consentType} - ${input?.action}`,
      );
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error logging consent:");
      throw new Error("Failed to log consent");
    }
  }

  async recordRegistrationConsents(
    userId: string,
    input: RegisterConsentInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const now = new Date();

    // Validate age (COPPA compliance - must be 13+)
    const age = this.calculateAge(input?.birthdate);
    if (age < 13) {
      throw new Error(
        "Users must be at least 13 years old to register (COPPA compliance)",
      );
    }

    // Require TOS and Privacy acceptance
    if (!input?.tosAccepted) {
      throw new Error("You must accept the Terms of Service to continue");
    }
    if (!input?.privacyAccepted) {
      throw new Error("You must accept the Privacy Policy to continue");
    }

    // Update user record with consent timestamps.
    // These columns (ageVerified, tosAcceptedAt, etc.) exist at runtime but are not
    // yet reflected in the shared schema type — use scoped casts to avoid TS2339.
    const usersAny = users as any;
    await db
      .update(users)
      .set({
        [usersAny.ageVerified?.name ?? "age_verified"]: true,
        [usersAny.tosAcceptedAt?.name ?? "tos_accepted_at"]: now,
        [usersAny.tosVersion?.name ?? "tos_version"]: CURRENT_TOS_VERSION,
        [usersAny.privacyAcceptedAt?.name ?? "privacy_accepted_at"]: now,
        [usersAny.privacyVersion?.name ?? "privacy_version"]: CURRENT_PRIVACY_VERSION,
        [usersAny.marketingConsent?.name ?? "marketing_consent"]: input.marketingConsent || false,
        [usersAny.marketingConsentAt?.name ?? "marketing_consent_at"]: input.marketingConsent ? now : null,
      } as any)
      .where(eq(users.id, userId));

    // Log TOS consent
    await this.logConsent({
      userId,
      consentType: "tos",
      action: "accepted",
      version: CURRENT_TOS_VERSION,
      ipAddress,
      userAgent,
    });

    // Log Privacy consent
    await this.logConsent({
      userId,
      consentType: "privacy",
      action: "accepted",
      version: CURRENT_PRIVACY_VERSION,
      ipAddress,
      userAgent,
    });

    // Log marketing consent if provided
    if (input?.marketingConsent !== undefined) {
      await this.logConsent({
        userId,
        consentType: "marketing",
        action: input.marketingConsent ? "accepted" : "rejected",
        ipAddress,
        userAgent,
      });
    }

    logger.info(
      `Registration consents recorded for user ${userId}, age: ${age}`,
    );
  }

  calculateAge(birthdate: Date): number {
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today?.getFullYear() - birth?.getFullYear();
    const monthDiff = today?.getMonth() - birth?.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today?.getDate() < birth?.getDate())
    ) {
      age--;
    }
    return age;
  }

  async withdrawConsent(
    userId: string,
    consentType: "marketing" | "cookies",
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    // Log withdrawal
    await this.logConsent({
      userId,
      consentType,
      action: "withdrawn",
      ipAddress,
      userAgent,
    });

    // Update user record
    if (consentType === "marketing") {
      const usersAny = users as any;
      await db
        .update(users)
        .set({
          [usersAny.marketingConsent?.name ?? "marketing_consent"]: false,
          [usersAny.marketingConsentAt?.name ?? "marketing_consent_at"]: new Date(),
        } as any)
        .where(eq(users.id, userId));
    }

    logger.info(`Consent withdrawn: ${userId} - ${consentType}`);
  }

  async getUserConsents(userId: string) {
    // These columns may not yet be in the shared schema type; use raw SQL to avoid TS2339.
    const result = await (db as any).execute(sql`
      SELECT
        tos_accepted_at,
        tos_version,
        privacy_accepted_at,
        privacy_version,
        marketing_consent,
        marketing_consent_at,
        age_verified,
        birthdate
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `);
    const rows = result?.rows ?? result ?? [];
    return (rows as any[])[0] || null;
  }

  getCurrentPolicyVersions() {
    return {
      tos: CURRENT_TOS_VERSION,
      privacy: CURRENT_PRIVACY_VERSION,
    };
  }
}

export const consentService = new ConsentService();
