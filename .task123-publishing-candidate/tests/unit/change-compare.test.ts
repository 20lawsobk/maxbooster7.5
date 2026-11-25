/**
 * change-compare — unit tests.
 *
 * Covers: name-status parsing, hunk parsing, TS declaration extraction,
 * declaration diffing, glob filtering, arg parsing, and an end-to-end run
 * against a real temporary git repository.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listChangedFiles,
  parseDiff,
  parseNameStatus,
  readContentAt,
} from "../../scripts/change-compare/lib/git.js";
import {
  diffDeclarations,
  extractDeclarations,
  isSupported,
  semanticDiff,
} from "../../scripts/change-compare/lib/semantic.js";
import {
  buildReport,
  detectBreaking,
  renderJson,
  renderMarkdown,
} from "../../scripts/change-compare/lib/report.js";
import {
  globToRegExp,
  matchesScope,
  parseArgs,
} from "../../scripts/change-compare/cli.js";

describe("parseNameStatus", () => {
  it("parses added, modified, deleted entries", () => {
    const out = "A\0new.ts\0M\0changed.ts\0D\0gone.ts\0";
    const entries = parseNameStatus(out);
    expect(entries).toEqual([
      { status: "added", path: "new.ts" },
      { status: "modified", path: "changed.ts" },
      { status: "deleted", path: "gone.ts" },
    ]);
  });

  it("parses renames with old and new paths", () => {
    const out = "R100\0old-name.ts\0new-name.ts\0";
    const entries = parseNameStatus(out);
    expect(entries).toEqual([
      { status: "renamed", path: "new-name.ts", oldPath: "old-name.ts" },
    ]);
  });

  it("handles paths with spaces", () => {
    const out = "M\0my dir/file name.ts\0";
    expect(parseNameStatus(out)).toEqual([
      { status: "modified", path: "my dir/file name.ts" },
    ]);
  });
});

describe("parseDiff", () => {
  const sample = [
    "diff --git a/a.ts b/a.ts",
    "index 111..222 100644",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,3 +1,4 @@",
    " line one",
    "-old line",
    "+new line one",
    "+new line two",
    " line three",
    "\\ No newline at end of file",
    "@@ -10,2 +11,1 @@",
    "-removed",
    " kept",
  ].join("\n");

  it("extracts hunks with correct headers and line counts", () => {
    const { hunks, additions, deletions, isBinary } = parseDiff(sample);
    expect(isBinary).toBe(false);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
    });
    expect(additions).toBe(2);
    expect(deletions).toBe(2);
    expect(hunks[0].lines).toContain("+new line one");
  });

  it("detects binary diffs", () => {
    const { isBinary, hunks } = parseDiff(
      "Binary files a/img.png and b/img.png differ",
    );
    expect(isBinary).toBe(true);
    expect(hunks).toHaveLength(0);
  });
});

describe("extractDeclarations", () => {
  const source = `
export function calculateTotal(items: Item[], tax?: number): number {
  return 0;
}
function helper(x: string) {
  return x;
}
export class Store extends Base implements Storable {
  count: number = 0;
  get(key: string): string | undefined { return undefined; }
  static create(): Store { return new Store(); }
}
export interface Item {
  id: string;
  price?: number;
  label(): string;
}
export type Id = string | number;
export enum Color { Red, Green }
export const VERSION: string = "1.0.0";
const internal = 42;
`;

  it("extracts functions with signatures and export flags", () => {
    const decls = extractDeclarations(source, "sample.ts");
    const calc = decls.find((d) => d.name === "calculateTotal");
    expect(calc).toMatchObject({
      kind: "function",
      exported: true,
      signature: "calculateTotal(items: Item[], tax?: number): number",
    });
    const helper = decls.find((d) => d.name === "helper");
    expect(helper).toMatchObject({ kind: "function", exported: false });
  });

  it("extracts classes with methods in detail", () => {
    const decls = extractDeclarations(source, "sample.ts");
    const store = decls.find((d) => d.name === "Store");
    expect(store).toMatchObject({
      kind: "class",
      signature: "class Store extends Base implements Storable",
    });
    expect(store!.detail).toContain("get(key: string): string | undefined");
    expect(store!.detail).toContain("static create(): Store");
    expect(store!.detail).toContain("count: number");
  });

  it("extracts interfaces, types, enums, and variables", () => {
    const decls = extractDeclarations(source, "sample.ts");
    expect(decls.find((d) => d.name === "Item")?.kind).toBe("interface");
    const item = decls.find((d) => d.name === "Item")!;
    expect(item.detail).toContain("id: string");
    expect(item.detail).toContain("price?: number");
    expect(decls.find((d) => d.name === "Id")).toMatchObject({
      kind: "type",
      signature: "type Id = string | number",
    });
    expect(decls.find((d) => d.name === "Color")?.kind).toBe("enum");
    expect(decls.find((d) => d.name === "VERSION")).toMatchObject({
      kind: "variable",
      exported: true,
    });
    expect(decls.find((d) => d.name === "internal")).toMatchObject({
      kind: "variable",
      exported: false,
    });
  });

  it("returns empty for unparseable input without throwing", () => {
    expect(extractDeclarations("", "empty.ts")).toEqual([]);
  });
});

describe("diffDeclarations", () => {
  const before = extractDeclarations(
    `export function a(x: number): number { return x; }
export function gone(): void {}
export class K { m(): void {} }`,
    "f.ts",
  );
  const after = extractDeclarations(
    `export function a(x: number, y?: string): number { return x; }
export function fresh(): boolean { return true; }
export class K { m(): void {} }`,
    "f.ts",
  );

  it("detects added, removed, modified, and unchanged", () => {
    const diff = diffDeclarations(before, after);
    expect(diff.added.map((d) => d.name)).toEqual(["fresh"]);
    expect(diff.removed.map((d) => d.name)).toEqual(["gone"]);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].before.signature).toBe("a(x: number): number");
    expect(diff.modified[0].after.signature).toBe(
      "a(x: number, y?: string): number",
    );
    expect(diff.unchangedCount).toBe(1); // class K
  });

  it("semanticDiff treats a missing side as empty, undefined only when both missing", () => {
    expect(semanticDiff("x", "y", "notes.md")).toBeUndefined();
    expect(semanticDiff(null, null, "a.ts")).toBeUndefined();
    const added = semanticDiff(null, "export function f(): void {}", "a.ts")!;
    expect(added.added.map((d) => d.name)).toEqual(["f"]);
    expect(added.removed).toEqual([]);
    const removed = semanticDiff("export function f(): void {}", null, "a.ts")!;
    expect(removed.removed.map((d) => d.name)).toEqual(["f"]);
    expect(removed.added).toEqual([]);
  });

  it("isSupported matches TS/JS extensions only", () => {
    expect(isSupported("a.ts")).toBe(true);
    expect(isSupported("b.tsx")).toBe(true);
    expect(isSupported("c.mjs")).toBe(true);
    expect(isSupported("d.md")).toBe(false);
    expect(isSupported("e.py")).toBe(false);
  });
});

describe("detectBreaking", () => {
  it("flags removed exported declarations as breaking", () => {
    const file: any = {
      path: "api.ts",
      semantic: {
        added: [],
        removed: [
          { name: "oldFn", kind: "function", signature: "oldFn(): void", exported: true },
        ],
        modified: [],
        unchangedCount: 0,
      },
    };
    const notes = detectBreaking(file);
    expect(notes).toHaveLength(1);
    expect(notes[0].severity).toBe("breaking");
    expect(notes[0].note).toContain("oldFn");
  });

  it("flags exported signature changes as breaking, internal as attention", () => {
    const file: any = {
      path: "lib.ts",
      semantic: {
        added: [],
        removed: [],
        modified: [
          {
            before: { name: "pub", kind: "function", signature: "pub(): void", exported: true },
            after: { name: "pub", kind: "function", signature: "pub(x: number): void", exported: true },
          },
          {
            before: { name: "priv", kind: "function", signature: "priv(): void", exported: false },
            after: { name: "priv", kind: "function", signature: "priv(x: number): void", exported: false },
          },
        ],
        unchangedCount: 0,
      },
    };
    const notes = detectBreaking(file);
    expect(notes.map((n) => n.severity)).toEqual(["breaking", "attention"]);
  });
});

describe("glob filtering and arg parsing", () => {
  it("matches ** globs across directories", () => {
    expect(globToRegExp("server/**").test("server/a/b.ts")).toBe(true);
    expect(globToRegExp("**/x.ts").test("x.ts")).toBe(true);
    expect(globToRegExp("**/x.ts").test("a/b/x.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("a.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("a/b.ts")).toBe(false);
  });

  it("matchesScope is permissive with no globs", () => {
    expect(matchesScope("anything/at/all.ts", [])).toBe(true);
    expect(matchesScope("server/a.ts", ["server/**"])).toBe(true);
    expect(matchesScope("client/a.ts", ["server/**"])).toBe(false);
  });

  it("parseArgs handles flags and rejects bad input", () => {
    const o = parseArgs([
      "--from",
      "main",
      "--to",
      "feat",
      "--format",
      "json",
      "--path",
      "server/**",
      "--context",
      "5",
      "--no-semantic",
    ]);
    expect(o).toMatchObject({
      from: "main",
      to: "feat",
      format: "json",
      context: 5,
      semantic: false,
    });
    expect(o.paths).toEqual(["server/**"]);
    expect(() => parseArgs(["--bogus"])).toThrow();
    expect(() => parseArgs(["--staged", "--to", "x"])).toThrow();
    expect(() => parseArgs(["--format", "xml"])).toThrow();
  });
});

describe("end-to-end against a temp git repo", () => {
  const makeRepo = () => {
    const dir = mkdtempSync(join(tmpdir(), "change-compare-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    return dir;
  };

  it("compares two commits with semantic detail", () => {
    const dir = makeRepo();
    try {
      writeFileSync(
        join(dir, "calc.ts"),
        `export function add(a: number, b: number): number { return a + b; }\nexport const TAG = "v1";\n`,
      );
      execFileSync("git", ["add", "."], { cwd: dir });
      execFileSync("git", ["commit", "-qm", "v1"], { cwd: dir });

      writeFileSync(
        join(dir, "calc.ts"),
        `export function add(a: number, b: number, c = 0): number { return a + b + c; }\nexport function sub(a: number, b: number): number { return a - b; }\n`,
      );
      writeFileSync(join(dir, "new.ts"), `export const fresh = true;\n`);
      execFileSync("git", ["add", "."], { cwd: dir });
      execFileSync("git", ["commit", "-qm", "v2"], { cwd: dir });

      const entries = listChangedFiles(dir, "HEAD~1", { kind: "ref", ref: "HEAD" });
      expect(entries.map((e) => e.path).sort()).toEqual(["calc.ts", "new.ts"]);

      const before = readContentAt(dir, { kind: "ref", ref: "HEAD~1" }, "calc.ts");
      const after = readContentAt(dir, { kind: "ref", ref: "HEAD" }, "calc.ts");
      const sem = semanticDiff(before, after, "calc.ts")!;
      expect(sem.added.map((d) => d.name)).toEqual(["sub"]);
      expect(sem.removed.map((d) => d.name)).toEqual(["TAG"]);
      expect(sem.modified.map((m) => m.after.name)).toEqual(["add"]);

      const files: any[] = entries.map((e) => ({
        path: e.path,
        status: e.status,
        additions: 1,
        deletions: 1,
        hunks: [],
        isBinary: false,
        semantic: e.path === "calc.ts" ? sem : undefined,
      }));
      const report = buildReport("HEAD~1", "HEAD", [], files);
      const md = renderMarkdown(report);
      expect(md).toContain("## Summary");
      expect(md).toContain("calc.ts");
      expect(md).toContain("Modified function `add`");
      expect(md).toContain("🔴");
      const json = JSON.parse(renderJson(report));
      expect(json.totals.filesChanged).toBe(2);
      expect(json.totals.declsModified).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("compares HEAD against the working tree", () => {
    const dir = makeRepo();
    try {
      writeFileSync(join(dir, "w.ts"), `export const A = 1;\n`);
      execFileSync("git", ["add", "."], { cwd: dir });
      execFileSync("git", ["commit", "-qm", "base"], { cwd: dir });
      writeFileSync(join(dir, "w.ts"), `export const A = 2;\nexport const B = 3;\n`);

      const entries = listChangedFiles(dir, "HEAD", { kind: "worktree" });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ status: "modified", path: "w.ts" });
      const after = readContentAt(dir, { kind: "worktree" }, "w.ts");
      expect(after).toContain("const B = 3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
