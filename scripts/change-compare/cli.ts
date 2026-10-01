#!/usr/bin/env node
/**
 * change-compare — before/after comparison of code changes.
 *
 * Usage:
 *   npx tsx scripts/change-compare/cli.ts --from <ref> --to <ref> [options]
 *   npx tsx scripts/change-compare/cli.ts --from HEAD            # vs working tree
 *   npx tsx scripts/change-compare/cli.ts --from HEAD --staged   # vs staged index
 *
 * Options:
 *   --from <ref>       "before" git ref (default: HEAD)
 *   --to <ref>         "after" git ref (default: working tree)
 *   --staged           compare against the staged index instead of worktree/ref
 *   --format md|json   output format (default: md)
 *   --out <file>       write report to file instead of stdout
 *   --path <glob>      only include matching paths (repeatable)
 *   --context <n>      unified diff context lines (default: 3)
 *   --no-semantic      skip declaration-level analysis
 *   --cwd <dir>        repo directory (default: current directory)
 *   --help             show this help
 *
 * Exit codes: 0 = report produced (even when empty), 1 = usage/runtime error.
 */
import { writeFileSync } from "node:fs";
import {
  buildFileChangeSkeleton,
  endpointLabel,
  listChangedFiles,
  readContentAt,
  resolveRef,
  type ToEndpoint,
} from "./lib/git.js";
import { isSupported, semanticDiff } from "./lib/semantic.js";
import { buildReport, renderJson, renderMarkdown } from "./lib/report.js";
import type { FileChange } from "./lib/types.js";

interface Options {
  from: string;
  to?: string;
  staged: boolean;
  format: "md" | "json";
  out?: string;
  paths: string[];
  context: number;
  semantic: boolean;
  cwd: string;
}

function printHelp(): void {
  console.log(
    [
      "change-compare — explicit before/after comparison of code changes",
      "",
      "Compares two states of a git repo and reports every change in explicit",
      "detail: file status, line stats, declaration-level code changes",
      "(functions/classes/interfaces/types added, removed, or re-signed),",
      "breaking-change notes, and unified diffs.",
      "",
      "Usage:",
      "  npx tsx scripts/change-compare/cli.ts --from <ref> --to <ref> [options]",
      "  npx tsx scripts/change-compare/cli.ts --from HEAD              # vs working tree",
      "  npx tsx scripts/change-compare/cli.ts --from HEAD --staged      # vs index",
      "",
      "Options:",
      "  --from <ref>      before state git ref (default: HEAD)",
      "  --to <ref>        after state git ref (default: working tree)",
      "  --staged          after state = staged index (cannot combine with --to)",
      "  --format md|json  output format (default: md)",
      "  --out <file>      write report to file instead of stdout",
      "  --path <glob>     only include matching paths (repeatable, * wildcards)",
      "  --context <n>     unified diff context lines (default: 3)",
      "  --no-semantic     skip declaration-level analysis",
      "  --cwd <dir>       repository directory (default: cwd)",
      "  --help            show this help",
      "",
      "Examples:",
      "  npx tsx scripts/change-compare/cli.ts --from main --to feature-x --format md --out report.md",
      "  npm run change-compare -- --from HEAD~3 --to HEAD --path 'server/**'",
    ].join("\n"),
  );
}

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    from: "HEAD",
    staged: false,
    format: "md",
    paths: [],
    context: 3,
    semantic: true,
    cwd: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`Option ${a} requires a value.`);
      }
      return v;
    };
    switch (a) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      case "--from":
        opts.from = next();
        break;
      case "--to":
        opts.to = next();
        break;
      case "--staged":
        opts.staged = true;
        break;
      case "--format": {
        const f = next();
        if (f !== "md" && f !== "json") throw new Error(`--format must be md or json, got "${f}".`);
        opts.format = f;
        break;
      }
      case "--out":
        opts.out = next();
        break;
      case "--path":
        opts.paths.push(next());
        break;
      case "--context": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 0) throw new Error("--context must be a non-negative integer.");
        opts.context = n;
        break;
      }
      case "--no-semantic":
        opts.semantic = false;
        break;
      case "--cwd":
        opts.cwd = next();
        break;
      default:
        throw new Error(`Unknown option "${a}". Use --help.`);
    }
  }
  if (opts.staged && opts.to !== undefined) {
    throw new Error("--staged cannot be combined with --to.");
  }
  return opts;
}

/** Minimal glob: `*` matches any run of chars except `/`, `**` matches anything. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more directories.
        if (glob[i + 2] === "/") {
          re += "(.*/)?";
          i += 2;
        } else {
          re += ".*";
          i++;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesScope(path: string, globs: string[]): boolean {
  if (globs.length === 0) return true;
  return globs.some((g) => globToRegExp(g).test(path));
}

async function main(): Promise<void> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err: any) {
    console.error(`change-compare: ${err.message}`);
    process.exit(1);
  }

  const to: ToEndpoint = opts.staged
    ? { kind: "index" }
    : opts.to !== undefined
      ? { kind: "ref", ref: opts.to }
      : { kind: "worktree" };

  let fromSha: string;
  try {
    fromSha = resolveRef(opts.cwd, opts.from);
  } catch (err: any) {
    console.error(`change-compare: cannot resolve --from "${opts.from}": ${err.message}`);
    process.exit(1);
  }
  if (to.kind === "ref") {
    try {
      to.ref = resolveRef(opts.cwd, to.ref);
    } catch (err: any) {
      console.error(`change-compare: cannot resolve --to "${opts.to}": ${err.message}`);
      process.exit(1);
    }
  }

  const entries = listChangedFiles(opts.cwd, fromSha, to).filter((e) =>
    matchesScope(e.path, opts.paths),
  );

  const files: FileChange[] = [];
  for (const entry of entries) {
    const skeleton = buildFileChangeSkeleton(
      opts.cwd,
      fromSha,
      to,
      entry,
      opts.context,
    );
    let semantic: FileChange["semantic"];
    if (opts.semantic && !skeleton.isBinary && isSupported(skeleton.path)) {
      const beforePath = entry.oldPath ?? entry.path;
      const before =
        entry.status === "added"
          ? null
          : readContentAt(opts.cwd, { kind: "ref", ref: fromSha }, beforePath);
      const after =
        entry.status === "deleted"
          ? null
          : readContentAt(opts.cwd, to, entry.path);
      semantic = semanticDiff(before, after, skeleton.path);
    }
    files.push({ ...skeleton, semantic });
  }

  const report = buildReport(
    opts.from,
    to.kind === "ref" ? (opts.to as string) : endpointLabel(to),
    opts.paths,
    files,
  );
  const output = opts.format === "json" ? renderJson(report) : renderMarkdown(report);
  if (opts.out) {
    writeFileSync(opts.out, output, "utf8");
    console.error(`change-compare: wrote ${opts.format} report to ${opts.out}`);
  } else {
    process.stdout.write(output);
  }
}

main().catch((err) => {
  console.error(`change-compare: ${err?.message ?? err}`);
  process.exit(1);
});
