import { db } from '../db.js';
import { 
  splitContracts, 
  splitContractSignatures,
  projectRoyaltySplits,
  releases,
  users,
  type SplitContract,
  type InsertSplitContract,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, or } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';

export type ParticipantRole = 'artist' | 'producer' | 'writer' | 'label' | 'publisher' | 'manager' | 'featured_artist' | 'sample_owner' | 'other';

export interface SplitParticipant {
  userId: string;
  name: string;
  email: string;
  role: ParticipantRole;
  splitPercentage: number;
  payoutMethod?: string;
  ipi?: string;
  pro?: string;
  publisherName?: string;
  isGuestFeature?: boolean;
  sampleClearance?: {
    sampleId: string;
    originalWork: string;
    clearanceDate: Date;
    upfrontFee?: number;
    rollingRoyalty: number;
  };
}

export interface SplitChangeRecord {
  id: string;
  timestamp: Date;
  previousParticipants: SplitParticipant[];
  newParticipants: SplitParticipant[];
  reason: string;
  approvedBy: string[];
  effectiveDate: Date;
}

export interface GuestFeatureSplit {
  guestArtistId: string;
  guestArtistName: string;
  splitPercentage: number;
  territories?: string[];
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface SampleClearanceRoyalty {
  sampleId: string;
  originalWorkTitle: string;
  originalArtist: string;
  sampleOwnerId: string;
  upfrontFee: number;
  rollingRoyaltyPercentage: number;
  clearanceDate: Date;
  territoryRestrictions?: string[];
  termMonths?: number;
}

export interface SplitValidationResult {
  isValid: boolean;
  totalPercentage: number;
  errors: string[];
  warnings: string[];
}

export class SplitService {
  validateSplits(participants: SplitParticipant[]): SplitValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const totalPercentage = participants.reduce((sum, p) => sum + p.splitPercentage, 0);
    
    if (Math.abs(totalPercentage - 100) > 0.01) {
      errors.push(`Split percentages must total 100%, got ${totalPercentage.toFixed(2)}%`);
    }
    
    const roleMap = new Map<ParticipantRole, number>();
    for (const p of participants) {
      const count = roleMap.get(p.role) || 0;
      roleMap.set(p.role, count + 1);
    }
    
    if (!roleMap.has('artist') && !roleMap.has('featured_artist')) {
      warnings.push('No artist or featured artist specified in splits');
    }
    
    for (const p of participants) {
      if (p.splitPercentage < 0) {
        errors.push(`${p.name} has negative split percentage`);
      }
      if (p.splitPercentage > 100) {
        errors.push(`${p.name} has split percentage over 100%`);
      }
    }
    
    const userIds = participants.map(p => p.userId);
    const uniqueUserIds = new Set(userIds);
    if (userIds.length !== uniqueUserIds.size) {
      warnings.push('Duplicate participants detected - splits will be combined');
    }
    
    return {
      isValid: errors.length === 0,
      totalPercentage,
      errors,
      warnings,
    };
  }

  async createSplitContract(
    releaseId: string,
    creatorId: string,
    contractName: string,
    participants: SplitParticipant[],
    effectiveDate: Date,
    terms?: {
      territoryRestrictions?: string[];
      dspRestrictions?: string[];
      minimumGuarantee?: number;
      advanceRecoupment?: boolean;
      auditRights?: boolean;
      termYears?: number;
      autoRenewal?: boolean;
    }
  ): Promise<SplitContract> {
    const validation = this.validateSplits(participants);
    if (!validation.isValid) {
      throw new Error(`Invalid splits: ${validation.errors.join(', ')}`);
    }

    const contractData: InsertSplitContract = {
      releaseId,
      creatorId,
      contractName,
      status: 'draft',
      effectiveDate,
      totalPercentage: String(validation.totalPercentage),
      participants: participants.map(p => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        role: p.role as 'artist' | 'producer' | 'writer' | 'label' | 'publisher' | 'manager' | 'other',
        splitPercentage: p.splitPercentage,
        payoutMethod: p.payoutMethod || 'default',
        ipi: p.ipi,
        pro: p.pro,
        publisherName: p.publisherName,
      })),
      terms,
    };

    const [contract] = await db
      .insert(splitContracts)
      .values(contractData)
      .returning();

    logger.info(`Created split contract ${contract.id} for release ${releaseId}`);
    return contract;
  }

  async getContractByRelease(releaseId: string): Promise<SplitContract | null> {
    const [contract] = await db
      .select()
      .from(splitContracts)
      .where(
        and(
          eq(splitContracts.releaseId, releaseId),
          eq(splitContracts.status, 'active')
        )
      )
      .limit(1);

    return contract || null;
  }

  async addGuestFeatureSplit(
    contractId: string,
    guestFeature: GuestFeatureSplit
  ): Promise<SplitContract> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const participants = (contract.participants as SplitParticipant[]) || [];
    
    const guestParticipant: SplitParticipant = {
      userId: guestFeature.guestArtistId,
      name: guestFeature.guestArtistName,
      email: '',
      role: 'featured_artist',
      splitPercentage: guestFeature.splitPercentage,
      isGuestFeature: true,
    };

    const totalCurrentSplit = participants.reduce((sum, p) => sum + p.splitPercentage, 0);
    const reduction = guestFeature.splitPercentage / participants.length;
    
    const adjustedParticipants = participants.map(p => ({
      ...p,
      splitPercentage: p.splitPercentage - reduction,
    }));

    const newParticipants = [...adjustedParticipants, guestParticipant];
    const validation = this.validateSplits(newParticipants);
    
    if (!validation.isValid) {
      throw new Error(`Invalid splits after adding guest feature: ${validation.errors.join(', ')}`);
    }

    const changeRecord: SplitChangeRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      previousParticipants: participants,
      newParticipants,
      reason: `Added guest feature: ${guestFeature.guestArtistName}`,
      approvedBy: [],
      effectiveDate: guestFeature.effectiveFrom,
    };

    const existingAmendments = (contract.amendments as SplitChangeRecord[]) || [];
    
    const [updated] = await db
      .update(splitContracts)
      .set({
        participants: newParticipants,
        amendments: [...existingAmendments, changeRecord],
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId))
      .returning();

    logger.info(`Added guest feature split to contract ${contractId}`);
    return updated;
  }

  async addSampleClearanceRoyalty(
    contractId: string,
    sampleClearance: SampleClearanceRoyalty
  ): Promise<SplitContract> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const participants = (contract.participants as SplitParticipant[]) || [];
    
    const sampleParticipant: SplitParticipant = {
      userId: sampleClearance.sampleOwnerId,
      name: `Sample: ${sampleClearance.originalWorkTitle}`,
      email: '',
      role: 'sample_owner',
      splitPercentage: sampleClearance.rollingRoyaltyPercentage,
      sampleClearance: {
        sampleId: sampleClearance.sampleId,
        originalWork: sampleClearance.originalWorkTitle,
        clearanceDate: sampleClearance.clearanceDate,
        upfrontFee: sampleClearance.upfrontFee,
        rollingRoyalty: sampleClearance.rollingRoyaltyPercentage,
      },
    };

    const reduction = sampleClearance.rollingRoyaltyPercentage / participants.length;
    const adjustedParticipants = participants.map(p => ({
      ...p,
      splitPercentage: p.splitPercentage - reduction,
    }));

    const newParticipants = [...adjustedParticipants, sampleParticipant];
    const validation = this.validateSplits(newParticipants);
    
    if (!validation.isValid) {
      throw new Error(`Invalid splits after adding sample clearance: ${validation.errors.join(', ')}`);
    }

    const changeRecord: SplitChangeRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      previousParticipants: participants,
      newParticipants,
      reason: `Added sample clearance royalty: ${sampleClearance.originalWorkTitle}`,
      approvedBy: [],
      effectiveDate: sampleClearance.clearanceDate,
    };

    const existingAmendments = (contract.amendments as SplitChangeRecord[]) || [];
    
    const [updated] = await db
      .update(splitContracts)
      .set({
        participants: newParticipants,
        amendments: [...existingAmendments, changeRecord],
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId))
      .returning();

    logger.info(`Added sample clearance royalty to contract ${contractId}`);
    return updated;
  }

  async getContractById(contractId: string): Promise<SplitContract | null> {
    const [contract] = await db
      .select()
      .from(splitContracts)
      .where(eq(splitContracts.id, contractId))
      .limit(1);

    return contract || null;
  }

  async amendSplits(
    contractId: string,
    newParticipants: SplitParticipant[],
    reason: string,
    effectiveDate: Date,
    approvedBy: string[]
  ): Promise<SplitContract> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const validation = this.validateSplits(newParticipants);
    if (!validation.isValid) {
      throw new Error(`Invalid splits: ${validation.errors.join(', ')}`);
    }

    const previousParticipants = (contract.participants as SplitParticipant[]) || [];
    
    const changeRecord: SplitChangeRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      previousParticipants,
      newParticipants,
      reason,
      approvedBy,
      effectiveDate,
    };

    const existingAmendments = (contract.amendments as SplitChangeRecord[]) || [];

    const [updated] = await db
      .update(splitContracts)
      .set({
        participants: newParticipants.map(p => ({
          userId: p.userId,
          name: p.name,
          email: p.email,
          role: p.role as 'artist' | 'producer' | 'writer' | 'label' | 'publisher' | 'manager' | 'other',
          splitPercentage: p.splitPercentage,
          payoutMethod: p.payoutMethod || 'default',
          ipi: p.ipi,
          pro: p.pro,
          publisherName: p.publisherName,
        })),
        amendments: [...existingAmendments, changeRecord],
        version: sql`${splitContracts.version} + 1`,
        status: 'amended',
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId))
      .returning();

    logger.info(`Amended split contract ${contractId}, version ${updated.version}`);
    return updated;
  }

  async getSplitHistory(contractId: string): Promise<SplitChangeRecord[]> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      return [];
    }

    return (contract.amendments as SplitChangeRecord[]) || [];
  }

  async calculateRoyaltyDistribution(
    contractId: string,
    totalRoyalty: number,
    asOfDate?: Date
  ): Promise<{ participantId: string; name: string; role: string; amount: number; percentage: number }[]> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const participants = (contract.participants as SplitParticipant[]) || [];
    
    return participants.map(p => ({
      participantId: p.userId,
      name: p.name,
      role: p.role,
      amount: (totalRoyalty * p.splitPercentage) / 100,
      percentage: p.splitPercentage,
    }));
  }

  async getGuestFeatures(contractId: string): Promise<SplitParticipant[]> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      return [];
    }

    const participants = (contract.participants as SplitParticipant[]) || [];
    return participants.filter(p => p.isGuestFeature || p.role === 'featured_artist');
  }

  async getSampleClearances(contractId: string): Promise<SplitParticipant[]> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      return [];
    }

    const participants = (contract.participants as SplitParticipant[]) || [];
    return participants.filter(p => p.role === 'sample_owner' || p.sampleClearance);
  }

  async activateContract(contractId: string): Promise<SplitContract> {
    const [updated] = await db
      .update(splitContracts)
      .set({
        status: 'active',
        activatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId))
      .returning();

    logger.info(`Activated split contract ${contractId}`);
    return updated;
  }

  async terminateContract(contractId: string, reason: string): Promise<SplitContract> {
    const [updated] = await db
      .update(splitContracts)
      .set({
        status: 'terminated',
        terminatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId))
      .returning();

    logger.info(`Terminated split contract ${contractId}, reason: ${reason}`);
    return updated;
  }

  async getContractsByUser(userId: string): Promise<SplitContract[]> {
    return await db
      .select()
      .from(splitContracts)
      .where(eq(splitContracts.creatorId, userId))
      .orderBy(desc(splitContracts.createdAt));
  }

  async getActiveContractsForUser(userId: string): Promise<SplitContract[]> {
    const contracts = await db
      .select()
      .from(splitContracts)
      .where(eq(splitContracts.status, 'active'));

    return contracts.filter(contract => {
      const participants = (contract.participants as SplitParticipant[]) || [];
      return participants.some(p => p.userId === userId);
    });
  }
}

export const splitService = new SplitService();
