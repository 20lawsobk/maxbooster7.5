import { db } from '../db';
import { consentLogs, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

const CURRENT_TOS_VERSION = '1.0.0';
const CURRENT_PRIVACY_VERSION = '1.0.0';

interface LogConsentInput {
  userId: string;
  consentType: 'tos' | 'privacy' | 'marketing' | 'cookies';
  action: 'accepted' | 'rejected' | 'withdrawn';
  version?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
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
      await db.insert(consentLogs).values({
        userId: input.userId,
        consentType: input.consentType,
        action: input.action,
        version: input.version,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
      });

      logger.info(`Consent logged: ${input.userId} - ${input.consentType} - ${input.action}`);
    } catch (error: unknown) {
      logger.error('Error logging consent:', error);
      throw new Error('Failed to log consent');
    }
  }

  async recordRegistrationConsents(
    userId: string,
    input: RegisterConsentInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const now = new Date();

    // Validate age (COPPA compliance - must be 13+)
    const age = this.calculateAge(input.birthdate);
    if (age < 13) {
      throw new Error('Users must be at least 13 years old to register (COPPA compliance)');
    }

    // Require TOS and Privacy acceptance
    if (!input.tosAccepted) {
      throw new Error('You must accept the Terms of Service to continue');
    }
    if (!input.privacyAccepted) {
      throw new Error('You must accept the Privacy Policy to continue');
    }

    // Update user record with consent timestamps
    await db.update(users).set({
      ageVerified: true,
      tosAcceptedAt: now,
      tosVersion: CURRENT_TOS_VERSION,
      privacyAcceptedAt: now,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      marketingConsent: input.marketingConsent || false,
      marketingConsentAt: input.marketingConsent ? now : null,
    }).where(eq(users.id, userId));

    // Log TOS consent
    await this.logConsent({
      userId,
      consentType: 'tos',
      action: 'accepted',
      version: CURRENT_TOS_VERSION,
      ipAddress,
      userAgent,
    });

    // Log Privacy consent
    await this.logConsent({
      userId,
      consentType: 'privacy',
      action: 'accepted',
      version: CURRENT_PRIVACY_VERSION,
      ipAddress,
      userAgent,
    });

    // Log marketing consent if provided
    if (input.marketingConsent !== undefined) {
      await this.logConsent({
        userId,
        consentType: 'marketing',
        action: input.marketingConsent ? 'accepted' : 'rejected',
        ipAddress,
        userAgent,
      });
    }

    logger.info(`Registration consents recorded for user ${userId}, age: ${age}`);
  }

  calculateAge(birthdate: Date): number {
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  async withdrawConsent(
    userId: string,
    consentType: 'marketing' | 'cookies',
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Log withdrawal
    await this.logConsent({
      userId,
      consentType,
      action: 'withdrawn',
      ipAddress,
      userAgent,
    });

    // Update user record
    if (consentType === 'marketing') {
      await db.update(users).set({
        marketingConsent: false,
        marketingConsentAt: new Date(),
      }).where(eq(users.id, userId));
    }

    logger.info(`Consent withdrawn: ${userId} - ${consentType}`);
  }

  async getUserConsents(userId: string) {
    const user = await db.select({
      tosAcceptedAt: users.tosAcceptedAt,
      tosVersion: users.tosVersion,
      privacyAcceptedAt: users.privacyAcceptedAt,
      privacyVersion: users.privacyVersion,
      marketingConsent: users.marketingConsent,
      marketingConsentAt: users.marketingConsentAt,
      ageVerified: users.ageVerified,
      birthdate: users.birthdate,
    }).from(users).where(eq(users.id, userId)).limit(1);

    return user[0] || null;
  }

  getCurrentPolicyVersions() {
    return {
      tos: CURRENT_TOS_VERSION,
      privacy: CURRENT_PRIVACY_VERSION,
    };
  }
}

export const consentService = new ConsentService();
