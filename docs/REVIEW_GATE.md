# Deterministic pre-commit review gate

`npm run prepare` installs a local Git `pre-commit` hook. A fresh checkout gets
the same setup when dependencies are installed; run `npm run review:install`
manually if install scripts were disabled. The hook runs
`npm run review:staged` and never edits source files.

The gate:

- checks the staged patch for whitespace errors and refuses to review files
  whose staged and working-tree contents differ;
- validates staged JSON and requires checkpoint weights to remain Git LFS
  pointers, with the actual bytes kept in App Storage;
- runs the applicable TypeScript, ESLint, Node/Vitest, Python, Rust, shell,
  schema-contract, and dependency-audit checks based on staged paths;
- fails on a check error or timeout rather than recording a pass.

Run the same gate manually with `npm run review:staged`. The hook preserves any
existing non-Max-Booster pre-commit hook rather than replacing it.

This is a deterministic test and policy gate, not an AI reviewer. It does not
apply patches, establish production readiness, or replace a focused
architectural review and real deployment acceptance. The selected checks are
listed in the command output; tests not selected by the path rules remain
unverified.
