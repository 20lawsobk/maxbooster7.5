/**
 * change-compare — report assembly and rendering.
 *
 * Builds a ChangeReport from per-file changes and renders it as Markdown
 * (human review) or JSON (machine consumption).
 */
import type {
  BreakingNote,
  ChangeReport,
  DeclInfo,
  FileChange,
  ReportTotals,
} from "./types.js";
import { TOOL_VERSION } from "./types.js";

function fmtDecl(d: DeclInfo): string {
  const exp = d.exported ? "exported " : "";
  return `${exp}${d.kind} \`${d.name}\` — \`${d.signature}\``;
}

function detailBlock(detail: string, indent = "    "): string {
  if (!detail) return "";
  return detail
    .split("\n")
    .map((l) => `${indent}${l}`)
    .join("\n");
}

export function detectBreaking(file: FileChange): BreakingNote[] {
  const notes: BreakingNote[] = [];
  const s = file.semantic;
  if (!s) return notes;
  for (const d of s.removed) {
    if (d.exported) {
      notes.push({
        path: file.path,
        severity: "breaking",
        note: `Exported ${d.kind} \`${d.name}\` was removed.`,
      });
    }
  }
  for (const { before, after } of s.modified) {
    const what =
      before.signature !== after.signature ? "signature changed" : "members changed";
    if (after.exported || before.exported) {
      notes.push({
        path: file.path,
        severity: "breaking",
        note:
          `Exported ${after.kind} \`${after.name}\` ${what}:\n` +
          `  before: \`${before.signature}\`\n` +
          `  after:  \`${after.signature}\``,
      });
    } else {
      notes.push({
        path: file.path,
        severity: "attention",
        note:
          `Internal ${after.kind} \`${after.name}\` changed:\n` +
          `  before: \`${before.signature}\`\n` +
          `  after:  \`${after.signature}\``,
      });
    }
  }
  return notes;
}

export function computeTotals(files: FileChange[]): ReportTotals {
  const t: ReportTotals = {
    filesChanged: files.length,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    additions: 0,
    deletions: 0,
    declsAdded: 0,
    declsRemoved: 0,
    declsModified: 0,
  };
  for (const f of files) {
    if (f.status === "added") t.added++;
    else if (f.status === "modified") t.modified++;
    else if (f.status === "deleted") t.deleted++;
    else if (f.status === "renamed") t.renamed++;
    t.additions += f.additions;
    t.deletions += f.deletions;
    if (f.semantic) {
      t.declsAdded += f.semantic.added.length;
      t.declsRemoved += f.semantic.removed.length;
      t.declsModified += f.semantic.modified.length;
    }
  }
  return t;
}

export function buildReport(
  from: string,
  to: string,
  scope: string[],
  files: FileChange[],
): ChangeReport {
  const breaking = files.flatMap(detectBreaking);
  // Breaking notes first, then attention notes.
  breaking.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "breaking" ? -1 : 1,
  );
  return {
    tool: "change-compare",
    toolVersion: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    from,
    to,
    scope,
    files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
    totals: computeTotals(files),
    breaking,
  };
}

const STATUS_ICON: Record<string, string> = {
  added: "➕",
  modified: "✏️",
  deleted: "➖",
  renamed: "🔀",
  typechange: "🔧",
};

function renderFileSection(f: FileChange): string {
  const out: string[] = [];
  const title =
    f.status === "renamed" && f.oldPath
      ? `\`${f.oldPath}\` → \`${f.path}\``
      : `\`${f.path}\``;
  out.push(`## ${STATUS_ICON[f.status] ?? "•"} ${f.status.toUpperCase()} ${title}`);
  out.push("");
  out.push(
    `Lines: **+${f.additions} / -${f.deletions}**` +
      (f.isBinary ? " · binary file" : ""),
  );
  out.push("");

  const s = f.semantic;
  if (s) {
    const hasSemantic =
      s.added.length + s.removed.length + s.modified.length > 0;
    out.push("### Code changes");
    out.push("");
    if (!hasSemantic) {
      out.push(
        `No declaration-level changes (${s.unchangedCount} declaration(s) unchanged; only bodies/comments/whitespace differ).`,
      );
      out.push("");
    }
    for (const d of s.added) {
      out.push(`- ➕ Added ${fmtDecl(d)} (line ${d.line})`);
      const det = detailBlock(d.detail);
      if (det) out.push(det);
    }
    for (const d of s.removed) {
      out.push(`- ➖ Removed ${fmtDecl(d)}`);
      const det = detailBlock(d.detail);
      if (det) out.push(det);
    }
    for (const { before, after } of s.modified) {
      out.push(`- 🔁 Modified ${after.kind} \`${after.name}\`:`);
      out.push(`    - before: \`${before.signature}\``);
      out.push(`    - after:  \`${after.signature}\``);
      if (before.detail !== after.detail) {
        const bLines = new Set(before.detail.split("\n"));
        const removedMembers = before.detail
          .split("\n")
          .filter((l) => l && !after.detail.split("\n").includes(l));
        const addedMembers = after.detail
          .split("\n")
          .filter((l) => l && !bLines.has(l));
        for (const m of removedMembers) out.push(`    - member removed: \`${m}\``);
        for (const m of addedMembers) out.push(`    - member added: \`${m}\``);
      }
    }
    if (hasSemantic) out.push("");
  }

  if (f.hunks.length > 0 && !f.isBinary) {
    out.push("### Diff");
    out.push("");
    out.push("```diff");
    for (const h of f.hunks) {
      out.push(h.header);
      out.push(...h.lines);
    }
    out.push("```");
    out.push("");
  } else if (f.isBinary) {
    out.push("_Binary file changed — no textual diff._");
    out.push("");
  }
  return out.join("\n");
}

/** Render the full report as Markdown. */
export function renderMarkdown(report: ChangeReport): string {
  const t = report.totals;
  const out: string[] = [];
  out.push(`# Change comparison: \`${report.from}\` → \`${report.to}\``);
  out.push("");
  out.push(`_Generated ${report.generatedAt} by change-compare v${report.toolVersion}._`);
  if (report.scope.length > 0) {
    out.push(`_Scope: ${report.scope.map((s) => `\`${s}\``).join(", ")}_`);
  }
  out.push("");
  out.push("## Summary");
  out.push("");
  out.push("| Metric | Value |");
  out.push("| --- | --- |");
  out.push(`| Files changed | ${t.filesChanged} |`);
  out.push(`| Added / Modified / Deleted / Renamed | ${t.added} / ${t.modified} / ${t.deleted} / ${t.renamed} |`);
  out.push(`| Lines added / removed | +${t.additions} / -${t.deletions} |`);
  out.push(
    `| Declarations added / removed / modified | +${t.declsAdded} / -${t.declsRemoved} / ~${t.declsModified} |`,
  );
  out.push("");
  out.push("### Files");
  out.push("");
  out.push("| File | Status | Lines | Code changes |");
  out.push("| --- | --- | --- | --- |");
  for (const f of report.files) {
    const s = f.semantic;
    const codeSummary = s
      ? `+${s.added.length}/-${s.removed.length}/~${s.modified.length} decls`
      : f.isBinary
        ? "binary"
        : "—";
    const name =
      f.status === "renamed" && f.oldPath
        ? `\`${f.oldPath}\` → \`${f.path}\``
        : `\`${f.path}\``;
    out.push(
      `| ${name} | ${f.status} | +${f.additions}/-${f.deletions} | ${codeSummary} |`,
    );
  }
  out.push("");

  if (report.breaking.length > 0) {
    out.push("## ⚠️ Breaking / attention notes");
    out.push("");
    for (const b of report.breaking) {
      const icon = b.severity === "breaking" ? "🔴" : "🟡";
      out.push(`- ${icon} \`${b.path}\`: ${b.note.replace(/\n/g, "\n  ")}`);
    }
    out.push("");
  }

  for (const f of report.files) {
    out.push(renderFileSection(f));
  }
  return out.join("\n");
}

/** Render the full report as pretty-printed JSON. */
export function renderJson(report: ChangeReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}
