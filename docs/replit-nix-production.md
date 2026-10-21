# Replit Nix production profile

The owner requested restoration of the project's public Replit configuration.
The repository now commits a credential-free `.replit` and matching
`.replit.example`; secrets stay in Replit Secrets. The authoritative current
commands, environment values and deployment checks are documented in
[Replit production deployment](replit-production-deployment.md).

Publishing builds with `bash build.sh` in its disposable build copy and starts
with `bash start.sh`. Use `npm run build` for ordinary source builds. Preserve
existing Secrets and production settings when synchronizing an established
Replit project; commit source changes without resetting live data or private
configuration. Only port 5000 maps publicly to port 80; sidecars stay private.

`replit.nix` retains PostgreSQL 17 tools, Redis, compression/archive utilities,
FFmpeg, fonts and narration tools. Node 22 and Python are provided by the app
modules; the publishing pipeline verifies the portable Node distribution.
Nix closure size and host evaluation still require verification on Replit.

Run `node --test tests/replit-profile.contract.test.mjs tests/replit-configuration.test.mjs`
for configuration and launcher contracts. These checks do not publish the app
or prove a Replit cold startup, inference quality or provider readiness.
