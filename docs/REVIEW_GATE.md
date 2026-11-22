# Deterministic pre-commit review gate

`npm run prepare` installs a local Git `pre-commit` hook when no custom hook
already exists. A fresh checkout gets the same setup when dependencies are
installed; run `npm run review:install` manually if install scripts were
disabled. The hook runs `npm run review:staged` and never edits source files.

The gate:

- checks the staged patch for whitespace errors and refuses to review files
  whose staged and working-tree contents differ;
- validates staged JSON and rejects full checkpoint blobs in favor of small
  Git LFS pointers; it does not independently verify the remote object;
- runs the applicable TypeScript, ESLint, Node/Vitest, Python, Rust, shell,
  schema-contract, and dependency-audit checks based on staged paths;
- fails on a check error or timeout rather than recording a pass.

Run the same gate manually with `npm run review:staged`. If a custom pre-commit
hook already exists, the installer preserves it and reports that it did not
replace it; integrate the review command into that hook explicitly if both
checks are required.

This is a deterministic test and policy gate, not an AI reviewer. It does not
apply patches, establish production readiness, or replace a focused
architectural review and real deployment acceptance. The selected checks are
listed in the command output; tests not selected by the path rules remain
unverified.
