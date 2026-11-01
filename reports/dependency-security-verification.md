# Dependency remediation verification

## Scope of the security result

The whole-project dependency scan returned no dependency advisories after updating
the root, bundled subsystem, and retained-copy manifests and lockfiles. Root
`npm audit --json` also returned zero vulnerabilities. `node-forge` has no patched
release, so its certificate-client dependency path was replaced rather than
suppressed.

The installed **deployment payload** passes
`node scripts/verify-runtime-artifacts.mjs deployment-dependencies`. This checks
all shipped workspaces and only excludes retained copies when their whole-tree
image exclusion is verified.

The broader, intentionally exhaustive **workspace installation** check,
`node scripts/verify-runtime-artifacts.mjs dependencies`, is **not clean**.
It reports 18 pre-existing retained-copy issues outside the listed dependency
families: four displaced `.ignored_*` package copies, nine other stale installed
packages (including a legacy tar stub), and five missing retained-workspace
`node_modules` trees. These are not asserted to be patched installed runtimes.
The retained-copy tracked inputs are updated, and the guarded replay bundle
preserves those updates across a merge; that is a different claim from having
every legacy installation reified.

## Reproducible checks

- `npm run test:dependency-remediation`: HTTP/IP consumers, DNS schema
  validation, installation and replay gates, real certificate/key validation,
  ACME failure paths, and initialization recovery.
- `npm run verify:dependency-upgrades`: existing native-image, archive,
  desktop configuration, Swagger, spreadsheet, and storage-client consumers.
- `uv lock --check`: root and both MaxCore Python projects; equivalent checks
  also passed for both retained Python projects.
- Server and client TypeScript checks passed during remediation.
- The application restarted, `/api/health` returned `{"status":"ok",...}`, and
  the public landing page rendered.

No production deployment or public certificate issuance was performed.
Electron's updated distribution version was checked, but its GUI could not be
launched in this container because the required shared desktop libraries are
absent.