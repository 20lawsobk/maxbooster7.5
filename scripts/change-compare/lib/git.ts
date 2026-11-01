/**
 * change-compare — git plumbing.
 *
 * Thin wrappers over the git CLI. All commands run with an explicit argv
 * array (no shell), so paths with spaces or unusual characters are safe.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileChange, FileStatus, Hunk } from "./types.js";

export interface ChangedEntry {
  status: FileStatus;
  /** Path in the "after" state (for deletions, the "before" path). */
  path: string;
  /** Set for renames: the "before" path. */
  oldPath?: string;
}

export function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err: any) {
    const stderr = String(err?.stderr ?? err?.message ?? err).trim();
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

/** A "to" endpoint of the comparison. */
export type ToEndpoint =
  | { kind: "ref"; ref: string }
  | { kind: "worktree" }
  | { kind: "index" };

/**
 * Parse `git diff --name-status -z` output.
 * Entries look like `M\0path\0` or `R100\0old\0new\0`.
 */
export function parseNameStatus(output: string): ChangedEntry[] {
  const parts = output.split("\0").filter((p) => p.length > 0);
  const entries: ChangedEntry[] = [];
  let i = 0;
  while (i < parts.length) {
    const code = parts[i++];
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      const oldPath = parts[i++];
      const path = parts[i++];
      entries.push({
        status: letter === "R" ? "renamed" : "modified",
        path,
        oldPath,
      });
    } else {
      const path = parts[i++];
      const status: FileStatus =
        letter === "A"
          ? "added"
          : letter === "D"
            ? "deleted"
            : letter === "T"
              ? "typechange"
              : "modified";
      entries.push({ status, path });
    }
  }
  return entries;
}

/**
 * List changed files between `from` and `to`.
 * `to` may be a ref, the working tree, or the index.
 */
export function listChangedFiles(
  cwd: string,
  from: string,
  to: ToEndpoint,
): ChangedEntry[] {
  const args = [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--diff-filter=ACDMRT",
    from,
  ];
  if (to.kind === "ref") args.push(to.ref);
  else if (to.kind === "index") args.push("--cached");
  // worktree: `git diff from` already diffs commit -> worktree
  const out = runGit(cwd, args);
  return parseNameStatus(out);
}

/**
 * Unified diff text for one file between the two endpoints.
 * Returns "" when git produces no textual diff (e.g. binary files).
 */
export function diffTextForFile(
  cwd: string,
  from: string,
  to: ToEndpoint,
  entry: ChangedEntry,
  contextLines = 3,
): string {
  const args = [
    "diff",
    `--unified=${contextLines}`,
    "--no-color",
    "--no-ext-diff",
    from,
  ];
  if (to.kind === "ref") args.push(to.ref);
  else if (to.kind === "index") args.push("--cached");
  args.push("--", entry.oldPath ?? entry.path, entry.path);
  try {
    return runGit(cwd, args);
  } catch {
    return "";
  }
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parse unified-diff text into hunks, counting added/removed lines.
 * `+++`/`---` file headers are not counted as content lines.
 */
export function parseDiff(
  diffText: string,
): { hunks: Hunk[]; additions: number; deletions: number; isBinary: boolean } {
  const hunks: Hunk[] = [];
  let additions = 0;
  let deletions = 0;
  let isBinary = false;
  let current: Hunk | null = null;

  for (const rawLine of diffText.split("\n")) {
    if (rawLine.startsWith("Binary files ")) {
      isBinary = true;
      continue;
    }
    const m = HUNK_HEADER_RE.exec(rawLine);
    if (m) {
      current = {
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        header: rawLine,
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (
      rawLine.startsWith("--- ") ||
      rawLine.startsWith("+++ ") ||
      rawLine.startsWith("diff --git")
    ) {
      continue;
    }
    const marker = rawLine[0];
    if (marker === "+" || marker === "-" || marker === " ") {
      current.lines.push(rawLine);
      if (marker === "+") additions++;
      else if (marker === "-") deletions++;
    } else if (rawLine === "\\ No newline at end of file") {
      current.lines.push(rawLine);
    }
  }
  return { hunks, additions, deletions, isBinary };
}

/**
 * Read a file's content at an endpoint.
 * Returns null when the file does not exist at that endpoint.
 */
export function readContentAt(
  cwd: string,
  endpoint: { kind: "ref"; ref: string } | ToEndpoint,
  path: string,
): string | null {
  if (endpoint.kind === "worktree") {
    try {
      return readFileSync(join(cwd, path), "utf8");
    } catch {
      return null;
    }
  }
  const rev = endpoint.kind === "ref" ? endpoint.ref : "";
  const spec = endpoint.kind === "index" ? `:${path}` : `${rev}:${path}`;
  try {
    return runGit(cwd, ["show", spec]);
  } catch {
    return null;
  }
}

/** Resolve a ref to a full SHA (throws when unresolvable). */
export function resolveRef(cwd: string, ref: string): string {
  return runGit(cwd, ["rev-parse", "--verify", ref]).trim();
}

/** Short human label for a comparison endpoint. */
export function endpointLabel(to: ToEndpoint): string {
  if (to.kind === "ref") return to.ref;
  if (to.kind === "index") return "<staged index>";
  return "<working tree>";
}

/** Build the FileChange skeleton (stats + hunks) for one changed entry. */
export function buildFileChangeSkeleton(
  cwd: string,
  from: string,
  to: ToEndpoint,
  entry: ChangedEntry,
  contextLines = 3,
): Omit<FileChange, "semantic"> {
  const diffText = diffTextForFile(cwd, from, to, entry, contextLines);
  const { hunks, additions, deletions, isBinary } = parseDiff(diffText);
  return {
    path: entry.path,
    oldPath: entry.oldPath,
    status: entry.status,
    additions,
    deletions,
    hunks,
    isBinary,
  };
}
