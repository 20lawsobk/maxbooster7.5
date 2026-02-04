import type { Draft } from 'immer';

export interface StudioSnapshot {
  tracks: any[];
  transport: any;
  project: any;
  view: any;
  mixer: any;
  masterTrack: any;
}

export interface Command {
  readonly type: string;
  readonly description: string;
  readonly timestamp: number;
  readonly batchId?: string;
  
  execute(state: Draft<StudioSnapshot>): void;
  undo(state: Draft<StudioSnapshot>): void;
  
  canMerge?(other: Command): boolean;
  merge?(other: Command): Command;
}

export interface CommandContext {
  sampleRate: number;
  tempo: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  gridSize: number;
  snapToGrid: boolean;
}

export abstract class BaseCommand implements Command {
  abstract readonly type: string;
  abstract readonly description: string;
  readonly timestamp: number;
  readonly batchId?: string;
  
  constructor(batchId?: string) {
    this.timestamp = Date.now();
    this.batchId = batchId;
  }
  
  abstract execute(state: Draft<StudioSnapshot>): void;
  abstract undo(state: Draft<StudioSnapshot>): void;
  
  canMerge?(other: Command): boolean {
    return false;
  }
  
  merge?(other: Command): Command {
    return this;
  }
}

export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory = 100;
  private isBatching = false;
  private currentBatchId: string | null = null;
  private batchCommands: Command[] = [];
  private listeners: Set<() => void> = new Set();
  
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  
  get undoDescription(): string | null {
    const cmd = this.undoStack[this.undoStack.length - 1];
    return cmd?.description ?? null;
  }
  
  get redoDescription(): string | null {
    const cmd = this.redoStack[this.redoStack.length - 1];
    return cmd?.description ?? null;
  }
  
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notify(): void {
    this.listeners.forEach(l => l());
  }
  
  execute(command: Command, applyToState: (cmd: Command) => void): void {
    if (this.isBatching) {
      this.batchCommands.push(command);
      applyToState(command);
      return;
    }
    
    const lastCommand = this.undoStack[this.undoStack.length - 1];
    if (lastCommand && command.canMerge?.(lastCommand)) {
      const merged = command.merge!(lastCommand);
      this.undoStack.pop();
      this.undoStack.push(merged);
      applyToState(command);
    } else {
      this.undoStack.push(command);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
      applyToState(command);
    }
    
    this.redoStack = [];
    this.notify();
  }
  
  undo(applyUndo: (cmd: Command) => void): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    
    applyUndo(command);
    this.redoStack.push(command);
    this.notify();
    return true;
  }
  
  redo(applyRedo: (cmd: Command) => void): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    
    applyRedo(command);
    this.undoStack.push(command);
    this.notify();
    return true;
  }
  
  startBatch(batchId?: string): string {
    this.isBatching = true;
    this.currentBatchId = batchId || `batch-${Date.now()}`;
    this.batchCommands = [];
    return this.currentBatchId;
  }
  
  endBatch(applyToState?: (cmd: Command) => void): void {
    if (!this.isBatching || this.batchCommands.length === 0) {
      this.isBatching = false;
      this.currentBatchId = null;
      this.batchCommands = [];
      return;
    }
    
    const batch = new BatchCommand(this.batchCommands, this.currentBatchId!);
    this.undoStack.push(batch);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    
    this.redoStack = [];
    this.isBatching = false;
    this.currentBatchId = null;
    this.batchCommands = [];
    this.notify();
  }
  
  cancelBatch(): void {
    this.isBatching = false;
    this.currentBatchId = null;
    this.batchCommands = [];
  }
  
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
  
  getHistory(): readonly Command[] {
    return this.undoStack;
  }
}

export class BatchCommand extends BaseCommand {
  readonly type = 'batch';
  readonly description: string;
  
  constructor(
    private readonly commands: Command[],
    batchId: string
  ) {
    super(batchId);
    this.description = commands.length === 1 
      ? commands[0].description 
      : `${commands.length} actions`;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    for (const cmd of this.commands) {
      cmd.execute(state);
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo(state);
    }
  }
}

export const commandManager = new CommandManager();
