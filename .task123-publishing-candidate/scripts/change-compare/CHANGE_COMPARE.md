# change-compare

A before/after comparison system for code changes. Point it at any two states
of a git repository and it produces an explicit, per-change report of exactly
what is different — designed for code review, release notes, and auditing
refactors.

## What it reports

For every changed file:

- **Status** — added, modified, deleted, renamed (with old → new path), or typechange
- **Line stats** — additions / deletions
- **Code changes (semantic diff)** — for TypeScript/JavaScript files, the exact
  declarations that were **added**, **removed**, or **modified**, with full
  before/after signatures:
  - functions: `add(a: number, b: number)` → `add(a: number, b: number, c = 0)`
  - classes: signature plus member-level changes (method added/removed/re-signed)
  - interfaces, type aliases, enums, variables
  - each marked exported vs. internal
- **Breaking / attention notes** — heuristic flags, e.g. "exported function
  `oldFn` was removed" (🔴 breaking) vs. "internal function `helper` changed"
  (🟡 attention)
- **Unified diff** — the raw hunks, per file

Plus a summary table (files, lines, declaration counts) across the whole change.

## Usage

```bash
# Compare two refs
npx tsx scripts/change-compare/cli.ts --from main --to feature-branch

# Compare HEAD against your uncommitted working tree
npx tsx scripts/change-compare/cli.ts --from HEAD

# Compare HEAD against the staged index
npx tsx scripts/change-compare/cli.ts --from HEAD --staged

# Write a markdown report to a file
npx tsx scripts/change-compare/cli.ts --from v1.0 --to v2.0 --format md --out report.md

# JSON for tooling, scoped to server code only
npx tsx scripts/change-compare/cli.ts --from HEAD~5 --to HEAD --format json --path 'server/**'

# Via npm
npm run change-compare -- --from main --to HEAD
```

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--from <ref>` | `HEAD` | "Before" git ref |
| `--to <ref>` | working tree | "After" git ref |
| `--staged` | off | Use the staged index as the "after" state (not combinable with `--to`) |
| `--format md\|json` | `md` | Output format |
| `--out <file>` | stdout | Write report to a file |
| `--path <glob>` | all | Only include matching paths (repeatable; `*` and `**` supported) |
| `--context <n>` | `3` | Unified-diff context lines |
| `--no-semantic` | off | Skip declaration-level analysis |
| `--cwd <dir>` | cwd | Repository directory |

Exit code is `0` whenever a report is produced (even an empty one), `1` on
usage errors or unresolvable refs.

## How it works

```
┌──────────┐   ┌──────────┐
│  before  │   │  after   │
│ git ref  │   │ ref /    │
│          │   │ worktree │
│          │   │ / index  │
└────┬─────┘   └────┬─────┘
     │  git diff --name-status -z
     ▼
┌─────────────────────────────┐
│ changed files (status,       │
│ renames detected)           │
└──────────────┬──────────────┘
               │  per file: git diff -U, git show <ref>:<path>
               ▼
┌──────────────────────────────┐   ┌─────────────────────────┐
│ line stats + unified hunks   │   │ TS compiler API parses  │
│                              │──▶│ both versions, extracts   │
│                              │   │ top-level declarations, │
│                              │   │ diffs them by name      │
└──────────────────────────────┘   └─────────────────────────┘
               │                                │
               └──────────────┬─────────────────┘
                              ▼
               ┌──────────────────────────────┐
               │ ChangeReport → Markdown/JSON │
               │ + breaking-change heuristics │
               └──────────────────────────────┘
```

Semantic analysis uses the TypeScript compiler API (`ts.createSourceFile`),
so it understands real syntax rather than guessing from text. It is purely
static — no code is executed.

## Library use

The pieces are importable independently:

```ts
import { listChangedFiles, readContentAt } from "./lib/git.js";
import { semanticDiff } from "./lib/semantic.js";
import { buildReport, renderMarkdown } from "./lib/report.js";
```

## Limits

- Semantic diffs cover `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`. Other files
  get line stats and hunks only.
- Only **top-level** declarations are tracked; changes nested inside function
  bodies without signature changes show as "only bodies differ".
- Breaking-change notes are heuristics (exported symbol removed or re-signed),
  not a soundness proof — review them, don't blindly trust them.
- Binary files are reported as changed with no textual diff.
