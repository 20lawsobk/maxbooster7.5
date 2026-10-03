# Deployment script comparison

The active application and publishing configuration remain unchanged.

- `historical/`: byte-for-byte scripts from the August 26, 2026 publishing
  checkpoint `b51a8bcb65b3000b0c21cd1009a5fc94f0480853`.
- `current/`: copies of the corresponding active scripts when this comparison
  was created on October 3, 2026.

Each set contains:

- `build.sh`
- `start.sh`
- `script/build.ts`
- `dist/pdim-restore.mjs`
- `scripts/boot-stub-server.mjs`

The matching restore and boot-stub scripts are included to avoid accidentally
testing historical packaging with a different generation of startup helpers.
The historical files are unmodified, including their original fallbacks,
warnings, compression choices, and destructive cleanup.

## Testing against today's Max Booster

**Never run either archived build script from this checkout or directly from
these archive directories.** Historical scripts derive their root from their
location and delete files. These directories contain script sets, not complete
applications or self-contained release packages.

For a controlled comparison:

1. Create two independent disposable copies of today's application, after
   checking available disk and memory. Do not share writable dependencies,
   runtime directories, or output between copies. Do not copy production
   credentials or point a startup test at the shared application database.
2. Keep one copy's current deployment scripts unchanged as the control.
3. In the historical copy, replace the five corresponding files with those
   from `historical/`, preserving their relative paths.
4. Remove prebuilt application bundles and frontend output in the historical
   **copy only** (retain the historical `dist/pdim-restore.mjs`). The historical
   shell script otherwise detects prebuilt output and may skip compilation,
   invalidating a test of today's source against the old compiler script.
5. Leave today's application code, dependencies, and other helpers in place.
   The historical package build command was `npx tsx script/build.ts`; today's
   `node --import tsx script/build.ts` also invokes the overlaid build file.
6. Current publishing build command, only in its disposable copy:
   `bash build.sh --publish-disposable-copy .`
7. Historical shell build command, only in its disposable copy:
   `bash build.sh`
8. The start command for either copy is `bash start.sh`. Run startup tests only
   in separate, isolated environments with test-only service configuration.

Record exit status, elapsed time, image size, emitted server bundles, and real
application readiness separately. An old script's successful exit or root
liveness response does not prove all current application services work.

The checkpoint proves a historical publishing event, not independently verified
healthy operation. Its `.replit` publishing configuration was not retained in
that checkpoint, so this archive does not claim to reconstruct the exact
historical publishing environment.

No build or publication was performed when creating these copies. This path is
under `tests/`, already excluded from the current production payload.