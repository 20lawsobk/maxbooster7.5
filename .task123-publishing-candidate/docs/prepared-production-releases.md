# Optional prepared-release inspection tools

The configured Replit publishing path in `.replit` is `bash build.sh`, then
`bash start.sh`. Its guarded build/pack and restore/start executive does not
require or consume `.prepared-release`. See [DEPLOYMENT.md](DEPLOYMENT.md) and
[publishing-build-authorization.md](publishing-build-authorization.md).

For an explicitly selected isolated preparation rehearsal:

```sh
npm run release:prepare
npm run release:verify
```

Preparation creates a fresh isolated build under `.local/prepared-releases`.
It does not run the destructive packer in the development checkout. Source,
dependency locks and model source are content-bound; generated dependencies are
validated by the build gates. Preparation runs runtime, capsule and image-budget
checks and creates `.prepared-release` with a payload inventory.

A separate restore copy verifies capsule extraction, runtime files, syntax,
portable Node execution and isolated Python imports. It does not run against the
shared database. Preparation alone is not application readiness; use disposable
production-process acceptance before any publication decision.

Only successful preparation replaces the prior prepared release. Failed runs
remain in their own directories for investigation. The `preparing.lock` prevents
concurrent preparations. Inspect its recorded PID and retained run after an
abrupt kill; never remove a live lock. Capacity checks precede copying.

The optional verification/installation helpers reject outdated or modified
prepared payloads. Source changes require preparing again when using those
helpers. Public `VITE_` settings are fingerprinted as digests. Retain the prepared
directory only while using that explicit workflow; it is not required in the
configured Publish snapshot and is not the final runtime payload.

Configured publishing builds its own disposable payload through `build.sh`.
Do not substitute the optional installation helper or run destructive packing
inside the development checkout. Platform dependency provisioning and image
promotion remain separate from a successful local build. Neither path's source
code or documentation constitutes evidence that a deployment succeeded.
