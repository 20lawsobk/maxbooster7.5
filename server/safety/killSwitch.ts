/**
 * AUTONOMOUS SYSTEMS KILL SWITCH
 * 
 * Centralized emergency stop for all 9 autonomous systems.
 * Production safety requirement - must be able to halt all AI operations instantly.
 * 
 * Systems controlled:
 * 1. AutonomousService - Social posting, ads, distribution
 * 2. AutomationSystem - Workflow automation
 * 3. AutonomousUpdates - Self-updating orchestrator
 * 4. AutonomousAutopilot - Content generation, adaptive learning
 * 5. AutopilotEngine - Social/Ads/Security personas
 * 6. AutoPostingService V1 - Original scheduler
 * 7. AutoPostingService V2 - BullMQ queue management
 * 8. AutoPostGenerator - AI content generation
 * 9. AutopilotPublisher - Cross-platform publishing
 */

import { EventEmitter } from 'events';
import { logger } from '../logger.js';

export interface KillSwitchState {
  globalKilled: boolean;
  systemStates: Map<string, boolean>;
  lastKillTime: Date | null;
  lastResumeTime: Date | null;
  killReason: string | null;
  killedBy: string | null;
  auditLog: KillSwitchAuditEntry[];
}

export interface KillSwitchAuditEntry {
  timestamp: Date;
  action: 'KILL' | 'RESUME' | 'KILL_SYSTEM' | 'RESUME_SYSTEM';
  system: string;
  reason: string;
  triggeredBy: string;
  success: boolean;
}

export type AutonomousSystemName = 
  | 'autonomous-service'
  | 'automation-system'
  | 'autonomous-updates'
  | 'autonomous-autopilot'
  | 'autopilot-engine'
  | 'auto-posting-v1'
  | 'auto-posting-v2'
  | 'auto-post-generator'
  | 'autopilot-publisher';

const ALL_SYSTEMS: AutonomousSystemName[] = [
  'autonomous-service',
  'automation-system',
  'autonomous-updates',
  'autonomous-autopilot',
  'autopilot-engine',
  'auto-posting-v1',
  'auto-posting-v2',
  'auto-post-generator',
  'autopilot-publisher',
];

class KillSwitchManager extends EventEmitter {
  private static instance: KillSwitchManager;
  private state: KillSwitchState;
  private systemCallbacks: Map<AutonomousSystemName, { kill: () => void; resume: () => void }> = new Map();
  
  private constructor() {
    super();
    this.state = {
      globalKilled: false,
      systemStates: new Map(ALL_SYSTEMS.map(s => [s, false])),
      lastKillTime: null,
      lastResumeTime: null,
      killReason: null,
      killedBy: null,
      auditLog: [],
    };
  }

  public static getInstance(): KillSwitchManager {
    if (!KillSwitchManager.instance) {
      KillSwitchManager.instance = new KillSwitchManager();
    }
    return KillSwitchManager.instance;
  }

  /**
   * Register a system's kill/resume callbacks
   */
  public registerSystem(
    systemName: AutonomousSystemName,
    callbacks: { kill: () => void; resume: () => void }
  ): void {
    this.systemCallbacks.set(systemName, callbacks);
    logger.info(`[KillSwitch] Registered system: ${systemName}`);
  }

  /**
   * EMERGENCY KILL ALL - Stops all autonomous systems immediately
   */
  public killAll(reason: string, triggeredBy: string = 'system'): boolean {
    logger.warn('═══════════════════════════════════════════════════════════');
    logger.warn('🚨 KILL SWITCH ACTIVATED - STOPPING ALL AUTONOMOUS SYSTEMS');
    logger.warn(`   Reason: ${reason}`);
    logger.warn(`   Triggered by: ${triggeredBy}`);
    logger.warn('═══════════════════════════════════════════════════════════');

    this.state.globalKilled = true;
    this.state.lastKillTime = new Date();
    this.state.killReason = reason;
    this.state.killedBy = triggeredBy;

    let allSuccess = true;

    for (const [systemName, callbacks] of this.systemCallbacks) {
      try {
        callbacks.kill();
        this.state.systemStates.set(systemName, true);
        logger.warn(`   ✓ Killed: ${systemName}`);
        
        this.addAuditEntry({
          timestamp: new Date(),
          action: 'KILL_SYSTEM',
          system: systemName,
          reason,
          triggeredBy,
          success: true,
        });
      } catch (error) {
        logger.error(`   ✗ Failed to kill: ${systemName}`, error);
        allSuccess = false;
        
        this.addAuditEntry({
          timestamp: new Date(),
          action: 'KILL_SYSTEM',
          system: systemName,
          reason,
          triggeredBy,
          success: false,
        });
      }
    }

    this.addAuditEntry({
      timestamp: new Date(),
      action: 'KILL',
      system: 'ALL',
      reason,
      triggeredBy,
      success: allSuccess,
    });

    this.emit('killed', { reason, triggeredBy, success: allSuccess });
    
    return allSuccess;
  }

  /**
   * Resume all autonomous systems
   */
  public resumeAll(reason: string, triggeredBy: string = 'system'): boolean {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('✅ RESUMING ALL AUTONOMOUS SYSTEMS');
    logger.info(`   Reason: ${reason}`);
    logger.info(`   Triggered by: ${triggeredBy}`);
    logger.info('═══════════════════════════════════════════════════════════');

    this.state.globalKilled = false;
    this.state.lastResumeTime = new Date();

    let allSuccess = true;

    for (const [systemName, callbacks] of this.systemCallbacks) {
      try {
        callbacks.resume();
        this.state.systemStates.set(systemName, false);
        logger.info(`   ✓ Resumed: ${systemName}`);
        
        this.addAuditEntry({
          timestamp: new Date(),
          action: 'RESUME_SYSTEM',
          system: systemName,
          reason,
          triggeredBy,
          success: true,
        });
      } catch (error) {
        logger.error(`   ✗ Failed to resume: ${systemName}`, error);
        allSuccess = false;
        
        this.addAuditEntry({
          timestamp: new Date(),
          action: 'RESUME_SYSTEM',
          system: systemName,
          reason,
          triggeredBy,
          success: false,
        });
      }
    }

    this.addAuditEntry({
      timestamp: new Date(),
      action: 'RESUME',
      system: 'ALL',
      reason,
      triggeredBy,
      success: allSuccess,
    });

    this.emit('resumed', { reason, triggeredBy, success: allSuccess });
    
    return allSuccess;
  }

  /**
   * Kill a specific system
   */
  public killSystem(systemName: AutonomousSystemName, reason: string, triggeredBy: string = 'system'): boolean {
    const callbacks = this.systemCallbacks.get(systemName);
    if (!callbacks) {
      logger.warn(`[KillSwitch] System not registered: ${systemName}`);
      return false;
    }

    try {
      callbacks.kill();
      this.state.systemStates.set(systemName, true);
      
      logger.warn(`🚨 Killed system: ${systemName} - Reason: ${reason}`);
      
      this.addAuditEntry({
        timestamp: new Date(),
        action: 'KILL_SYSTEM',
        system: systemName,
        reason,
        triggeredBy,
        success: true,
      });
      
      this.emit('systemKilled', { systemName, reason, triggeredBy });
      return true;
    } catch (error) {
      logger.error(`Failed to kill system: ${systemName}`, error);
      
      this.addAuditEntry({
        timestamp: new Date(),
        action: 'KILL_SYSTEM',
        system: systemName,
        reason,
        triggeredBy,
        success: false,
      });
      
      return false;
    }
  }

  /**
   * Resume a specific system
   */
  public resumeSystem(systemName: AutonomousSystemName, reason: string, triggeredBy: string = 'system'): boolean {
    if (this.state.globalKilled) {
      logger.warn(`[KillSwitch] Cannot resume ${systemName} - global kill is active`);
      return false;
    }

    const callbacks = this.systemCallbacks.get(systemName);
    if (!callbacks) {
      logger.warn(`[KillSwitch] System not registered: ${systemName}`);
      return false;
    }

    try {
      callbacks.resume();
      this.state.systemStates.set(systemName, false);
      
      logger.info(`✅ Resumed system: ${systemName} - Reason: ${reason}`);
      
      this.addAuditEntry({
        timestamp: new Date(),
        action: 'RESUME_SYSTEM',
        system: systemName,
        reason,
        triggeredBy,
        success: true,
      });
      
      this.emit('systemResumed', { systemName, reason, triggeredBy });
      return true;
    } catch (error) {
      logger.error(`Failed to resume system: ${systemName}`, error);
      
      this.addAuditEntry({
        timestamp: new Date(),
        action: 'RESUME_SYSTEM',
        system: systemName,
        reason,
        triggeredBy,
        success: false,
      });
      
      return false;
    }
  }

  /**
   * Check if operations are allowed (for systems to call before acting)
   */
  public isOperationAllowed(systemName: AutonomousSystemName): boolean {
    if (this.state.globalKilled) {
      return false;
    }
    return !this.state.systemStates.get(systemName);
  }

  /**
   * Get current state
   */
  public getState(): KillSwitchState {
    return {
      ...this.state,
      systemStates: new Map(this.state.systemStates),
      auditLog: [...this.state.auditLog],
    };
  }

  /**
   * Get audit log
   */
  public getAuditLog(limit: number = 100): KillSwitchAuditEntry[] {
    return this.state.auditLog.slice(-limit);
  }

  private addAuditEntry(entry: KillSwitchAuditEntry): void {
    this.state.auditLog.push(entry);
    
    // Keep only last 1000 entries
    if (this.state.auditLog.length > 1000) {
      this.state.auditLog = this.state.auditLog.slice(-1000);
    }
  }
}

export const killSwitch = KillSwitchManager.getInstance();

/**
 * Decorator/wrapper for autonomous operations
 * Checks kill switch before executing
 */
export function guardedOperation<T>(
  systemName: AutonomousSystemName,
  operation: () => T | Promise<T>,
  fallback?: T
): T | Promise<T> {
  if (!killSwitch.isOperationAllowed(systemName)) {
    logger.debug(`[KillSwitch] Operation blocked for ${systemName} - system is killed`);
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Operation blocked: ${systemName} is currently killed`);
  }
  return operation();
}
