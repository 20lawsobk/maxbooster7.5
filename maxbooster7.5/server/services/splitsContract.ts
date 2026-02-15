import { db } from '../db.js';
import { 
  splitContracts, 
  splitContractSignatures,
  releases,
  users,
  type SplitContract,
  type InsertSplitContract,
  type SplitContractSignature,
  type InsertSplitContractSignature,
} from '@shared/schema';
import { eq, and, desc, sql, or, gte } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { emailService } from './emailService.js';

export interface ContractParticipant {
  userId: string;
  name: string;
  email: string;
  role: 'artist' | 'producer' | 'writer' | 'label' | 'publisher' | 'manager' | 'other';
  splitPercentage: number;
  payoutMethod: string;
  ipi?: string;
  pro?: string;
  publisherName?: string;
}

export interface ContractTerms {
  territoryRestrictions?: string[];
  dspRestrictions?: string[];
  minimumGuarantee?: number;
  advanceRecoupment?: boolean;
  auditRights?: boolean;
  termYears?: number;
  autoRenewal?: boolean;
}

export interface ContractAmendment {
  id: string;
  date: string;
  description: string;
  previousParticipants: ContractParticipant[];
  newParticipants: ContractParticipant[];
  approvedBy: string[];
}

export interface CreateContractInput {
  releaseId: string;
  creatorId: string;
  contractName: string;
  participants: ContractParticipant[];
  effectiveDate: Date;
  expirationDate?: Date;
  terms?: ContractTerms;
}

export interface SignatureRequest {
  contractId: string;
  userId: string;
  ipAddress: string;
  userAgent?: string;
}

export interface AmendmentRequest {
  contractId: string;
  description: string;
  newParticipants: ContractParticipant[];
  requestedBy: string;
}

export class SplitsContractService {
  async createContract(input: CreateContractInput): Promise<SplitContract> {
    const totalPercentage = input.participants.reduce(
      (sum, p) => sum + p.splitPercentage,
      0
    );

    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error(`Split percentages must total 100%, got ${totalPercentage}%`);
    }

    const insertData: InsertSplitContract = {
      releaseId: input.releaseId,
      creatorId: input.creatorId,
      contractName: input.contractName,
      status: 'draft',
      effectiveDate: input.effectiveDate,
      expirationDate: input.expirationDate,
      totalPercentage: String(totalPercentage),
      participants: input.participants,
      terms: input.terms,
      signatures: [],
      amendments: [],
    };

    const [contract] = await db
      .insert(splitContracts)
      .values(insertData)
      .returning();

    logger.info(`Created split contract ${contract.id} for release ${input.releaseId}`);

    return contract;
  }

  async getContractById(contractId: string): Promise<SplitContract | null> {
    const [contract] = await db
      .select()
      .from(splitContracts)
      .where(eq(splitContracts.id, contractId))
      .limit(1);

    return contract || null;
  }

  async getContractsByRelease(releaseId: string): Promise<SplitContract[]> {
    return await db
      .select()
      .from(splitContracts)
      .where(eq(splitContracts.releaseId, releaseId))
      .orderBy(desc(splitContracts.version));
  }

  async getActiveContractByRelease(releaseId: string): Promise<SplitContract | null> {
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

  async getContractsByUser(userId: string): Promise<SplitContract[]> {
    const contracts = await db
      .select()
      .from(splitContracts)
      .orderBy(desc(splitContracts.createdAt));

    return contracts.filter(contract => {
      const participants = contract.participants as ContractParticipant[];
      return participants.some(p => p.userId === userId) || contract.creatorId === userId;
    });
  }

  async getPendingSignaturesByUser(userId: string): Promise<SplitContractSignature[]> {
    return await db
      .select()
      .from(splitContractSignatures)
      .where(
        and(
          eq(splitContractSignatures.userId, userId),
          eq(splitContractSignatures.status, 'pending')
        )
      )
      .orderBy(desc(splitContractSignatures.requestedAt));
  }

  async initiateSignatureCollection(contractId: string): Promise<void> {
    const contract = await this.getContractById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    if (contract.status !== 'draft') {
      throw new Error(`Contract ${contractId} is not in draft status`);
    }

    const participants = contract.participants as ContractParticipant[];

    for (const participant of participants) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const signatureData: InsertSplitContractSignature = {
        contractId,
        userId: participant.userId,
        signatureHash: '',
        status: 'pending',
        expiresAt,
      };

      await db.insert(splitContractSignatures).values(signatureData);

      try {
        await this.sendSignatureRequestEmail(participant, contract);
      } catch (error) {
        logger.warn(`Failed to send signature request email to ${participant.email}:`, error);
      }
    }

    await db
      .update(splitContracts)
      .set({
        status: 'pending_signatures',
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId));

    logger.info(`Initiated signature collection for contract ${contractId} with ${participants.length} participants`);
  }

  async signContract(request: SignatureRequest): Promise<SplitContractSignature> {
    const contract = await this.getContractById(request.contractId);
    if (!contract) {
      throw new Error(`Contract ${request.contractId} not found`);
    }

    const [existingSignature] = await db
      .select()
      .from(splitContractSignatures)
      .where(
        and(
          eq(splitContractSignatures.contractId, request.contractId),
          eq(splitContractSignatures.userId, request.userId)
        )
      )
      .limit(1);

    if (!existingSignature) {
      throw new Error(`No signature request found for user ${request.userId} on contract ${request.contractId}`);
    }

    if (existingSignature.status === 'signed') {
      throw new Error(`User ${request.userId} has already signed contract ${request.contractId}`);
    }

    if (existingSignature.expiresAt && existingSignature.expiresAt < new Date()) {
      throw new Error(`Signature request has expired`);
    }

    const signatureHash = this.generateSignatureHash(
      request.contractId,
      request.userId,
      request.ipAddress,
      new Date()
    );

    const [signature] = await db
      .update(splitContractSignatures)
      .set({
        signedAt: new Date(),
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        signatureHash,
        status: 'signed',
      })
      .where(eq(splitContractSignatures.id, existingSignature.id))
      .returning();

    await this.checkAndActivateContract(request.contractId);

    logger.info(`User ${request.userId} signed contract ${request.contractId}`);

    return signature;
  }

  private async checkAndActivateContract(contractId: string): Promise<void> {
    const contract = await this.getContractById(contractId);
    if (!contract) return;

    const participants = contract.participants as ContractParticipant[];
    const signatures = await db
      .select()
      .from(splitContractSignatures)
      .where(
        and(
          eq(splitContractSignatures.contractId, contractId),
          eq(splitContractSignatures.status, 'signed')
        )
      );

    const allSigned = participants.every(p =>
      signatures.some(s => s.userId === p.userId)
    );

    if (allSigned) {
      await db
        .update(splitContracts)
        .set({
          status: 'active',
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(splitContracts.id, contractId));

      logger.info(`Contract ${contractId} activated with all ${participants.length} signatures`);
    }
  }

  async requestAmendment(request: AmendmentRequest): Promise<SplitContract> {
    const contract = await this.getContractById(request.contractId);
    if (!contract) {
      throw new Error(`Contract ${request.contractId} not found`);
    }

    if (contract.status !== 'active') {
      throw new Error(`Cannot amend contract ${request.contractId} - not in active status`);
    }

    const previousParticipants = contract.participants as ContractParticipant[];
    const amendmentId = crypto.randomUUID();

    const amendment: ContractAmendment = {
      id: amendmentId,
      date: new Date().toISOString(),
      description: request.description,
      previousParticipants,
      newParticipants: request.newParticipants,
      approvedBy: [],
    };

    const existingAmendments = (contract.amendments as ContractAmendment[]) || [];

    const [updated] = await db
      .update(splitContracts)
      .set({
        status: 'amended',
        amendments: [...existingAmendments, amendment],
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, request.contractId))
      .returning();

    const newContract = await this.createContract({
      releaseId: contract.releaseId,
      creatorId: request.requestedBy,
      contractName: `${contract.contractName} (Amendment ${existingAmendments.length + 1})`,
      participants: request.newParticipants,
      effectiveDate: new Date(),
      expirationDate: contract.expirationDate || undefined,
      terms: contract.terms as ContractTerms || undefined,
    });

    await db
      .update(splitContracts)
      .set({
        previousVersionId: contract.id,
        version: contract.version + 1,
      })
      .where(eq(splitContracts.id, newContract.id));

    logger.info(`Created amendment for contract ${request.contractId}, new contract: ${newContract.id}`);

    return newContract;
  }

  async terminateContract(contractId: string, reason: string): Promise<SplitContract> {
    const [terminated] = await db
      .update(splitContracts)
      .set({
        status: 'terminated',
        terminatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(splitContracts.id, contractId))
      .returning();

    logger.info(`Terminated contract ${contractId}, reason: ${reason}`);

    return terminated;
  }

  async sendSignatureReminder(contractId: string): Promise<number> {
    const pendingSignatures = await db
      .select()
      .from(splitContractSignatures)
      .where(
        and(
          eq(splitContractSignatures.contractId, contractId),
          eq(splitContractSignatures.status, 'pending')
        )
      );

    let remindersSent = 0;

    for (const signature of pendingSignatures) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, signature.userId))
        .limit(1);

      if (user?.email) {
        try {
          await emailService.sendTemplatedEmail(user.email, 'contract_signature_reminder', {
            userName: user.firstName || user.username || 'User',
            contractId,
          });

          await db
            .update(splitContractSignatures)
            .set({ reminderSentAt: new Date() })
            .where(eq(splitContractSignatures.id, signature.id));

          remindersSent++;
        } catch (error) {
          logger.warn(`Failed to send reminder to ${user.email}:`, error);
        }
      }
    }

    logger.info(`Sent ${remindersSent} signature reminders for contract ${contractId}`);

    return remindersSent;
  }

  async getContractHistory(releaseId: string): Promise<SplitContract[]> {
    return await db
      .select()
      .from(splitContracts)
      .where(eq(splitContracts.releaseId, releaseId))
      .orderBy(desc(splitContracts.version));
  }

  async validateSplitPercentages(participants: ContractParticipant[]): Promise<{
    valid: boolean;
    total: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const total = participants.reduce((sum, p) => sum + p.splitPercentage, 0);

    if (Math.abs(total - 100) > 0.01) {
      errors.push(`Split percentages must total 100%, got ${total.toFixed(2)}%`);
    }

    for (const participant of participants) {
      if (participant.splitPercentage < 0) {
        errors.push(`${participant.name}: Split percentage cannot be negative`);
      }
      if (participant.splitPercentage > 100) {
        errors.push(`${participant.name}: Split percentage cannot exceed 100%`);
      }
    }

    const userIds = participants.map(p => p.userId);
    if (new Set(userIds).size !== userIds.length) {
      errors.push('Duplicate participants are not allowed');
    }

    return {
      valid: errors.length === 0,
      total,
      errors,
    };
  }

  async getSignatureStatus(contractId: string): Promise<{
    total: number;
    signed: number;
    pending: number;
    expired: number;
    signers: Array<{
      userId: string;
      status: string;
      signedAt?: Date;
    }>;
  }> {
    const signatures = await db
      .select()
      .from(splitContractSignatures)
      .where(eq(splitContractSignatures.contractId, contractId));

    const now = new Date();
    const signers = signatures.map(s => ({
      userId: s.userId,
      status: s.expiresAt && s.expiresAt < now && s.status === 'pending' ? 'expired' : s.status,
      signedAt: s.status === 'signed' ? s.signedAt : undefined,
    }));

    return {
      total: signatures.length,
      signed: signers.filter(s => s.status === 'signed').length,
      pending: signers.filter(s => s.status === 'pending').length,
      expired: signers.filter(s => s.status === 'expired').length,
      signers,
    };
  }

  private generateSignatureHash(
    contractId: string,
    userId: string,
    ipAddress: string,
    timestamp: Date
  ): string {
    const data = `${contractId}:${userId}:${ipAddress}:${timestamp.toISOString()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async sendSignatureRequestEmail(
    participant: ContractParticipant,
    contract: SplitContract
  ): Promise<void> {
    await emailService.sendTemplatedEmail(participant.email, 'contract_signature_request', {
      userName: participant.name,
      contractName: contract.contractName,
      splitPercentage: participant.splitPercentage,
      role: participant.role,
    });
  }
}

export const splitsContractService = new SplitsContractService();
