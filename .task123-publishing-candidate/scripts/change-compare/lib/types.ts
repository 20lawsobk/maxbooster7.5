/**
 * change-compare — shared types.
 *
 * A before/after comparison system for code changes. It takes two states of a
 * codebase (git refs, or a ref vs. the working tree / index) and produces an
 * explicit, per-change report: file-level status, line stats, unified hunks,
 * plus semantic (declaration-level) diffs for TypeScript/JavaScript.
 */

export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "typechange";

export type DeclKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable";

/** One top-level declaration extracted from a TS/JS source file. */
export interface DeclInfo {
  /** Declaration name, e.g. `calculateTotal`. */
  name: string;
  kind: DeclKind;
  /** Human-readable signature, e.g. `(items: Item[], tax?: number): number`. */
  signature: string;
  /** Extra comparable detail (class methods, interface members, enum members). */
  detail: string;
  exported: boolean;
  line: number;
}

/** A declaration present in both states but with a different signature/detail. */
export interface DeclChange {
  before: DeclInfo;
  after: DeclInfo;
}

export interface SemanticDiff {
  added: DeclInfo[];
  removed: DeclInfo[];
  modified: DeclChange[];
  /** Declarations identical in both states (count only, to keep reports tight). */
  unchangedCount: number;
}

/** One unified-diff hunk. */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  /** Raw hunk body lines, each starting with ' ', '+', or '-'. */
  lines: string[];
}

/** Everything known about a single changed file. */
export interface FileChange {
  /** Path in the "after" state (for deletions, the "before" path). */
  path: string;
  /** For renames: the "before" path. */
  oldPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  isBinary: boolean;
  /** Present when both states have readable text in a supported language. */
  semantic?: SemanticDiff;
}

export interface BreakingNote {
  path: string;
  severity: "breaking" | "attention";
  note: string;
}

export interface ReportTotals {
  filesChanged: number;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  additions: number;
  deletions: number;
  declsAdded: number;
  declsRemoved: number;
  declsModified: number;
}

export interface ChangeReport {
  tool: string;
  toolVersion: string;
  generatedAt: string;
  from: string;
  to: string;
  /** Optional path filters that were applied. */
  scope: string[];
  files: FileChange[];
  totals: ReportTotals;
  breaking: BreakingNote[];
}

export const TOOL_VERSION = "1.0.0";
