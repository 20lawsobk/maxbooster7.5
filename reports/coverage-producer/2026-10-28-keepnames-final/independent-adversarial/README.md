# Independent C5 generated-helper review

The exact candidate patch was reviewed against the actual installed
`ast-v8-to-istanbul` converter. Its VariableDeclarator callback passes the exact
AST identity to `ignoreNode`; the nested skip is confined to the generated helper
subtree. Filtered standalone calls accept only identifier and literal arguments,
so they contain no original arrow or function expression to remove. Original
identifier collisions fail closed across all original source files.

An independent credential-free rerun passed all nine candidate tests, including
the real synthetic inspector run and the retained production-profile replay.
The copied test changes only its candidate-module import and owned proof output
path; the source candidate is unchanged. Twelve additional real esbuild compiler
fixtures preserve at least every original statement/function/branch denominator
node, including nested functions, classes, initializers, Unicode, escaped and
destructured author bindings, JSX, TypeScript and anonymous default declarations.
These twelve controls use deliberately empty counters and are denominator-only
checks, never execution claims.

Verdict: approve for a controlled integration recheck. This is not approval to
merge incompatible profiles, increase global coverage, or launch. The complete
integrated framework and a fresh actual collector execution remain required.
`review.json` records exact source hashes and limits. No repository file was
changed.
