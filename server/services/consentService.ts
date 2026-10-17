import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { calculateAgeUtc, getAccountEligibilityError } from "../../shared/agePolicy.js";

const CURRENT_TOS_VERSION = "1.0.0";
const CURRENT_PRIVACY_VERSION = "1.0.0";

type ConsentType = "tos" | "privacy" | "marketing" | "cookies";
type ConsentAction = "accepted" | "rejected" | "withdrawn";

interface LogConsentInput {
  userId: string;
  consentType: ConsentType;
  action: ConsentAction;
  version?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface RegisterConsentInput {
  birthdate: Date | string;
  tosAccepted: boolean;
  privacyAccepted: boolean;
  marketingConsent?: boolean;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class ConsentService {
  private async insertConsentLog(
    executor: { execute: (query: unknown) => Promise<unknown> },
    input: LogConsentInput,
  ): Promise<void> {
    await executor.execute(sql`
      INSERT INTO consent_logs (
        user_id,
        consent_type,
        action,
        version,
        ip_address,
        user_agent,
        metadata,
        created_at
      )
      VALUES (
        ${input.userId},
        ${input.consentType},
        ${input.action},
        ${input.version ?? null},
        ${input.ipAddress ?? null},
        ${input.userAgent ?? null},
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
        NOW()
      )
    ` as never);
  }

  async logConsent(input: LogConsentInput): Promise<void> {
    try {
      await this.insertConsentLog(db as never, input);
      logger.info(
        `Consent logged: ${input.userId} - ${input.consentType} - ${input.action}`,
      );
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error logging consent");
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

    // New-registration eligibility only; never backfill/restrict existing accounts.
    const birthdate = input?.birthdate instanceof Date && !Number.isNaN(input.birthdate.getTime())
      ? input.birthdate.toISOString().slice(0, 10)
      : input?.birthdate;
    const eligibilityError = getAccountEligibilityError(birthdate, now);
    if (eligibilityError) throw new Error(eligibilityError);
    const age = this.calculateAge(birthdate);
    if (!input.tosAccepted) {
      throw new Error("You must accept the Terms of Service to continue");
    }
    if (!input.privacyAccepted) {
      throw new Error("You must accept the Privacy Policy to continue");
    }

    const marketingConsent = input.marketingConsent === true;
    const birthdateValue = birthdate;

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO registration_consents (
            user_id,
            birthdate,
            age_verified,
            tos_accepted_at,
            tos_version,
            privacy_accepted_at,
            privacy_version,
            marketing_consent,
            marketing_consent_at,
            created_at,
            updated_at
          )
          VALUES (
            ${userId},
            ${birthdateValue}::date,
            true,
            ${now},
            ${CURRENT_TOS_VERSION},
            ${now},
            ${CURRENT_PRIVACY_VERSION},
            ${marketingConsent},
            ${marketingConsent ? now : null},
            ${now},
            ${now}
          )
          ON CONFLICT (user_id) DO UPDATE SET
            birthdate = EXCLUDED.birthdate,
            age_verified = true,
            tos_accepted_at = EXCLUDED.tos_accepted_at,
            tos_version = EXCLUDED.tos_version,
            privacy_accepted_at = EXCLUDED.privacy_accepted_at,
            privacy_version = EXCLUDED.privacy_version,
            marketing_consent = EXCLUDED.marketing_consent,
            marketing_consent_at = EXCLUDED.marketing_consent_at,
            updated_at = EXCLUDED.updated_at
        `);

        await this.insertConsentLog(tx as never, {
          userId,
          consentType: "tos",
          action: "accepted",
          version: CURRENT_TOS_VERSION,
          ipAddress,
          userAgent,
          metadata: { source: "registration" },
        });
        await this.insertConsentLog(tx as never, {
          userId,
          consentType: "privacy",
          action: "accepted",
          version: CURRENT_PRIVACY_VERSION,
          ipAddress,
          userAgent,
          metadata: { source: "registration" },
        });
        await this.insertConsentLog(tx as never, {
          userId,
          consentType: "marketing",
          action: marketingConsent ? "accepted" : "rejected",
          ipAddress,
          userAgent,
          metadata: { source: "registration" },
        });
      });

      logger.info(
        `Registration consents recorded for user ${userId}, age: ${age}`,
      );
    } catch (error: unknown) {
      logger.warn({ err: error, userId }, "Failed to record registration consents");
      throw new Error("Failed to record registration consents");
    }
  }

  calculateAge(birthdate: Date | string): number {
    const dateOnly = birthdate instanceof Date && !Number.isNaN(birthdate.getTime())
      ? birthdate.toISOString().slice(0, 10) : birthdate;
    const age = calculateAgeUtc(dateOnly);
    if (age === null) throw new Error("A valid date of birth is required");
    return age;
  }

  async withdrawConsent(
    userId: string,
    consentType: "marketing" | "cookies",
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        if (consentType === "marketing") {
          await tx.execute(sql`
            UPDATE registration_consents
            SET
              marketing_consent = false,
              marketing_consent_at = NOW(),
              updated_at = NOW()
            WHERE user_id = ${userId}
          `);
        }

        await this.insertConsentLog(tx as never, {
          userId,
          consentType,
          action: "withdrawn",
          ipAddress,
          userAgent,
        });
      });
      logger.info(`Consent withdrawn: ${userId} - ${consentType}`);
    } catch (error: unknown) {
      logger.warn({ err: error, userId, consentType }, "Failed to withdraw consent");
      throw new Error("Failed to withdraw consent");
    }
  }

  async getUserConsents(userId: string) {
    const result = await db.execute(sql`
      SELECT
        user_id,
        birthdate,
        age_verified,
        tos_accepted_at,
        tos_version,
        privacy_accepted_at,
        privacy_version,
        marketing_consent,
        marketing_consent_at,
        created_at,
        updated_at
      FROM registration_consents
      WHERE user_id = ${userId}
      LIMIT 1
    `);
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
    return rows[0] ?? null;
  }

  getCurrentPolicyVersions() {
    return {
      tos: CURRENT_TOS_VERSION,
      privacy: CURRENT_PRIVACY_VERSION,
    };
  }
}

export const consentService = new ConsentService();
