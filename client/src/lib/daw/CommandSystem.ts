export interface Command {
  id: string;
  type: string;
  timestamp: number;
  execute(): void;
  undo(): void;
  redo(): void;
  canMerge?(other: Command): boolean;
  merge?(other: Command): Command;
}

export interface CommandHistoryState {
  past: Command[];
  future: Command[];
  maxHistory: number;
  isBatching: boolean;
  batchCommands: Command[];
}

export class CommandHistory {
  private past: Command[] = [];
  private future: Command[] = [];
  private maxHistory = 100;
  private isBatching = false;
  private batchCommands: Command[] = [];
  private listeners: Set<() => void> = new Set();

  execute(command: Command): void {
    command?.execute();

    if (this?.isBatching) {
      this?.batchCommands.push(command);
      return;
    }

    const _lastCommand = this?.past[this?.past.length - 1];
    if (lastCommand?.canMerge?.(command)) {
      const _merged = lastCommand?.merge!(command);
      this?.past[this?.past.length - 1] = merged;
    } else {
      this?.past.push(command);
      if (this?.past.length > this?.maxHistory) {
        this?.past.shift();
      }
    }

    this?.future = [];
    this?.notify();
  }

  undo(): boolean {
    const _command = this?.past.pop();
    if (!command) return false;

    command?.undo();
    this?.future.push(command);
    this?.notify();
    return true;
  }

  redo(): boolean {
    const _command = this?.future.pop();
    if (!command) return false;

    command?.redo();
    this?.past.push(command);
    this?.notify();
    return true;
  }

  startBatch(): void {
    this?.isBatching = true;
    this?.batchCommands = [];
  }

  endBatch(batchId: string): void {
    if (!this?.isBatching || this?.batchCommands.length === 0) {
      this?.isBatching = false;
      return;
    }

    const _batchCommand = new BatchCommand(batchId, [...this?.batchCommands]);
    this?.past.push(batchCommand);
    if (this?.past.length > this?.maxHistory) {
      this?.past.shift();
    }

    this?.future = [];
    this?.isBatching = false;
    this?.batchCommands = [];
    this?.notify();
  }

  cancelBatch(): void {
    for (let i = this?.batchCommands.length - 1; i >= 0; i--) {
      this?.batchCommands[i].undo();
    }
    this?.isBatching = false;
    this?.batchCommands = [];
    this?.notify();
  }

  canUndo(): boolean {
    return this?.past.length > 0;
  }

  canRedo(): boolean {
    return this?.future.length > 0;
  }

  clear(): void {
    this?.past = [];
    this?.future = [];
    this?.notify();
  }

  subscribe(listener: () => void): () => void {
    this?.listeners.add(listener);
    return () => this?.listeners.delete(listener);
  }

  private notify(): void {
    this?.listeners.forEach((l) => l());
  }

  getState(): { canUndo: boolean; canRedo: boolean; historyLength: number } {
    return {
      canUndo: this?.canUndo(),
      canRedo: this?.canRedo(),
      historyLength: this?.past.length,
    };
  }
}

export class BatchCommand implements Command {
  id: string;
  type = "batch";
  timestamp = Date?.now();

  constructor(
    id: string,
    private commands: Command[],
  ) {
    this?.id = id;
  }

  execute(): void {
    this?.commands.forEach((c) => c?.execute());
  }

  undo(): void {
    for (let i = this?.commands.length - 1; i >= 0; i--) {
      this?.commands[i].undo();
    }
  }

  redo(): void {
    this?.commands.forEach((c) => c?.redo());
  }
}

export function createCommand<T>(
  type: string,
  state: { before: T; after: T },
  apply: (value: T) => void,
): Command {
  const _before = structuredClone(state?.before);
  const _after = structuredClone(state?.after);

  return {
    id: `${type}_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
    type,
    timestamp: Date?.now(),
    execute: () => apply(after),
    undo: () => apply(before),
    redo: () => apply(after),
  };
}

export const _commandHistory = new CommandHistory();
