import { db } from '../db.js';
import { 
  recoupmentAccounts, 
  royaltyStatements,
  users,
  releases,
  type RecoupmentAccount,
  type InsertRecoupmentAccount,
} from '@shared/schema';
import { eq, and, desc, sql, isNull, or } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';

export interface AdvanceInput {
  userId: string;
  releaseId?: string;
  accountName: string;
  advanceAmount: number;
  recoupmentRate?: number;
  priority?: number;
  crossCollateralized?: boolean;
  crossCollateralGroupId?: string;
  currency?: string;
  terms?: {
    interestRate?: number;
    minimumPayment?: number;
    deferralPeriodDays?: number;
    notes?: string;
  };
}

export interface RecoupmentTransaction {
  id: string;
  date: string;
  amount: number;
  type: 'advance' | 'recoupment' | 'adjustment';
  statementId?: string;
  notes?: string;
}

export interface RecoupmentResult {
  accountId: string;
  accountName: string;
  previousBalance: number;
  amountApplied: number;
  newBalance: number;
  isFullyRecouped: boolean;
  remainingEarnings: number;
}

export interface WaterfallResult {
  totalAmount: number;
  totalRecouped: number;
  remainingPayout: number;
  accounts: RecoupmentResult[];
}

export interface CrossCollateralGroup {
  groupId: string;
  accounts: RecoupmentAccount[];
  totalBalance: number;
  totalAdvanced: number;
  totalRecouped: number;
}

export type RecoupmentMode = 'waterfall' | 'pro_rata' | 'oldest_first';
export type RecoupmentStatus = 'active' | 'recouped' | 'written_off' | 'paused';

export interface RecoupmentNotification {
  accountId: string;
  userId: string;
  type: 'milestone_25' | 'milestone_50' | 'milestone_75' | 'milestone_90' | 'fully_recouped' | 'approaching_payoff';
  triggeredAt: Date;
  notificationSent: boolean;
  message: string;
}

export interface PostRecoupmentSplitChange {
  accountId: string;
  originalSplits: { participantId: string; percentage: number; role: string }[];
  postRecoupmentSplits: { participantId: string; percentage: number; role: string }[];
  effectiveDate: Date;
  reason: string;
}

export interface ProRataRecoupmentInput {
  mode: RecoupmentMode;
  accounts: { accountId: string; weight?: number }[];
  totalAmount: number;
  statementId?: string;
}

export interface RecoupmentMilestone {
  percentage: number;
  reachedAt?: Date;
  notified: boolean;
}

export class RecoupmentService {
  private milestoneThresholds = [25, 50, 75, 90, 100];

  private checkMilestones(account: RecoupmentAccount): RecoupmentNotification[] {
    const notifications: RecoupmentNotification[] = [];
    const advanceAmount = Number(account.advanceAmount);
    const recoupedAmount = Number(account.recoupedAmount);
    const percentageRecouped = (recoupedAmount / advanceAmount) * 100;
    
    for (const threshold of this.milestoneThresholds) {
      if (percentageRecouped >= threshold) {
        const type = threshold === 100 
          ? 'fully_recouped' 
          : `milestone_${threshold}` as RecoupmentNotification['type'];
        
        notifications.push({
          accountId: account.id,
          userId: account.userId,
          type,
          triggeredAt: new Date(),
          notificationSent: false,
          message: threshold === 100 
            ? `Congratulations! Your advance for "${account.accountName}" has been fully recouped.`
            : `Your advance for "${account.accountName}" is ${threshold}% recouped.`,
        });
      }
    }
    
    return notifications;
  }
  async createAdvance(input: AdvanceInput): Promise<RecoupmentAccount> {
    const transactionId = crypto.randomUUID();
    
    const insertData: InsertRecoupmentAccount = {
      userId: input.userId,
      releaseId: input.releaseId,
      accountName: input.accountName,
      advanceAmount: String(input.advanceAmount),
      recoupedAmount: '0',
      remainingBalance: String(input.advanceAmount),
      recoupmentRate: String(input.recoupmentRate || 100),
      priority: input.priority || 1,
      isActive: true,
      crossCollateralized: input.crossCollateralized || false,
      crossCollateralGroupId: input.crossCollateralGroupId,
      effectiveDate: new Date(),
      currency: input.currency || 'USD',
      terms: input.terms,
      transactions: [{
        id: transactionId,
        date: new Date().toISOString(),
        amount: input.advanceAmount,
        type: 'advance' as const,
        notes: 'Initial advance disbursement',
      }],
    };

    const [account] = await db
      .insert(recoupmentAccounts)
      .values(insertData)
      .returning();

    logger.info(`Created recoupment account ${account.id} for user ${input.userId} with advance of ${input.advanceAmount}`);

    return account;
  }

  async getAccountsByUser(userId: string, includeInactive = false): Promise<RecoupmentAccount[]> {
    let query = db
      .select()
      .from(recoupmentAccounts)
      .where(eq(recoupmentAccounts.userId, userId))
      .orderBy(recoupmentAccounts.priority);

    if (!includeInactive) {
      query = query.where(eq(recoupmentAccounts.isActive, true));
    }

    return await query;
  }

  async getAccountById(accountId: string): Promise<RecoupmentAccount | null> {
    const [account] = await db
      .select()
      .from(recoupmentAccounts)
      .where(eq(recoupmentAccounts.id, accountId))
      .limit(1);

    return account || null;
  }

  async getAccountsByRelease(releaseId: string): Promise<RecoupmentAccount[]> {
    return await db
      .select()
      .from(recoupmentAccounts)
      .where(eq(recoupmentAccounts.releaseId, releaseId))
      .orderBy(recoupmentAccounts.priority);
  }

  async processRecoupment(
    userId: string,
    grossAmount: number,
    statementId?: string
  ): Promise<WaterfallResult> {
    const activeAccounts = await db
      .select()
      .from(recoupmentAccounts)
      .where(
        and(
          eq(recoupmentAccounts.userId, userId),
          eq(recoupmentAccounts.isActive, true)
        )
      )
      .orderBy(recoupmentAccounts.priority);

    const results: RecoupmentResult[] = [];
    let remainingAmount = grossAmount;
    let totalRecouped = 0;

    for (const account of activeAccounts) {
      if (remainingAmount <= 0) break;

      const result = await this.recoupFromAccount(account, remainingAmount, statementId);
      results.push(result);
      
      totalRecouped += result.amountApplied;
      remainingAmount = result.remainingEarnings;
    }

    return {
      totalAmount: grossAmount,
      totalRecouped,
      remainingPayout: remainingAmount,
      accounts: results,
    };
  }

  async processProRataRecoupment(input: ProRataRecoupmentInput): Promise<WaterfallResult & { notifications: RecoupmentNotification[] }> {
    const accounts: RecoupmentAccount[] = [];
    for (const accountInput of input.accounts) {
      const account = await this.getAccountById(accountInput.accountId);
      if (account && account.isActive) {
        accounts.push(account);
      }
    }

    if (accounts.length === 0) {
      return {
        totalAmount: input.totalAmount,
        totalRecouped: 0,
        remainingPayout: input.totalAmount,
        accounts: [],
        notifications: [],
      };
    }

    const results: RecoupmentResult[] = [];
    const notifications: RecoupmentNotification[] = [];
    let totalRecouped = 0;

    if (input.mode === 'pro_rata') {
      const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.remainingBalance), 0);
      
      for (const account of accounts) {
        const weight = input.accounts.find(a => a.accountId === account.id)?.weight;
        let shareRatio: number;
        
        if (weight !== undefined) {
          const totalWeight = input.accounts.reduce((sum, a) => sum + (a.weight || 1), 0);
          shareRatio = weight / totalWeight;
        } else {
          shareRatio = Number(account.remainingBalance) / totalBalance;
        }
        
        const allocatedAmount = input.totalAmount * shareRatio;
        const result = await this.recoupFromAccount(account, allocatedAmount, input.statementId);
        results.push(result);
        totalRecouped += result.amountApplied;
        
        const milestoneNotifications = this.checkMilestones(account);
        notifications.push(...milestoneNotifications);
      }
    } else if (input.mode === 'oldest_first') {
      const sortedAccounts = accounts.sort((a, b) => 
        new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
      );
      
      let remainingAmount = input.totalAmount;
      for (const account of sortedAccounts) {
        if (remainingAmount <= 0) break;
        const result = await this.recoupFromAccount(account, remainingAmount, input.statementId);
        results.push(result);
        totalRecouped += result.amountApplied;
        remainingAmount = result.remainingEarnings;
        
        const milestoneNotifications = this.checkMilestones(account);
        notifications.push(...milestoneNotifications);
      }
    } else {
      let remainingAmount = input.totalAmount;
      for (const account of accounts) {
        if (remainingAmount <= 0) break;
        const result = await this.recoupFromAccount(account, remainingAmount, input.statementId);
        results.push(result);
        totalRecouped += result.amountApplied;
        remainingAmount = result.remainingEarnings;
        
        const milestoneNotifications = this.checkMilestones(account);
        notifications.push(...milestoneNotifications);
      }
    }

    return {
      totalAmount: input.totalAmount,
      totalRecouped,
      remainingPayout: input.totalAmount - totalRecouped,
      accounts: results,
      notifications,
    };
  }

  async getRecoupmentProgress(accountId: string): Promise<{
    account: RecoupmentAccount;
    percentageRecouped: number;
    milestonesReached: number[];
    estimatedPayoffDate?: Date;
  } | null> {
    const account = await this.getAccountById(accountId);
    if (!account) return null;

    const advanceAmount = Number(account.advanceAmount);
    const recoupedAmount = Number(account.recoupedAmount);
    const percentageRecouped = advanceAmount > 0 ? (recoupedAmount / advanceAmount) * 100 : 0;
    
    const milestonesReached = this.milestoneThresholds.filter(threshold => percentageRecouped >= threshold);

    return {
      account,
      percentageRecouped,
      milestonesReached,
    };
  }

  async setPostRecoupmentSplits(
    accountId: string,
    postRecoupmentSplits: { participantId: string; percentage: number; role: string }[]
  ): Promise<RecoupmentAccount> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Recoupment account ${accountId} not found`);
    }

    const totalPercentage = postRecoupmentSplits.reduce((sum, split) => sum + split.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error(`Post-recoupment splits must total 100%, got ${totalPercentage}%`);
    }

    const currentTerms = (account.terms as Record<string, unknown>) || {};
    const updatedTerms = {
      ...currentTerms,
      postRecoupmentSplits,
    };

    const [updated] = await db
      .update(recoupmentAccounts)
      .set({
        terms: updatedTerms,
        updatedAt: new Date(),
      })
      .where(eq(recoupmentAccounts.id, accountId))
      .returning();

    logger.info(`Set post-recoupment splits for account ${accountId}`);
    return updated;
  }

  async writeOffAccount(accountId: string, reason: string): Promise<RecoupmentAccount> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Recoupment account ${accountId} not found`);
    }

    const transactionId = crypto.randomUUID();
    const writeOffTransaction: RecoupmentTransaction = {
      id: transactionId,
      date: new Date().toISOString(),
      amount: Number(account.remainingBalance),
      type: 'adjustment',
      notes: `Write-off: ${reason}`,
    };

    const existingTransactions = (account.transactions as RecoupmentTransaction[]) || [];
    const updatedTransactions = [...existingTransactions, writeOffTransaction];

    const [updated] = await db
      .update(recoupmentAccounts)
      .set({
        remainingBalance: '0',
        isActive: false,
        fullyRecoupedAt: new Date(),
        transactions: updatedTransactions,
        updatedAt: new Date(),
      })
      .where(eq(recoupmentAccounts.id, accountId))
      .returning();

    logger.info(`Written off account ${accountId}, reason: ${reason}`);
    return updated;
  }

  private async recoupFromAccount(
    account: RecoupmentAccount,
    availableAmount: number,
    statementId?: string
  ): Promise<RecoupmentResult> {
    const balance = Number(account.remainingBalance);
    if (balance <= 0) {
      return {
        accountId: account.id,
        accountName: account.accountName,
        previousBalance: 0,
        amountApplied: 0,
        newBalance: 0,
        isFullyRecouped: true,
        remainingEarnings: availableAmount,
      };
    }

    const recoupmentRate = Number(account.recoupmentRate) / 100;
    const maxRecoupable = availableAmount * recoupmentRate;
    const amountToRecoup = Math.min(maxRecoupable, balance);
    
    const newBalance = balance - amountToRecoup;
    const isFullyRecouped = newBalance <= 0;

    const transactionId = crypto.randomUUID();
    const newTransaction: RecoupmentTransaction = {
      id: transactionId,
      date: new Date().toISOString(),
      amount: amountToRecoup,
      type: 'recoupment',
      statementId,
      notes: `Automatic recoupment from earnings`,
    };

    const existingTransactions = (account.transactions as RecoupmentTransaction[]) || [];
    const updatedTransactions = [...existingTransactions, newTransaction];

    await db
      .update(recoupmentAccounts)
      .set({
        recoupedAmount: sql`${recoupmentAccounts.recoupedAmount} + ${amountToRecoup}`,
        remainingBalance: String(Math.max(0, newBalance)),
        fullyRecoupedAt: isFullyRecouped ? new Date() : null,
        isActive: !isFullyRecouped,
        transactions: updatedTransactions,
        updatedAt: new Date(),
      })
      .where(eq(recoupmentAccounts.id, account.id));

    logger.info(`Recouped ${amountToRecoup} from account ${account.id}, new balance: ${newBalance}`);

    return {
      accountId: account.id,
      accountName: account.accountName,
      previousBalance: balance,
      amountApplied: amountToRecoup,
      newBalance: Math.max(0, newBalance),
      isFullyRecouped,
      remainingEarnings: availableAmount - amountToRecoup,
    };
  }

  async processCrossCollateralGroup(groupId: string, amount: number): Promise<WaterfallResult> {
    const groupAccounts = await db
      .select()
      .from(recoupmentAccounts)
      .where(
        and(
          eq(recoupmentAccounts.crossCollateralGroupId, groupId),
          eq(recoupmentAccounts.isActive, true)
        )
      )
      .orderBy(recoupmentAccounts.priority);

    if (groupAccounts.length === 0) {
      return {
        totalAmount: amount,
        totalRecouped: 0,
        remainingPayout: amount,
        accounts: [],
      };
    }

    const results: RecoupmentResult[] = [];
    let remainingAmount = amount;
    let totalRecouped = 0;

    const totalBalance = groupAccounts.reduce(
      (sum, acc) => sum + Number(acc.remainingBalance),
      0
    );

    for (const account of groupAccounts) {
      if (remainingAmount <= 0) break;

      const accountShare = Number(account.remainingBalance) / totalBalance;
      const allocatedAmount = amount * accountShare;

      const result = await this.recoupFromAccount(account, allocatedAmount);
      results.push(result);
      
      totalRecouped += result.amountApplied;
      remainingAmount -= result.amountApplied;
    }

    return {
      totalAmount: amount,
      totalRecouped,
      remainingPayout: remainingAmount,
      accounts: results,
    };
  }

  async adjustBalance(
    accountId: string,
    adjustment: number,
    reason: string
  ): Promise<RecoupmentAccount> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Recoupment account ${accountId} not found`);
    }

    const currentBalance = Number(account.remainingBalance);
    const newBalance = currentBalance + adjustment;

    const transactionId = crypto.randomUUID();
    const newTransaction: RecoupmentTransaction = {
      id: transactionId,
      date: new Date().toISOString(),
      amount: Math.abs(adjustment),
      type: 'adjustment',
      notes: reason,
    };

    const existingTransactions = (account.transactions as RecoupmentTransaction[]) || [];
    const updatedTransactions = [...existingTransactions, newTransaction];

    const isActive = newBalance > 0;
    const fullyRecoupedAt = newBalance <= 0 && currentBalance > 0 ? new Date() : account.fullyRecoupedAt;

    const [updated] = await db
      .update(recoupmentAccounts)
      .set({
        remainingBalance: String(Math.max(0, newBalance)),
        isActive,
        fullyRecoupedAt,
        transactions: updatedTransactions,
        updatedAt: new Date(),
      })
      .where(eq(recoupmentAccounts.id, accountId))
      .returning();

    logger.info(`Adjusted account ${accountId} by ${adjustment}, new balance: ${newBalance}, reason: ${reason}`);

    return updated;
  }

  async getCrossCollateralGroup(groupId: string): Promise<CrossCollateralGroup> {
    const accounts = await db
      .select()
      .from(recoupmentAccounts)
      .where(eq(recoupmentAccounts.crossCollateralGroupId, groupId));

    const totalBalance = accounts.reduce(
      (sum, acc) => sum + Number(acc.remainingBalance),
      0
    );
    const totalAdvanced = accounts.reduce(
      (sum, acc) => sum + Number(acc.advanceAmount),
      0
    );
    const totalRecouped = accounts.reduce(
      (sum, acc) => sum + Number(acc.recoupedAmount),
      0
    );

    return {
      groupId,
      accounts,
      totalBalance,
      totalAdvanced,
      totalRecouped,
    };
  }

  async createCrossCollateralGroup(
    accountIds: string[]
  ): Promise<string> {
    const groupId = crypto.randomUUID();

    await db
      .update(recoupmentAccounts)
      .set({
        crossCollateralized: true,
        crossCollateralGroupId: groupId,
        updatedAt: new Date(),
      })
      .where(sql`${recoupmentAccounts.id} IN ${accountIds}`);

    logger.info(`Created cross-collateral group ${groupId} with ${accountIds.length} accounts`);

    return groupId;
  }

  async getRecoupmentSchedule(userId: string): Promise<{
    accounts: RecoupmentAccount[];
    totalBalance: number;
    projectedPayoffDate?: Date;
    averageMonthlyRecoupment: number;
  }> {
    const accounts = await this.getAccountsByUser(userId, false);
    
    const totalBalance = accounts.reduce(
      (sum, acc) => sum + Number(acc.remainingBalance),
      0
    );

    const paidStatements = await db
      .select()
      .from(royaltyStatements)
      .where(
        and(
          eq(royaltyStatements.userId, userId),
          eq(royaltyStatements.status, 'paid')
        )
      )
      .orderBy(desc(royaltyStatements.paidAt))
      .limit(6);

    let averageMonthlyRecoupment = 0;
    if (paidStatements.length > 0) {
      const totalRecoupment = paidStatements.reduce(
        (sum, stmt) => sum + Number(stmt.recoupmentDeductions),
        0
      );
      averageMonthlyRecoupment = totalRecoupment / paidStatements.length;
    }

    let projectedPayoffDate: Date | undefined;
    if (averageMonthlyRecoupment > 0 && totalBalance > 0) {
      const monthsToPayoff = Math.ceil(totalBalance / averageMonthlyRecoupment);
      projectedPayoffDate = new Date();
      projectedPayoffDate.setMonth(projectedPayoffDate.getMonth() + monthsToPayoff);
    }

    return {
      accounts,
      totalBalance,
      projectedPayoffDate,
      averageMonthlyRecoupment,
    };
  }

  async getAccountTransactionHistory(
    accountId: string
  ): Promise<RecoupmentTransaction[]> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      return [];
    }

    return (account.transactions as RecoupmentTransaction[]) || [];
  }

  async deactivateAccount(accountId: string, reason: string): Promise<RecoupmentAccount> {
    const [updated] = await db
      .update(recoupmentAccounts)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(recoupmentAccounts.id, accountId))
      .returning();

    logger.info(`Deactivated recoupment account ${accountId}, reason: ${reason}`);

    return updated;
  }

  async reactivateAccount(accountId: string): Promise<RecoupmentAccount> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (Number(account.remainingBalance) <= 0) {
      throw new Error(`Cannot reactivate fully recouped account ${accountId}`);
    }

    const [updated] = await db
      .update(recoupmentAccounts)
      .set({
        isActive: true,
        fullyRecoupedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(recoupmentAccounts.id, accountId))
      .returning();

    logger.info(`Reactivated recoupment account ${accountId}`);

    return updated;
  }
}

export const recoupmentService = new RecoupmentService();
