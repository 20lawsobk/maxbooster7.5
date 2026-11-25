# Independent finite-template candidate review

The reviewed helper hash is recorded in `review-result.json`. This review changed
only this outside-checkout review directory. It did not modify the proposed
helper, existing tests, repository source, inventory, acceptance gates or counters.

Four valid JavaScript lexical-shadowing cases return the wrong finite route set:
`for` statement bindings, `for...in` bindings, and switch case/default lexical
bindings are skipped while walking ancestors to the outer finite loop. In every
case the actual synthetic registration is `/inner`, but the candidate returns
`/outer`. These are false source-topology declarations, not merely missed routes.
An additional TypeScript enum binding has the same flaw (see
`counterexamples.mjs`), but no transpiled application execution was needed or run.

Reproduce the four decisive JavaScript examples:

```sh
/workspace/.cloud-tools/node_modules/.bin/node /workspace/onboarding-results/topology-candidate/finite-review/review-proof.mjs
```

The proof executes only tiny credential-free synthetic snippets in a bounded VM;
it does not import or evaluate Max Booster source. The finite helper is exercised
through its actual public export. All observations retain their exact input text.

Required correction: reject interpolations crossing an ancestor that binds the
same identifier in a classic `for` initializer, a `for...in` initializer, or a
switch `CaseBlock` (whose direct declarations span its clauses). Include runtime
TypeScript enum declarations in lexical-binding detection. Prefer rejecting
unsupported cases to claiming the enclosing loop's values. Keep the actual
Fan Hub inline `const` for-of case and the existing 18 adverse/bounded regression
cases. Add these counterexamples to the canonical portable tests before landing.

This review does not establish route availability, backend behavior, page
completion or launch readiness. Existing regex-based topology limits remain.

A follow-up review after the first lexical-scope corrections found a named class
expression's self-binding in a static block: actual registration interpolates
the class value, while the then-current helper interpolates the outer string.
`class-static-result.json` records that helper hash separately so the earlier
review is not silently relabeled. Reject matching named ClassExpression ancestors
in both interpolation-binding and named-array lookup walks.
