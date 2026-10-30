/**
 * AUTOFIX DIRECTIVE LOADER
 *
 * The operating charter for every automated fix surface in Max Booster —
 * chainErrorAutoFixer, platformAutoFixer, the fix-all pipeline, and any
 * AI-driven repair session. The directive itself lives in
 * server/services/autofix/DIRECTIVE.md so it can be versioned and read
 * by humans and agents alike.
 *
 * Loaded once, cached; never throws (missing file returns null so the
 * fixers keep running without a charter rather than crashing).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | null | undefined;

export function getAutofixDirective(): string | null {
  if (cached !== undefined) return cached;
  // Try cwd-relative first (works in dev AND in the bundled dist build,
  // which runs from the workspace root), then module-relative as fallback.
  const candidates: string[] = [
    join(process.cwd(), "server", "services", "autofix", "DIRECTIVE.md"),
  ];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "autofix", "DIRECTIVE.md"));
  } catch {
    /* bundlers may rewrite import.meta.url — cwd candidate still applies */
  }
  cached = null;
  for (const p of candidates) {
    try {
      cached = readFileSync(p, "utf8");
      break;
    } catch {
      /* try next */
    }
  }
  return cached;
}

export function getAutofixDirectiveSummary(): {
  present: boolean;
  bytes: number;
  headline: string | null;
} {
  const d = getAutofixDirective();
  return {
    present: d !== null,
    bytes: d?.length ?? 0,
    headline: d?.split("\n").find((l) => l.startsWith("# ")) ?? null,
  };
}
