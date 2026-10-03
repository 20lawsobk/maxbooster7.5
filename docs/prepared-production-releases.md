# Prepare once, publish verified artifacts

Before each deployment, run:

```sh
npm run release:prepare
npm run release:verify
```

Preparation creates a fresh isolated build under `.local/prepared-releases`.
It does not run the destructive packer in the development checkout. Source files,
dependency locks and model source are content-bound; generated dependencies are
validated by the existing build gates. The build still runs all dependency/model
checks, pinned runtime preparation, capsule creation and image-budget checks.

The result is `.prepared-release`, containing the exact payload and an inventory.
A separate restore copy verifies capsule extraction, runtime files, syntax,
portable Node execution and isolated Python imports. It deliberately does not
run the application against the shared database. Full application readiness is
reported by the real startup path after publishing.

Only a successful preparation replaces the previous release. Failed runs are
retained under their own directory for investigation. A `preparing.lock` prevents
concurrent preparations. After an abrupt process kill, inspect the recorded PID
and retained run before manually removing a stale lock; never delete a live lock.
Capacity checks fail before copying when the scratch allocation cannot be made.

Press Publish **after** preparation succeeds. Publishing now validates current
source and payload hashes/modes, remeasures the publishing environment's Nix
layer, enforces the unchanged total-image budget, and installs that payload into
the explicitly disposable publishing copy. It does not call npm build, prepare
runtimes, install application packages, or repack capsules.

Missing, outdated or modified releases stop publishing. There is no automatic
rebuild fallback. Source edits after preparation require preparing again.
Public `VITE_` build settings are also fingerprinted; preparation must use the
same intended frontend settings as the publishing environment. Only their digest
is stored, never their values.
Replit-controlled dependency provisioning, security checks and image promotion
remain outside this application build command.

The prepared directory must be present in the workspace snapshot used by Publish.
Do not delete it between preparation and publishing. It is not part of the final
runtime payload. Never invoke the destructive publishing command in the checkout.
The existing strict cache-exclusion check remains; preparing ahead of time is not
proof that a platform cache writer has stopped.